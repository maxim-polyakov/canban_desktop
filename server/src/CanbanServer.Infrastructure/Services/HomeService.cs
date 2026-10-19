using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Projects and goals hub: catalog, followers, contributors, goal hierarchy, links and weekly status updates.</summary>
public class HomeService
{
    public const string Project = "project";
    public const string Goal = "goal";
    public const string Contributor = "contributor";
    public const string Follower = "follower";
    public static readonly string[] Statuses = { "pending", "on_track", "at_risk", "off_track", "paused", "done", "cancelled" };
    private const int MaxTags = 10;
    private const int MaxTagLength = 40;
    private const int MaxDepth = 20;
    public static readonly TimeSpan UpdateInterval = TimeSpan.FromDays(7);

    private readonly CanbanDbContext _db;
    private readonly IProjectAccessService _access;

    public HomeService(CanbanDbContext db, IProjectAccessService access)
    {
        _db = db;
        _access = access;
    }

    private sealed record Viewer(Guid UserId, List<Guid> TeamIds, List<Guid> Colleagues);

    private async Task<Viewer> ViewerAsync(Guid userId, CancellationToken ct)
    {
        var teamIds = await _db.Teams.AsNoTracking()
            .Where(t => t.OwnerId == userId || t.Members.Any(m => m.UserId == userId)).Select(t => t.Id).ToListAsync(ct);
        var members = await _db.TeamMembers.AsNoTracking().Where(m => teamIds.Contains(m.TeamId)).Select(m => m.UserId).ToListAsync(ct);
        var owners = await _db.Teams.AsNoTracking().Where(t => teamIds.Contains(t.Id) && t.OwnerId != null).Select(t => t.OwnerId!.Value).ToListAsync(ct);
        return new Viewer(userId, teamIds, members.Concat(owners).Append(userId).Distinct().ToList());
    }

    private IQueryable<HomeItem> Visible(Viewer v)
    {
        var userId = v.UserId;
        var teamIds = v.TeamIds;
        var colleagues = v.Colleagues;
        var memberOf = _db.HomeItemMembers.Where(m => m.UserId == userId).Select(m => m.ItemId);
        return _db.HomeItems.Where(i =>
            i.OwnerUserId == userId || i.CreatedByUserId == userId || memberOf.Contains(i.Id)
            || (i.TeamId != null && teamIds.Contains(i.TeamId.Value))
            || (!i.IsPrivate && (colleagues.Contains(i.OwnerUserId) || colleagues.Contains(i.CreatedByUserId))));
    }

    public static string NormalizeKind(string? kind) => kind switch
    {
        "project" or "projects" => Project,
        "goal" or "goals" => Goal,
        _ => throw new KeyNotFoundException("Unknown kind"),
    };

    public async Task<List<object>> ListAsync(string kind, Guid userId, bool archived, CancellationToken ct)
    {
        kind = NormalizeKind(kind);
        var viewer = await ViewerAsync(userId, ct);
        var items = await Visible(viewer).AsNoTracking().Where(i => i.Kind == kind && i.IsArchived == archived)
            .OrderBy(i => i.Name).Take(2000).ToListAsync(ct);
        return await SummariesAsync(items, viewer, ct);
    }

    public async Task<object> GetAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        var item = await RequireVisibleAsync(id, viewer, ct);
        var summary = (await SummariesAsync(new List<HomeItem> { item }, viewer, ct))[0];

        var members = await _db.HomeItemMembers.AsNoTracking().Where(m => m.ItemId == id).ToListAsync(ct);
        var linkedIds = item.Kind == Goal
            ? await _db.HomeItemLinks.AsNoTracking().Where(l => l.GoalId == id).Select(l => l.ProjectId).ToListAsync(ct)
            : await _db.HomeItemLinks.AsNoTracking().Where(l => l.ProjectId == id).Select(l => l.GoalId).ToListAsync(ct);
        var visible = Visible(viewer);
        var linked = await visible.AsNoTracking().Where(i => linkedIds.Contains(i.Id)).ToListAsync(ct);
        var children = item.Kind == Goal
            ? await visible.AsNoTracking().Where(i => i.ParentId == id && i.Kind == Goal).ToListAsync(ct)
            : new List<HomeItem>();
        var parent = item.ParentId is Guid pid ? await visible.AsNoTracking().FirstOrDefaultAsync(i => i.Id == pid, ct) : null;
        var updates = await _db.HomeStatusUpdates.AsNoTracking().Where(u => u.ItemId == id)
            .OrderByDescending(u => u.CreatedAt).Take(100).ToListAsync(ct);
        var users = await UsersAsync(members.Select(m => m.UserId).Concat(updates.Select(u => u.AuthorUserId)), ct);
        var work = await WorkAsync(id, userId, ct);

        return new
        {
            item = summary,
            item.Description,
            item.StartDate,
            contributors = members.Where(m => m.Role == Contributor).Select(m => users.GetValueOrDefault(m.UserId)).Where(u => u != null),
            followers = members.Where(m => m.Role == Follower).Select(m => users.GetValueOrDefault(m.UserId)).Where(u => u != null),
            parent = parent == null ? null : Brief(parent),
            children = children.OrderBy(c => c.Name).Select(Brief),
            linked = linked.OrderBy(l => l.Name).Select(Brief),
            updates = updates.Select(u => UpdateView(u, users)),
            work,
            canDelete = item.OwnerUserId == userId || item.CreatedByUserId == userId,
        };
    }

    public async Task<object> CreateAsync(string kind, Guid userId, CreateHomeItemRequest request, CancellationToken ct)
    {
        kind = NormalizeKind(kind);
        var viewer = await ViewerAsync(userId, ct);
        var now = DateTime.UtcNow;
        var item = new HomeItem
        {
            Id = Guid.NewGuid(),
            Kind = kind,
            Name = RequireName(request.Name),
            Description = Clean(request.Description),
            Icon = CleanIcon(request.Icon),
            OwnerUserId = await ResolvePersonAsync(request.OwnerUserId ?? userId, viewer, ct),
            CreatedByUserId = userId,
            TeamId = request.TeamId is Guid teamId ? RequireMyTeam(teamId, viewer) : null,
            StartDate = ToUtc(request.StartDate),
            TargetDate = ToUtc(request.TargetDate),
            Tags = NormalizeTags(request.Tags),
            IsPrivate = request.IsPrivate == true,
            Score = kind == Goal ? 0 : null,
            CreatedAt = now,
            UpdatedAt = now,
        };
        EnsureDates(item.StartDate, item.TargetDate);
        if (request.ParentId is Guid parentId)
        {
            if (kind != Goal) throw new ArgumentException("Only goals can have a parent goal");
            await RequireVisibleKindAsync(parentId, Goal, viewer, ct);
            item.ParentId = parentId;
        }

        AddMember(item, userId, Follower, now);
        if (item.OwnerUserId != userId) AddMember(item, item.OwnerUserId, Follower, now);
        foreach (var contributor in (request.ContributorIds ?? new()).Distinct().Take(50))
            AddMember(item, await ResolvePersonAsync(contributor, viewer, ct), Contributor, now);
        _db.HomeItems.Add(item);

        if (request.GoalId is Guid goalId)
        {
            if (kind != Project) throw new ArgumentException("Only projects can contribute to a goal");
            await RequireVisibleKindAsync(goalId, Goal, viewer, ct);
            _db.HomeItemLinks.Add(new HomeItemLink { GoalId = goalId, ProjectId = item.Id, CreatedAt = now });
        }
        await _db.SaveChangesAsync(ct);
        return await GetAsync(item.Id, userId, ct);
    }

    public async Task<object> UpdateAsync(Guid id, Guid userId, UpdateHomeItemRequest request, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        var item = await RequireEditableAsync(id, viewer, ct);
        if (request.Name != null) item.Name = RequireName(request.Name);
        if (request.Description != null) item.Description = Clean(request.Description);
        if (request.Icon != null) item.Icon = CleanIcon(request.Icon);
        if (request.OwnerUserId is Guid owner && owner != item.OwnerUserId)
        {
            item.OwnerUserId = await ResolvePersonAsync(owner, viewer, ct);
            if (!await _db.HomeItemMembers.AnyAsync(m => m.ItemId == id && m.UserId == owner && m.Role == Follower, ct))
                _db.HomeItemMembers.Add(new HomeItemMember { ItemId = id, UserId = owner, Role = Follower, CreatedAt = DateTime.UtcNow });
        }
        if (request.ClearTeam == true) item.TeamId = null;
        else if (request.TeamId is Guid teamId) item.TeamId = RequireMyTeam(teamId, viewer);
        if (request.ClearParent == true) item.ParentId = null;
        else if (request.ParentId is Guid parentId)
        {
            if (item.Kind != Goal) throw new ArgumentException("Only goals can have a parent goal");
            await RequireVisibleKindAsync(parentId, Goal, viewer, ct);
            await EnsureNoCycleAsync(id, parentId, ct);
            item.ParentId = parentId;
        }
        if (request.ClearStartDate == true) item.StartDate = null;
        else if (request.StartDate.HasValue) item.StartDate = ToUtc(request.StartDate);
        if (request.ClearTargetDate == true) item.TargetDate = null;
        else if (request.TargetDate.HasValue) item.TargetDate = ToUtc(request.TargetDate);
        EnsureDates(item.StartDate, item.TargetDate);
        if (request.Tags != null) item.Tags = NormalizeTags(request.Tags);
        if (request.IsPrivate.HasValue) item.IsPrivate = request.IsPrivate.Value;
        item.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, userId, ct);
    }

    public async Task DeleteAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        var item = await RequireVisibleAsync(id, viewer, ct, tracking: true);
        if (item.OwnerUserId != userId && item.CreatedByUserId != userId)
            throw new UnauthorizedAccessException("Only the owner can delete it");
        _db.HomeItems.Remove(item);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<object> ArchiveAsync(Guid id, Guid userId, bool archived, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        var item = await RequireEditableAsync(id, viewer, ct);
        item.IsArchived = archived;
        item.ArchivedAt = archived ? DateTime.UtcNow : null;
        item.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return await GetAsync(id, userId, ct);
    }

    public async Task FollowAsync(Guid id, Guid userId, bool follow, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        await RequireVisibleAsync(id, viewer, ct);
        var existing = await _db.HomeItemMembers.FirstOrDefaultAsync(m => m.ItemId == id && m.UserId == userId && m.Role == Follower, ct);
        if (follow && existing == null)
            _db.HomeItemMembers.Add(new HomeItemMember { ItemId = id, UserId = userId, Role = Follower, CreatedAt = DateTime.UtcNow });
        else if (!follow && existing != null)
            _db.HomeItemMembers.Remove(existing);
        await _db.SaveChangesAsync(ct);
    }

    public async Task AddContributorAsync(Guid id, Guid userId, Guid contributorId, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        await RequireEditableAsync(id, viewer, ct);
        contributorId = await ResolvePersonAsync(contributorId, viewer, ct);
        if (await _db.HomeItemMembers.AnyAsync(m => m.ItemId == id && m.UserId == contributorId && m.Role == Contributor, ct)) return;
        _db.HomeItemMembers.Add(new HomeItemMember { ItemId = id, UserId = contributorId, Role = Contributor, CreatedAt = DateTime.UtcNow });
        await _db.SaveChangesAsync(ct);
    }

    public async Task RemoveContributorAsync(Guid id, Guid userId, Guid contributorId, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        if (contributorId != userId) await RequireEditableAsync(id, viewer, ct);
        else await RequireVisibleAsync(id, viewer, ct);
        await _db.HomeItemMembers.Where(m => m.ItemId == id && m.UserId == contributorId && m.Role == Contributor).ExecuteDeleteAsync(ct);
    }

    public async Task LinkAsync(Guid id, Guid userId, Guid targetId, bool link, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        var item = await RequireEditableAsync(id, viewer, ct);
        var target = await RequireVisibleAsync(targetId, viewer, ct);
        if (item.Kind == target.Kind) throw new ArgumentException("Link a project to a goal");
        var (goalId, projectId) = item.Kind == Goal ? (item.Id, target.Id) : (target.Id, item.Id);
        var existing = await _db.HomeItemLinks.FirstOrDefaultAsync(l => l.GoalId == goalId && l.ProjectId == projectId, ct);
        if (link && existing == null)
            _db.HomeItemLinks.Add(new HomeItemLink { GoalId = goalId, ProjectId = projectId, CreatedAt = DateTime.UtcNow });
        else if (!link && existing != null)
            _db.HomeItemLinks.Remove(existing);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<object> AddWorkAsync(Guid id, Guid userId, HomeWorkRequest request, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        await RequireEditableAsync(id, viewer, ct);
        var key = request.IssueKey?.Trim().ToUpperInvariant();
        var quest = request.QuestId is Guid questId
            ? await _db.Quests.AsNoTracking().FirstOrDefaultAsync(q => q.Id == questId, ct)
            : !string.IsNullOrEmpty(key) ? await _db.Quests.AsNoTracking().FirstOrDefaultAsync(q => q.IssueKey == key, ct) : null;
        if (quest == null) throw new KeyNotFoundException("Work item not found");
        var (status, _) = await _access.GetQuestAccessAsync(quest.Id, userId, ct);
        if (status != ProjectAccessStatus.Success) throw new KeyNotFoundException("Work item not found");
        if (!await _db.HomeItemWorks.AnyAsync(w => w.ItemId == id && w.QuestId == quest.Id, ct))
        {
            if (await _db.HomeItemWorks.CountAsync(w => w.ItemId == id, ct) >= 200) throw new InvalidOperationException("Too many work items");
            _db.HomeItemWorks.Add(new HomeItemWork { ItemId = id, QuestId = quest.Id, CreatedAt = DateTime.UtcNow });
            await _db.SaveChangesAsync(ct);
        }
        return await WorkAsync(id, userId, ct);
    }

    public async Task RemoveWorkAsync(Guid id, Guid userId, Guid questId, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        await RequireEditableAsync(id, viewer, ct);
        await _db.HomeItemWorks.Where(w => w.ItemId == id && w.QuestId == questId).ExecuteDeleteAsync(ct);
    }

    public async Task<object> AddUpdateAsync(Guid id, Guid userId, HomeStatusUpdateRequest request, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        var item = await RequireEditableAsync(id, viewer, ct);
        var status = request.Status ?? item.Status;
        if (!Statuses.Contains(status)) throw new ArgumentException("Unknown status");
        var summary = (request.Summary ?? "").Trim();
        if (summary.Length == 0) throw new ArgumentException("Write what changed");
        if (summary.Length > 10000) throw new ArgumentException("Update is too long");
        double? score = null;
        if (item.Kind == Goal)
        {
            score = request.Score ?? item.Score ?? 0;
            if (score is < 0 or > 1 || double.IsNaN(score.Value)) throw new ArgumentException("Score must be between 0 and 1");
            score = Math.Round(score.Value, 2);
        }
        var target = request.TargetDate.HasValue ? ToUtc(request.TargetDate) : item.TargetDate;
        EnsureDates(item.StartDate, target);
        var now = DateTime.UtcNow;
        var update = new HomeStatusUpdate
        {
            Id = Guid.NewGuid(),
            ItemId = id,
            AuthorUserId = userId,
            Status = status,
            Score = score,
            TargetDate = target,
            PreviousTargetDate = item.TargetDate,
            PreviousStatus = item.Status,
            Summary = summary,
            CreatedAt = now,
        };
        _db.HomeStatusUpdates.Add(update);
        item.Status = status;
        item.Score = score ?? item.Score;
        item.TargetDate = target;
        item.LastUpdateAt = now;
        item.UpdatedAt = now;
        await _db.SaveChangesAsync(ct);
        var users = await UsersAsync(new[] { userId }, ct);
        return UpdateView(update, users);
    }

    public async Task DeleteUpdateAsync(Guid id, Guid userId, Guid updateId, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        var item = await RequireVisibleAsync(id, viewer, ct, tracking: true);
        var update = await _db.HomeStatusUpdates.FirstOrDefaultAsync(u => u.Id == updateId && u.ItemId == id, ct)
            ?? throw new KeyNotFoundException("Update not found");
        if (update.AuthorUserId != userId && item.OwnerUserId != userId) throw new UnauthorizedAccessException("Only the author can delete the update");
        _db.HomeStatusUpdates.Remove(update);
        item.LastUpdateAt = await _db.HomeStatusUpdates.Where(u => u.ItemId == id && u.Id != updateId)
            .MaxAsync(u => (DateTime?)u.CreatedAt, ct);
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>Status update feed; <paramref name="scope"/> "following" limits it to items the user owns, contributes to or follows.</summary>
    public async Task<object> FeedAsync(Guid userId, string? kind, string? scope, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        var normalizedKind = string.IsNullOrEmpty(kind) ? null : NormalizeKind(kind);
        var items = Visible(viewer).AsNoTracking().Where(i => !i.IsArchived);
        if (normalizedKind != null) items = items.Where(i => i.Kind == normalizedKind);
        if (scope != "all")
        {
            var mine = _db.HomeItemMembers.Where(m => m.UserId == userId).Select(m => m.ItemId);
            items = items.Where(i => i.OwnerUserId == userId || mine.Contains(i.Id));
        }
        var itemIds = items.Select(i => i.Id);
        var updates = await _db.HomeStatusUpdates.AsNoTracking().Where(u => itemIds.Contains(u.ItemId))
            .OrderByDescending(u => u.CreatedAt).Take(200).ToListAsync(ct);
        var updated = updates.Select(u => u.ItemId).Distinct().ToList();
        var dueBefore = DateTime.UtcNow - UpdateInterval;
        var owned = await Visible(viewer).AsNoTracking()
            .Where(i => !i.IsArchived && (i.OwnerUserId == userId || _db.HomeItemMembers.Any(m => m.ItemId == i.Id && m.UserId == userId && m.Role == Contributor))
                        && i.Status != "done" && i.Status != "cancelled" && (i.LastUpdateAt ?? i.CreatedAt) < dueBefore)
            .Where(i => normalizedKind == null || i.Kind == normalizedKind)
            .OrderBy(i => i.Name).Take(100).ToListAsync(ct);
        var related = await _db.HomeItems.AsNoTracking().Where(i => updated.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);
        var users = await UsersAsync(updates.Select(u => u.AuthorUserId), ct);
        return new
        {
            updates = updates.Where(u => related.ContainsKey(u.ItemId))
                .Select(u => new { update = UpdateView(u, users), item = Brief(related[u.ItemId]) }),
            due = owned.Select(Brief),
        };
    }

    public async Task<object> TagsAsync(Guid userId, CancellationToken ct)
    {
        var viewer = await ViewerAsync(userId, ct);
        var tags = await Visible(viewer).AsNoTracking().Where(i => i.Tags != "").Select(i => i.Tags).ToListAsync(ct);
        return tags.SelectMany(ParseTags).GroupBy(t => t, StringComparer.OrdinalIgnoreCase)
            .Select(g => new { tag = g.First(), count = g.Count() }).OrderByDescending(x => x.count).ThenBy(x => x.tag).ToList();
    }

    private async Task<List<object>> SummariesAsync(List<HomeItem> items, Viewer viewer, CancellationToken ct)
    {
        var userId = viewer.UserId;
        var ids = items.Select(i => i.Id).ToList();
        var members = await _db.HomeItemMembers.AsNoTracking().Where(m => ids.Contains(m.ItemId)).ToListAsync(ct);
        var links = await _db.HomeItemLinks.AsNoTracking().Where(l => ids.Contains(l.GoalId) || ids.Contains(l.ProjectId)).ToListAsync(ct);
        var work = await _db.HomeItemWorks.AsNoTracking().Where(w => ids.Contains(w.ItemId))
            .Select(w => new { w.ItemId, Done = w.Quest.Column.Kind == ColumnKind.Done }).ToListAsync(ct);
        var teamIds = items.Where(i => i.TeamId.HasValue).Select(i => i.TeamId!.Value).Distinct().ToList();
        var teams = await _db.Teams.AsNoTracking().Where(t => teamIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, t => t.Name, ct);
        var users = await UsersAsync(items.Select(i => i.OwnerUserId), ct);
        var byItem = members.ToLookup(m => m.ItemId);
        var workByItem = work.ToLookup(w => w.ItemId);
        var dueBefore = DateTime.UtcNow - UpdateInterval;
        return items.Select(i =>
        {
            var itemMembers = byItem[i.Id].ToList();
            var isContributor = itemMembers.Any(m => m.UserId == userId && m.Role == Contributor);
            var itemWork = workByItem[i.Id].ToList();
            return (object)new
            {
                i.Id, i.Kind, i.Name, i.Icon, i.Status, i.Score, i.StartDate, i.TargetDate, i.ParentId, i.IsPrivate, i.IsArchived, i.ArchivedAt,
                i.LastUpdateAt, i.CreatedAt, i.UpdatedAt,
                owner = users.GetValueOrDefault(i.OwnerUserId),
                team = i.TeamId is Guid t && teams.TryGetValue(t, out var teamName) ? new { id = t, name = teamName } : null,
                tags = ParseTags(i.Tags),
                followers = itemMembers.Count(m => m.Role == Follower),
                contributors = itemMembers.Count(m => m.Role == Contributor),
                contributorIds = itemMembers.Where(m => m.Role == Contributor).Select(m => m.UserId),
                isFollowing = itemMembers.Any(m => m.UserId == userId && m.Role == Follower),
                isContributor,
                goalIds = i.Kind == Project ? links.Where(l => l.ProjectId == i.Id).Select(l => l.GoalId) : Enumerable.Empty<Guid>(),
                projectIds = i.Kind == Goal ? links.Where(l => l.GoalId == i.Id).Select(l => l.ProjectId) : Enumerable.Empty<Guid>(),
                workTotal = itemWork.Count,
                workDone = itemWork.Count(w => w.Done),
                updateDue = !i.IsArchived && i.Status != "done" && i.Status != "cancelled" && (i.LastUpdateAt ?? i.CreatedAt) < dueBefore,
                canEdit = CanEdit(i, viewer, isContributor),
            };
        }).ToList();
    }

    private async Task<object> WorkAsync(Guid itemId, Guid userId, CancellationToken ct)
    {
        var rows = await _db.HomeItemWorks.AsNoTracking().Where(w => w.ItemId == itemId)
            .Select(w => new
            {
                w.Quest.Id, w.Quest.IssueKey, w.Quest.Title, w.Quest.IssueType, w.Quest.BoardId, w.Quest.DueDate,
                column = w.Quest.Column.Title, kind = w.Quest.Column.Kind,
            }).ToListAsync(ct);
        var allowed = new Dictionary<Guid, bool>();
        foreach (var boardId in rows.Select(r => r.BoardId).Distinct())
            allowed[boardId] = (await _access.GetBoardAccessAsync(boardId, userId, ct)).Status == ProjectAccessStatus.Success;
        var visible = rows.Where(r => allowed[r.BoardId]).ToList();
        return new
        {
            total = rows.Count,
            done = rows.Count(r => r.kind == ColumnKind.Done),
            items = visible.OrderBy(r => r.kind == ColumnKind.Done).ThenBy(r => r.IssueKey).Select(r => new
            {
                r.Id, r.IssueKey, r.Title, issueType = (int)r.IssueType, r.BoardId, r.DueDate, status = r.column,
                statusCategory = r.kind == ColumnKind.Done ? "done" : r.kind == ColumnKind.Backlog ? "todo" : "progress",
            }),
        };
    }

    private static object Brief(HomeItem i) => new { i.Id, i.Kind, i.Name, i.Icon, i.Status, i.Score, i.TargetDate, i.IsArchived };

    private static object UpdateView(HomeStatusUpdate u, Dictionary<Guid, object> users) => new
    {
        u.Id, u.ItemId, u.Status, u.PreviousStatus, u.Score, u.TargetDate, u.PreviousTargetDate, u.Summary, u.CreatedAt,
        author = users.GetValueOrDefault(u.AuthorUserId),
    };

    private static bool CanEdit(HomeItem i, Viewer v, bool isContributor) =>
        i.OwnerUserId == v.UserId || i.CreatedByUserId == v.UserId || isContributor
        || (i.TeamId is Guid t && v.TeamIds.Contains(t));

    private async Task<HomeItem> RequireVisibleAsync(Guid id, Viewer viewer, CancellationToken ct, bool tracking = false)
    {
        var query = Visible(viewer).Where(i => i.Id == id);
        var item = await (tracking ? query : query.AsNoTracking()).FirstOrDefaultAsync(ct);
        if (item != null) return item;
        throw await _db.HomeItems.AnyAsync(i => i.Id == id, ct)
            ? new UnauthorizedAccessException("No access")
            : new KeyNotFoundException("Not found");
    }

    private async Task RequireVisibleKindAsync(Guid id, string kind, Viewer viewer, CancellationToken ct)
    {
        var item = await RequireVisibleAsync(id, viewer, ct);
        if (item.Kind != kind) throw new ArgumentException(kind == Goal ? "Choose a goal" : "Choose a project");
    }

    private async Task<HomeItem> RequireEditableAsync(Guid id, Viewer viewer, CancellationToken ct)
    {
        var item = await RequireVisibleAsync(id, viewer, ct, tracking: true);
        var isContributor = await _db.HomeItemMembers.AnyAsync(m => m.ItemId == id && m.UserId == viewer.UserId && m.Role == Contributor, ct);
        if (!CanEdit(item, viewer, isContributor)) throw new UnauthorizedAccessException("Only the owner and contributors can change it");
        return item;
    }

    private async Task EnsureNoCycleAsync(Guid id, Guid parentId, CancellationToken ct)
    {
        Guid? current = parentId;
        for (var depth = 0; current is Guid c; depth++)
        {
            if (c == id) throw new ArgumentException("A goal cannot be its own sub-goal");
            if (depth >= MaxDepth) throw new ArgumentException("Goal hierarchy is too deep");
            current = await _db.HomeItems.AsNoTracking().Where(i => i.Id == c).Select(i => i.ParentId).FirstOrDefaultAsync(ct);
        }
    }

    private async Task<Guid> ResolvePersonAsync(Guid personId, Viewer viewer, CancellationToken ct)
    {
        if (!viewer.Colleagues.Contains(personId)) throw new ArgumentException("Choose someone from your teams");
        if (!await _db.Users.AnyAsync(u => u.Id == personId, ct)) throw new KeyNotFoundException("User not found");
        return personId;
    }

    private static Guid RequireMyTeam(Guid teamId, Viewer viewer) =>
        viewer.TeamIds.Contains(teamId) ? teamId : throw new ArgumentException("Choose one of your teams");

    private static void AddMember(HomeItem item, Guid userId, string role, DateTime now)
    {
        if (item.Members.Any(m => m.UserId == userId && m.Role == role)) return;
        item.Members.Add(new HomeItemMember { ItemId = item.Id, UserId = userId, Role = role, CreatedAt = now });
    }

    private async Task<Dictionary<Guid, object>> UsersAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToList();
        return await _db.Users.AsNoTracking().Where(u => list.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => (object)new { id = u.Id, displayName = u.DisplayName, avatarUrl = u.AvatarUrl }, ct);
    }

    private static void EnsureDates(DateTime? start, DateTime? target)
    {
        if (start.HasValue && target.HasValue && start > target) throw new ArgumentException("Start date must be before the target date");
    }

    public static string NormalizeTags(IEnumerable<string>? tags)
    {
        var result = new List<string>();
        foreach (var raw in tags ?? Enumerable.Empty<string>())
        {
            var tag = string.Join(' ', (raw ?? "").Replace(",", " ").Split(' ', StringSplitOptions.RemoveEmptyEntries)).Trim().TrimStart('#');
            if (tag.Length == 0) continue;
            if (tag.Length > MaxTagLength) tag = tag[..MaxTagLength];
            if (result.Any(t => string.Equals(t, tag, StringComparison.OrdinalIgnoreCase))) continue;
            result.Add(tag);
            if (result.Count == MaxTags) break;
        }
        return string.Join(',', result);
    }

    public static List<string> ParseTags(string? tags) => (tags ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();

    private static string RequireName(string? name)
    {
        var value = (name ?? "").Trim();
        if (value.Length == 0) throw new ArgumentException("Name is required");
        if (value.Length > 200) throw new ArgumentException("Name is too long");
        return value;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string CleanIcon(string? icon)
    {
        var value = (icon ?? "").Trim();
        return value.Length <= 16 ? value : "";
    }

    private static DateTime? ToUtc(DateTime? value) => value?.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.Value.ToUniversalTime(),
        _ => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : null,
    };
}
