using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Advanced planning: plans over several spaces with teams, capacity, scenarios and dependencies.</summary>
public class PlanService
{
    private const int MaxItems = 2000;
    private const int MaxSources = 50;
    private static readonly string[] AccessLevels = { "private", "open" };
    private static readonly string[] ScenarioColors = { "#0c66e4", "#6e5dc6", "#1f845a", "#a54800", "#ae2e24", "#206a83" };

    private readonly CanbanDbContext _db;
    private readonly IProjectAccessService _access;
    private readonly IJqlQueryService _jql;

    public PlanService(CanbanDbContext db, IProjectAccessService access, IJqlQueryService jql)
    {
        _db = db;
        _access = access;
        _jql = jql;
    }

    public async Task<List<object>> ListAsync(Guid userId, CancellationToken ct)
    {
        var plans = await _db.Plans.AsNoTracking()
            .Where(p => p.OwnerUserId == userId || p.Access == "open")
            .OrderByDescending(p => p.UpdatedAt)
            .Select(p => new { p.Id, p.Name, p.Description, p.Access, p.OwnerUserId, p.UpdatedAt, p.CreatedAt, Sources = p.Sources.Count, Teams = p.Teams.Count })
            .ToListAsync(ct);
        var owners = await UserNamesAsync(plans.Select(p => p.OwnerUserId), ct);
        return plans.Select(p => (object)new
        {
            p.Id, p.Name, p.Description, p.Access, p.OwnerUserId, ownerName = owners.GetValueOrDefault(p.OwnerUserId),
            p.UpdatedAt, p.CreatedAt, sources = p.Sources, teams = p.Teams, canEdit = p.OwnerUserId == userId,
        }).ToList();
    }

    public async Task<object> CreateAsync(Guid userId, CreatePlanRequest request, CancellationToken ct)
    {
        var name = RequireName(request.Name);
        var sources = await ValidateSourcesAsync(request.Sources ?? new(), userId, ct);
        if (sources.Count == 0) throw new ArgumentException("Add at least one source: a space or a filter");
        var now = DateTime.UtcNow;
        var plan = new Plan
        {
            Id = Guid.NewGuid(),
            OwnerUserId = userId,
            Name = name,
            Description = Clean(request.Description),
            Access = NormalizeAccess(request.Access),
            ExcludeDoneAfterDays = request.ExcludeDoneAfterDays is int days ? Math.Clamp(days, 0, 3650) : null,
            ExcludedIssueTypes = NormalizeIssueTypes(request.ExcludedIssueTypes),
            CreatedAt = now,
            UpdatedAt = now,
        };
        foreach (var source in sources) { source.PlanId = plan.Id; plan.Sources.Add(source); }
        plan.Scenarios.Add(new PlanScenario { Id = Guid.NewGuid(), PlanId = plan.Id, Name = "Базовый сценарий", Color = ScenarioColors[0], IsDefault = true, CreatedAt = now });

        var boardIds = sources.Where(s => s.BoardId.HasValue).Select(s => s.BoardId!.Value).ToList();
        var teams = await _db.Boards.AsNoTracking().Where(b => boardIds.Contains(b.Id))
            .Select(b => new { b.TeamId, b.Team.Name }).Distinct().ToListAsync(ct);
        var position = 0;
        foreach (var team in teams)
            plan.Teams.Add(new PlanTeam { Id = Guid.NewGuid(), PlanId = plan.Id, Name = team.Name, TeamId = team.TeamId, Position = position++ });

        _db.Plans.Add(plan);
        await _db.SaveChangesAsync(ct);
        return await GetAsync(plan.Id, userId, ct);
    }

    public async Task<object> GetAsync(Guid planId, Guid userId, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanView(plan, userId);
        var boardIds = plan.Sources.Where(s => s.BoardId.HasValue).Select(s => s.BoardId!.Value).ToList();
        var filterIds = plan.Sources.Where(s => s.FilterId.HasValue).Select(s => s.FilterId!.Value).ToList();
        var boards = await _db.Boards.AsNoTracking().Where(b => boardIds.Contains(b.Id)).ToDictionaryAsync(b => b.Id, ct);
        var filters = await _db.SavedFilters.AsNoTracking().Where(f => filterIds.Contains(f.Id)).ToDictionaryAsync(f => f.Id, ct);
        var owners = await UserNamesAsync(new[] { plan.OwnerUserId }, ct);
        var excludedIds = plan.Exclusions.Select(e => e.QuestId).ToList();
        var excludedQuests = await _db.Quests.AsNoTracking().Where(q => excludedIds.Contains(q.Id))
            .Select(q => new { q.Id, q.IssueKey, q.Title, q.BoardId, q.IssueType }).ToListAsync(ct);
        var scenarioIds = plan.Scenarios.Select(s => s.Id).ToList();
        var changeCounts = await _db.PlanScheduleItems.AsNoTracking().Where(i => scenarioIds.Contains(i.ScenarioId))
            .GroupBy(i => i.ScenarioId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        return new
        {
            plan.Id, plan.Name, plan.Description, plan.Access, plan.OwnerUserId, ownerName = owners.GetValueOrDefault(plan.OwnerUserId),
            plan.ExcludeDoneAfterDays,
            excludedIssueTypes = ParseIssueTypes(plan.ExcludedIssueTypes),
            plan.CreatedAt, plan.UpdatedAt,
            canEdit = plan.OwnerUserId == userId,
            sources = plan.Sources.Select(s => new
            {
                s.Id, s.Kind, s.BoardId, s.FilterId,
                name = s.BoardId is Guid b ? boards.GetValueOrDefault(b)?.Name : s.FilterId is Guid f ? filters.GetValueOrDefault(f)?.Name : null,
                key = s.BoardId is Guid bk ? boards.GetValueOrDefault(bk)?.KeyPrefix : null,
                jql = s.FilterId is Guid fj ? filters.GetValueOrDefault(fj)?.Jql : null,
            }),
            teams = plan.Teams.OrderBy(t => t.Position).Select(t => new { t.Id, t.Name, t.TeamId, t.Capacity, t.IterationDays, t.Position }),
            scenarios = plan.Scenarios.OrderByDescending(s => s.IsDefault).ThenBy(s => s.CreatedAt)
                .Select(s => new { s.Id, s.Name, s.Color, s.IsDefault, changes = changeCounts.GetValueOrDefault(s.Id) }),
            exclusions = excludedQuests,
        };
    }

    public async Task<object> UpdateAsync(Guid planId, Guid userId, UpdatePlanRequest request, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct, tracking: true);
        EnsureCanEdit(plan, userId);
        if (request.Name != null) plan.Name = RequireName(request.Name);
        if (request.Description != null) plan.Description = Clean(request.Description);
        if (request.Access != null) plan.Access = NormalizeAccess(request.Access);
        if (request.ShowAllDone == true) plan.ExcludeDoneAfterDays = null;
        else if (request.ExcludeDoneAfterDays is int days) plan.ExcludeDoneAfterDays = Math.Clamp(days, 0, 3650);
        if (request.ExcludedIssueTypes != null) plan.ExcludedIssueTypes = NormalizeIssueTypes(request.ExcludedIssueTypes);
        if (request.Sources != null)
        {
            var sources = await ValidateSourcesAsync(request.Sources, userId, ct);
            if (sources.Count == 0) throw new ArgumentException("Add at least one source: a space or a filter");
            _db.PlanSources.RemoveRange(plan.Sources);
            foreach (var source in sources) { source.PlanId = plan.Id; _db.PlanSources.Add(source); }
        }
        plan.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return await GetAsync(planId, userId, ct);
    }

    public async Task DeleteAsync(Guid planId, Guid userId, CancellationToken ct)
    {
        var plan = await _db.Plans.FirstOrDefaultAsync(p => p.Id == planId, ct) ?? throw new KeyNotFoundException("Plan not found");
        EnsureCanEdit(plan, userId);
        _db.Plans.Remove(plan);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<object> AddTeamAsync(Guid planId, Guid userId, PlanTeamRequest request, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanEdit(plan, userId);
        if (request.TeamId is Guid teamId) await EnsureTeamVisibleAsync(teamId, userId, ct);
        var team = new PlanTeam
        {
            Id = Guid.NewGuid(),
            PlanId = planId,
            Name = RequireName(request.Name),
            TeamId = request.TeamId,
            Capacity = Math.Clamp(request.Capacity ?? 30, 0, 10000),
            IterationDays = Math.Clamp(request.IterationDays ?? 14, 1, 90),
            Position = plan.Teams.Count == 0 ? 0 : plan.Teams.Max(t => t.Position) + 1,
        };
        _db.PlanTeams.Add(team);
        await TouchAsync(planId, ct);
        return new { team.Id, team.Name, team.TeamId, team.Capacity, team.IterationDays, team.Position };
    }

    public async Task<object> UpdateTeamAsync(Guid planId, Guid teamId, Guid userId, PlanTeamRequest request, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanEdit(plan, userId);
        var team = await _db.PlanTeams.FirstOrDefaultAsync(t => t.Id == teamId && t.PlanId == planId, ct) ?? throw new KeyNotFoundException("Plan team not found");
        if (!string.IsNullOrWhiteSpace(request.Name)) team.Name = RequireName(request.Name);
        if (request.TeamId is Guid linked && linked != team.TeamId) { await EnsureTeamVisibleAsync(linked, userId, ct); team.TeamId = linked; }
        if (request.Capacity is int capacity) team.Capacity = Math.Clamp(capacity, 0, 10000);
        if (request.IterationDays is int iteration) team.IterationDays = Math.Clamp(iteration, 1, 90);
        await TouchAsync(planId, ct);
        return new { team.Id, team.Name, team.TeamId, team.Capacity, team.IterationDays, team.Position };
    }

    public async Task DeleteTeamAsync(Guid planId, Guid teamId, Guid userId, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanEdit(plan, userId);
        var team = await _db.PlanTeams.FirstOrDefaultAsync(t => t.Id == teamId && t.PlanId == planId, ct) ?? throw new KeyNotFoundException("Plan team not found");
        _db.PlanTeams.Remove(team);
        await TouchAsync(planId, ct);
    }

    public async Task<object> AddScenarioAsync(Guid planId, Guid userId, PlanScenarioRequest request, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanEdit(plan, userId);
        if (plan.Scenarios.Count >= 10) throw new InvalidOperationException("A plan can have at most 10 scenarios");
        var scenario = new PlanScenario
        {
            Id = Guid.NewGuid(),
            PlanId = planId,
            Name = RequireName(request.Name),
            Color = NormalizeColor(request.Color) ?? ScenarioColors[plan.Scenarios.Count % ScenarioColors.Length],
            CreatedAt = DateTime.UtcNow,
        };
        _db.PlanScenarios.Add(scenario);
        if (request.CopyFromScenarioId is Guid sourceId)
        {
            if (plan.Scenarios.All(s => s.Id != sourceId)) throw new ArgumentException("Scenario to copy is not part of this plan");
            var items = await _db.PlanScheduleItems.AsNoTracking().Where(i => i.ScenarioId == sourceId).ToListAsync(ct);
            _db.PlanScheduleItems.AddRange(items.Select(i => new PlanScheduleItem
            {
                ScenarioId = scenario.Id, QuestId = i.QuestId, StartDate = i.StartDate, DueDate = i.DueDate, PlanTeamId = i.PlanTeamId, UpdatedAt = DateTime.UtcNow,
            }));
        }
        await TouchAsync(planId, ct);
        return new { scenario.Id, scenario.Name, scenario.Color, scenario.IsDefault };
    }

    public async Task<object> UpdateScenarioAsync(Guid planId, Guid scenarioId, Guid userId, PlanScenarioRequest request, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanEdit(plan, userId);
        var scenario = await _db.PlanScenarios.FirstOrDefaultAsync(s => s.Id == scenarioId && s.PlanId == planId, ct) ?? throw new KeyNotFoundException("Scenario not found");
        if (!string.IsNullOrWhiteSpace(request.Name)) scenario.Name = RequireName(request.Name);
        if (NormalizeColor(request.Color) is string color) scenario.Color = color;
        await TouchAsync(planId, ct);
        return new { scenario.Id, scenario.Name, scenario.Color, scenario.IsDefault };
    }

    public async Task DeleteScenarioAsync(Guid planId, Guid scenarioId, Guid userId, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanEdit(plan, userId);
        var scenario = await _db.PlanScenarios.FirstOrDefaultAsync(s => s.Id == scenarioId && s.PlanId == planId, ct) ?? throw new KeyNotFoundException("Scenario not found");
        if (scenario.IsDefault) throw new InvalidOperationException("The baseline scenario cannot be deleted");
        _db.PlanScenarios.Remove(scenario);
        await TouchAsync(planId, ct);
    }

    public async Task<object> TimelineAsync(Guid planId, Guid? scenarioId, Guid userId, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanView(plan, userId);
        var scenario = scenarioId is Guid sid
            ? plan.Scenarios.FirstOrDefault(s => s.Id == sid) ?? throw new KeyNotFoundException("Scenario not found")
            : plan.Scenarios.FirstOrDefault(s => s.IsDefault) ?? plan.Scenarios.First();

        var questIds = await CollectQuestIdsAsync(plan, userId, ct);
        var excluded = plan.Exclusions.Select(e => e.QuestId).ToHashSet();
        var hiddenTypes = ParseIssueTypes(plan.ExcludedIssueTypes).Select(t => (IssueType)t).ToHashSet();
        var doneCutoff = plan.ExcludeDoneAfterDays is int days ? DateTime.UtcNow.AddDays(-days) : (DateTime?)null;

        var quests = await _db.Quests.AsNoTracking()
            .Include(q => q.Column).Include(q => q.Board).Include(q => q.Sprint).Include(q => q.Assignee)
            .Where(q => questIds.Contains(q.Id) && q.Column.Kind != ColumnKind.Archive)
            .ToListAsync(ct);
        var excludedCount = 0;
        quests = quests.Where(q =>
        {
            var hide = excluded.Contains(q.Id) || hiddenTypes.Contains(q.IssueType)
                || (doneCutoff.HasValue && q.Column.Kind == ColumnKind.Done && (q.CompletedAt ?? q.CreatedAt) < doneCutoff.Value);
            if (hide) excludedCount++;
            return !hide;
        }).Take(MaxItems).ToList();

        var ids = quests.Select(q => q.Id).ToHashSet();
        var schedule = await _db.PlanScheduleItems.AsNoTracking().Where(i => i.ScenarioId == scenario.Id).ToDictionaryAsync(i => i.QuestId, ct);
        var teamsByCanbanTeam = plan.Teams.Where(t => t.TeamId.HasValue).GroupBy(t => t.TeamId!.Value).ToDictionary(g => g.Key, g => g.OrderBy(t => t.Position).First().Id);
        var releaseLinks = await _db.QuestReleases.AsNoTracking().Where(r => ids.Contains(r.QuestId)).ToListAsync(ct);
        var releasesByQuest = releaseLinks.GroupBy(r => r.QuestId).ToDictionary(g => g.Key, g => g.Select(r => r.ReleaseId).ToList());

        var items = quests.Select(q =>
        {
            schedule.TryGetValue(q.Id, out var change);
            var teamId = change?.PlanTeamId ?? (teamsByCanbanTeam.TryGetValue(q.Board.TeamId, out var t) ? t : (Guid?)null);
            return new
            {
                q.Id, q.IssueKey, q.Title, q.IssueType, q.Priority, q.BoardId, boardKey = q.Board.KeyPrefix, boardName = q.Board.Name,
                parentId = q.ParentQuestId ?? q.ParentEpicId,
                status = q.Column.Title,
                statusCategory = q.Column.Kind == ColumnKind.Done ? "done" : q.Column.Kind == ColumnKind.Backlog ? "todo" : "progress",
                q.StoryPoints, assigneeName = q.Assignee?.DisplayName, q.AssigneeId,
                startDate = change?.StartDate,
                dueDate = change?.DueDate ?? q.DueDate,
                originalDueDate = q.DueDate,
                changed = change != null && (change.StartDate.HasValue || (change.DueDate.HasValue && change.DueDate != q.DueDate) || change.PlanTeamId.HasValue),
                planTeamId = teamId,
                q.SprintId, sprintName = q.Sprint?.Name,
                releaseIds = releasesByQuest.GetValueOrDefault(q.Id) ?? new List<Guid>(),
                q.CreatedAt, q.CompletedAt,
            };
        }).ToList();

        var links = await _db.QuestLinks.AsNoTracking()
            .Where(l => (l.Type == QuestLinkType.Blocks || l.Type == QuestLinkType.DependsOn) && ids.Contains(l.SourceQuestId) && ids.Contains(l.TargetQuestId))
            .ToListAsync(ct);
        var dependencies = links.Select(l => l.Type == QuestLinkType.Blocks
            ? new { l.Id, blockerId = l.SourceQuestId, blockedId = l.TargetQuestId }
            : new { l.Id, blockerId = l.TargetQuestId, blockedId = l.SourceQuestId }).ToList();

        var boardIds = quests.Select(q => q.BoardId).Concat(plan.Sources.Where(s => s.BoardId.HasValue).Select(s => s.BoardId!.Value)).Distinct().ToList();
        var releases = await _db.BoardReleases.AsNoTracking()
            .Where(r => boardIds.Contains(r.BoardId) && r.Status != ReleaseStatus.Archived)
            .OrderBy(r => r.ReleaseDate)
            .Select(r => new { r.Id, r.BoardId, r.Name, r.Status, r.StartDate, r.ReleaseDate })
            .ToListAsync(ct);
        var sprints = await _db.Sprints.AsNoTracking()
            .Where(s => boardIds.Contains(s.BoardId) && s.StartDate != null && s.EndDate != null)
            .Select(s => new { s.Id, s.BoardId, s.Name, s.Status, s.StartDate, s.EndDate })
            .ToListAsync(ct);
        var boards = await _db.Boards.AsNoTracking().Where(b => boardIds.Contains(b.Id))
            .Select(b => new { b.Id, b.Name, key = b.KeyPrefix, b.TeamId }).ToListAsync(ct);

        return new
        {
            scenarioId = scenario.Id,
            items,
            dependencies,
            releases,
            sprints,
            boards,
            excludedCount,
            truncated = questIds.Count > MaxItems,
        };
    }

    public async Task<object> ScheduleAsync(Guid planId, Guid scenarioId, Guid questId, Guid userId, PlanScheduleRequest request, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanEdit(plan, userId);
        if (plan.Scenarios.All(s => s.Id != scenarioId)) throw new KeyNotFoundException("Scenario not found");
        await EnsureQuestAccessAsync(questId, userId, BoardPermission.View, ct);
        if (request.StartDate.HasValue && request.DueDate.HasValue && request.StartDate > request.DueDate)
            throw new ArgumentException("Start date must be before the due date");
        if (request.PlanTeamId is Guid teamId && plan.Teams.All(t => t.Id != teamId)) throw new ArgumentException("Team is not part of this plan");

        var item = await _db.PlanScheduleItems.FirstOrDefaultAsync(i => i.ScenarioId == scenarioId && i.QuestId == questId, ct);
        if (item == null)
        {
            item = new PlanScheduleItem { ScenarioId = scenarioId, QuestId = questId };
            _db.PlanScheduleItems.Add(item);
        }
        if (request.StartDate.HasValue) item.StartDate = ToUtc(request.StartDate);
        if (request.DueDate.HasValue) item.DueDate = ToUtc(request.DueDate);
        if (request.ClearTeam) item.PlanTeamId = null;
        else if (request.PlanTeamId.HasValue) item.PlanTeamId = request.PlanTeamId;
        item.UpdatedAt = DateTime.UtcNow;
        await TouchAsync(planId, ct);
        return new { item.QuestId, item.StartDate, item.DueDate, item.PlanTeamId };
    }

    public async Task ResetScheduleAsync(Guid planId, Guid scenarioId, Guid questId, Guid userId, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanEdit(plan, userId);
        if (plan.Scenarios.All(s => s.Id != scenarioId)) throw new KeyNotFoundException("Scenario not found");
        var item = await _db.PlanScheduleItems.FirstOrDefaultAsync(i => i.ScenarioId == scenarioId && i.QuestId == questId, ct);
        if (item == null) return;
        _db.PlanScheduleItems.Remove(item);
        await TouchAsync(planId, ct);
    }

    /// <summary>Writes the scenario's due dates to the real issues the user may edit.</summary>
    public async Task<object> ApplyScenarioAsync(Guid planId, Guid scenarioId, Guid userId, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanEdit(plan, userId);
        if (plan.Scenarios.All(s => s.Id != scenarioId)) throw new KeyNotFoundException("Scenario not found");
        var items = await _db.PlanScheduleItems.Where(i => i.ScenarioId == scenarioId && i.DueDate != null).ToListAsync(ct);
        var questIds = items.Select(i => i.QuestId).ToList();
        var quests = await _db.Quests.Where(q => questIds.Contains(q.Id)).ToDictionaryAsync(q => q.Id, ct);
        var permissions = new Dictionary<Guid, bool>();
        int applied = 0, skipped = 0;
        var now = DateTime.UtcNow;
        foreach (var item in items)
        {
            if (!quests.TryGetValue(item.QuestId, out var quest)) continue;
            if (!permissions.TryGetValue(quest.BoardId, out var canWork))
            {
                var access = await _access.GetBoardAccessAsync(quest.BoardId, userId, ct);
                canWork = access.Status == ProjectAccessStatus.Success && access.Permission >= BoardPermission.Work;
                permissions[quest.BoardId] = canWork;
            }
            if (!canWork) { skipped++; continue; }
            if (quest.DueDate != item.DueDate)
            {
                _db.QuestChanges.Add(new QuestChange
                {
                    Id = Guid.NewGuid(), QuestId = quest.Id, UserId = userId, ChangeType = "updated", Field = "dueDate",
                    OldValue = quest.DueDate?.ToString("yyyy-MM-dd"), NewValue = item.DueDate?.ToString("yyyy-MM-dd"), CreatedAt = now,
                });
                quest.DueDate = item.DueDate;
                applied++;
            }
            item.DueDate = null;
            if (item.StartDate == null && item.PlanTeamId == null) _db.PlanScheduleItems.Remove(item);
        }
        await TouchAsync(planId, ct);
        return new { applied, skipped };
    }

    public async Task AddExclusionAsync(Guid planId, Guid questId, Guid userId, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanEdit(plan, userId);
        if (plan.Exclusions.Any(e => e.QuestId == questId)) return;
        await EnsureQuestAccessAsync(questId, userId, BoardPermission.View, ct);
        _db.PlanExclusions.Add(new PlanExclusion { PlanId = planId, QuestId = questId });
        await TouchAsync(planId, ct);
    }

    public async Task RemoveExclusionAsync(Guid planId, Guid questId, Guid userId, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanEdit(plan, userId);
        var exclusion = await _db.PlanExclusions.FirstOrDefaultAsync(e => e.PlanId == planId && e.QuestId == questId, ct);
        if (exclusion == null) return;
        _db.PlanExclusions.Remove(exclusion);
        await TouchAsync(planId, ct);
    }

    public async Task<object> AddDependencyAsync(Guid planId, Guid userId, PlanDependencyRequest request, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanEdit(plan, userId);
        if (request.BlockerQuestId == request.BlockedQuestId) throw new ArgumentException("An item cannot depend on itself");
        await EnsureQuestAccessAsync(request.BlockerQuestId, userId, BoardPermission.Work, ct);
        await EnsureQuestAccessAsync(request.BlockedQuestId, userId, BoardPermission.View, ct);
        var exists = await _db.QuestLinks.AnyAsync(l =>
            (l.Type == QuestLinkType.Blocks && l.SourceQuestId == request.BlockerQuestId && l.TargetQuestId == request.BlockedQuestId) ||
            (l.Type == QuestLinkType.DependsOn && l.SourceQuestId == request.BlockedQuestId && l.TargetQuestId == request.BlockerQuestId), ct);
        if (exists) throw new InvalidOperationException("This dependency already exists");
        var link = new QuestLink
        {
            Id = Guid.NewGuid(), SourceQuestId = request.BlockerQuestId, TargetQuestId = request.BlockedQuestId,
            Type = QuestLinkType.Blocks, CreatedAt = DateTime.UtcNow, CreatedByUserId = userId,
        };
        _db.QuestLinks.Add(link);
        await TouchAsync(planId, ct);
        return new { link.Id, blockerId = link.SourceQuestId, blockedId = link.TargetQuestId };
    }

    public async Task RemoveDependencyAsync(Guid planId, Guid linkId, Guid userId, CancellationToken ct)
    {
        var plan = await LoadPlanAsync(planId, ct);
        EnsureCanEdit(plan, userId);
        var link = await _db.QuestLinks.FirstOrDefaultAsync(l => l.Id == linkId, ct) ?? throw new KeyNotFoundException("Dependency not found");
        await EnsureQuestAccessAsync(link.SourceQuestId, userId, BoardPermission.Work, ct);
        _db.QuestLinks.Remove(link);
        await TouchAsync(planId, ct);
    }

    private async Task<HashSet<Guid>> CollectQuestIdsAsync(Plan plan, Guid userId, CancellationToken ct)
    {
        var ids = new HashSet<Guid>();
        var boardIds = new List<Guid>();
        foreach (var boardId in plan.Sources.Where(s => s.BoardId.HasValue).Select(s => s.BoardId!.Value).Distinct())
        {
            var access = await _access.GetBoardAccessAsync(boardId, userId, ct);
            if (access.Status == ProjectAccessStatus.Success) boardIds.Add(boardId);
        }
        if (boardIds.Count > 0)
            ids.UnionWith(await _db.Quests.AsNoTracking().Where(q => boardIds.Contains(q.BoardId)).Select(q => q.Id).Take(MaxItems + 1).ToListAsync(ct));

        var filterIds = plan.Sources.Where(s => s.FilterId.HasValue).Select(s => s.FilterId!.Value).ToList();
        var filters = await _db.SavedFilters.AsNoTracking().Where(f => filterIds.Contains(f.Id) && (f.OwnerUserId == userId || f.Shared)).ToListAsync(ct);
        foreach (var filter in filters)
        {
            for (var page = 1; page <= MaxItems / 200 && ids.Count <= MaxItems; page++)
            {
                JqlSearchResult result;
                try { result = await _jql.SearchAsync(filter.Jql, userId, page, 200, filter.BoardId, ct); }
                catch (Exception e) when (e is ArgumentException or FormatException or InvalidOperationException) { break; }
                ids.UnionWith(result.Items.Select(i => i.Id));
                if (page * result.PageSize >= result.Total) break;
            }
        }
        return ids;
    }

    private async Task<List<PlanSource>> ValidateSourcesAsync(List<PlanSourceRequest> requests, Guid userId, CancellationToken ct)
    {
        if (requests.Count > MaxSources) throw new ArgumentException($"A plan can have at most {MaxSources} sources");
        var result = new List<PlanSource>();
        foreach (var request in requests)
        {
            var kind = (request.Kind ?? "").Trim().ToLowerInvariant();
            if (kind == "board" && request.BoardId is Guid boardId)
            {
                if (result.Any(s => s.BoardId == boardId)) continue;
                var access = await _access.GetBoardAccessAsync(boardId, userId, ct);
                if (access.Status == ProjectAccessStatus.NotFound) throw new ArgumentException("Space not found");
                if (access.Status != ProjectAccessStatus.Success) throw new UnauthorizedAccessException("No access to the space");
                result.Add(new PlanSource { Id = Guid.NewGuid(), Kind = "board", BoardId = boardId });
            }
            else if (kind == "filter" && request.FilterId is Guid filterId)
            {
                if (result.Any(s => s.FilterId == filterId)) continue;
                var filter = await _db.SavedFilters.AsNoTracking().FirstOrDefaultAsync(f => f.Id == filterId, ct) ?? throw new ArgumentException("Filter not found");
                if (filter.OwnerUserId != userId && !filter.Shared) throw new UnauthorizedAccessException("No access to the filter");
                result.Add(new PlanSource { Id = Guid.NewGuid(), Kind = "filter", FilterId = filterId });
            }
            else throw new ArgumentException("Source must be a space or a saved filter");
        }
        return result;
    }

    private async Task EnsureQuestAccessAsync(Guid questId, Guid userId, BoardPermission needed, CancellationToken ct)
    {
        var access = await _access.GetQuestAccessAsync(questId, userId, ct);
        if (access.Status == ProjectAccessStatus.NotFound) throw new KeyNotFoundException("Work item not found");
        if (access.Status != ProjectAccessStatus.Success || access.Permission < needed) throw new UnauthorizedAccessException("No access to the work item");
    }

    private async Task EnsureTeamVisibleAsync(Guid teamId, Guid userId, CancellationToken ct)
    {
        var access = await _access.GetTeamAccessAsync(teamId, userId, ct);
        if (access.Status == ProjectAccessStatus.NotFound) throw new ArgumentException("Team not found");
        if (access.Status != ProjectAccessStatus.Success) throw new UnauthorizedAccessException("No access to the team");
    }

    private async Task<Plan> LoadPlanAsync(Guid planId, CancellationToken ct, bool tracking = false)
    {
        var query = _db.Plans.Include(p => p.Sources).Include(p => p.Teams).Include(p => p.Scenarios).Include(p => p.Exclusions).AsSplitQuery();
        if (!tracking) query = query.AsNoTracking();
        return await query.FirstOrDefaultAsync(p => p.Id == planId, ct) ?? throw new KeyNotFoundException("Plan not found");
    }

    private async Task TouchAsync(Guid planId, CancellationToken ct)
    {
        await _db.SaveChangesAsync(ct);
        await _db.Plans.Where(p => p.Id == planId).ExecuteUpdateAsync(s => s.SetProperty(p => p.UpdatedAt, DateTime.UtcNow), ct);
    }

    private async Task<Dictionary<Guid, string>> UserNamesAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToList();
        return await _db.Users.AsNoTracking().Where(u => list.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);
    }

    private static void EnsureCanView(Plan plan, Guid userId)
    {
        if (plan.OwnerUserId != userId && plan.Access != "open") throw new UnauthorizedAccessException("No access to the plan");
    }

    private static void EnsureCanEdit(Plan plan, Guid userId)
    {
        if (plan.OwnerUserId != userId) throw new UnauthorizedAccessException("Only the plan owner can change it");
    }

    private static string RequireName(string? name)
    {
        var value = (name ?? "").Trim();
        if (value.Length == 0) throw new ArgumentException("Name is required");
        if (value.Length > 200) throw new ArgumentException("Name is too long");
        return value;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string NormalizeAccess(string? access) => AccessLevels.Contains(access) ? access! : "private";

    private static string? NormalizeColor(string? color) =>
        color != null && System.Text.RegularExpressions.Regex.IsMatch(color, "^#[0-9a-fA-F]{6}$") ? color.ToLowerInvariant() : null;

    public static string NormalizeIssueTypes(IEnumerable<int>? types) =>
        string.Join(',', (types ?? Enumerable.Empty<int>()).Where(t => Enum.IsDefined(typeof(IssueType), t)).Distinct().OrderBy(t => t));

    public static List<int> ParseIssueTypes(string? value) =>
        (value ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).Select(x => int.TryParse(x, out var n) ? n : -1).Where(n => n >= 0).ToList();

    private static DateTime? ToUtc(DateTime? value) => value?.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.Value.ToUniversalTime(),
        _ => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : null,
    };
}
