using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CanbanServer.Infrastructure.Services;

public sealed class JiraPlatformService : IJiraPlatformService
{
    private readonly CanbanDbContext _db;
    private readonly IProjectAccessService _access;
    private readonly IConfiguration _configuration;
    private readonly IBoardHub _boardHub;
    private readonly CacheService _cache;
    private readonly IGitHubAppClient _gitHub;

    public JiraPlatformService(
        CanbanDbContext db,
        IProjectAccessService access,
        IConfiguration configuration,
        IBoardHub boardHub,
        CacheService cache,
        IGitHubAppClient gitHub)
    {
        _db = db;
        _access = access;
        _configuration = configuration;
        _boardHub = boardHub;
        _cache = cache;
        _gitHub = gitHub;
    }

    public async Task<List<WorkflowTransitionDto>> GetTransitionsAsync(Guid boardId, CancellationToken ct) =>
        (await _db.WorkflowTransitions.AsNoTracking().Where(x => x.BoardId == boardId).OrderBy(x => x.Name).ToListAsync(ct))
        .Select(MapTransition).ToList();

    public async Task<WorkflowTransitionDto> SaveTransitionAsync(Guid boardId, Guid? id, UpsertWorkflowTransitionRequest request, CancellationToken ct)
    {
        await EnsureColumnsAsync(boardId, request.SourceColumnId, request.TargetColumnId, ct);
        WorkflowTransition entity;
        if (id.HasValue)
        {
            entity = await _db.WorkflowTransitions.FirstOrDefaultAsync(x => x.Id == id && x.BoardId == boardId, ct)
                ?? throw new KeyNotFoundException("Transition not found");
        }
        else
        {
            entity = new WorkflowTransition { Id = Guid.NewGuid(), BoardId = boardId };
            _db.WorkflowTransitions.Add(entity);
        }
        entity.SourceColumnId = request.SourceColumnId;
        entity.TargetColumnId = request.TargetColumnId;
        entity.Name = string.IsNullOrWhiteSpace(request.Name) ? "Transition" : request.Name.Trim();
        entity.AllowedIssueTypes = request.AllowedIssueTypes?.Trim() ?? "";
        entity.AllowedRoles = request.AllowedRoles?.Trim() ?? "";
        entity.ConditionsJson = NormalizeJsonObject(request.ConditionsJson, "conditions");
        entity.PostFunctionsJson = NormalizeJsonObject(request.PostFunctionsJson, "post functions");
        entity.FromAnyStatus = request.FromAnyStatus;
        entity.Enabled = request.Enabled;
        await _db.SaveChangesAsync(ct);
        return MapTransition(entity);
    }

    public async Task<bool> DeleteTransitionAsync(Guid boardId, Guid id, CancellationToken ct)
    {
        var entity = await _db.WorkflowTransitions.FirstOrDefaultAsync(x => x.Id == id && x.BoardId == boardId, ct);
        if (entity == null) return false;
        _db.WorkflowTransitions.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<WorkflowTransition?> ValidateTransitionAsync(Quest quest, Guid targetColumnId, BoardPermission permission, CancellationToken ct, Guid? userId = null)
    {
        if (quest.ColumnId == targetColumnId) return null;
        var rules = await _db.WorkflowTransitions.AsNoTracking()
            .Where(x => x.BoardId == quest.BoardId && x.Enabled)
            .ToListAsync(ct);
        if (rules.Count == 0) return null;
        var candidates = rules.Where(x => x.TargetColumnId == targetColumnId && (x.FromAnyStatus || x.SourceColumnId == quest.ColumnId))
            .OrderBy(x => x.FromAnyStatus).ToList();
        if (candidates.Count == 0) throw new InvalidOperationException("Transition is not allowed by workflow");
        InvalidOperationException? failure = null;
        foreach (var candidate in candidates)
        {
            try
            {
                CheckConditions(candidate, quest, permission, userId);
                return candidate;
            }
            catch (InvalidOperationException e) { failure ??= e; }
        }
        throw failure!;
    }

    /// <summary>Throws when the issue or the user does not satisfy the transition's conditions.</summary>
    public static void CheckConditions(WorkflowTransition match, Quest quest, BoardPermission permission, Guid? userId)
    {
        if (!string.IsNullOrWhiteSpace(match.AllowedIssueTypes))
        {
            var allowed = match.AllowedIssueTypes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var typeTokens = quest.IssueTypeId is Guid typeId
                ? new[] { typeId.ToString() }
                : new[] { quest.IssueType.ToString(), ((int)quest.IssueType).ToString() };
            if (!allowed.Any(a => typeTokens.Contains(a, StringComparer.OrdinalIgnoreCase)))
                throw new InvalidOperationException("Transition is not allowed for this issue type");
        }
        if (!string.IsNullOrWhiteSpace(match.AllowedRoles))
        {
            var allowed = match.AllowedRoles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var levels = allowed.Select(a => Enum.TryParse<BoardPermission>(a, true, out var level) ? level : (BoardPermission?)null).Where(x => x.HasValue).ToList();
            if (levels.Count > 0 && !levels.Any(level => permission >= level))
                throw new InvalidOperationException("Transition is not allowed for your role");
        }
        if (!string.IsNullOrWhiteSpace(match.ConditionsJson))
        {
            using var conditions = JsonDocument.Parse(match.ConditionsJson);
            var root = conditions.RootElement;
            if (root.TryGetProperty("requireAssignee", out var requireAssignee) && requireAssignee.GetBoolean()
                && !quest.AssigneeId.HasValue && quest.Assignees.Count == 0)
                throw new InvalidOperationException("Transition requires an assignee");
            if (root.TryGetProperty("onlyAssignee", out var onlyAssignee) && onlyAssignee.ValueKind == JsonValueKind.True && userId.HasValue
                && quest.AssigneeId != userId && !quest.Assignees.Any(a => a.UserId == userId))
                throw new InvalidOperationException("Only an assignee can perform this transition");
            if (root.TryGetProperty("requireEstimate", out var requireEstimate) && requireEstimate.GetBoolean()
                && !quest.OriginalEstimateMinutes.HasValue && !quest.StoryPoints.HasValue)
                throw new InvalidOperationException("Transition requires an estimate");
            if (root.TryGetProperty("requiredFields", out var requiredFields) && requiredFields.ValueKind == JsonValueKind.Array)
            {
                var customValues = IssueFieldService.ReadValues(quest.CustomFieldsJson);
                foreach (var field in requiredFields.EnumerateArray().Select(x => x.GetString()?.ToLowerInvariant()))
                {
                    if (field != null && field.StartsWith("cf:", StringComparison.Ordinal))
                    {
                        if (!customValues.ContainsKey(field[3..])) throw new InvalidOperationException("Transition requires a custom field to be filled in");
                        continue;
                    }
                    var present = field switch
                    {
                        "description" => !string.IsNullOrWhiteSpace(quest.Description) || !string.IsNullOrWhiteSpace(quest.DescriptionDocumentJson),
                        "duedate" => quest.DueDate.HasValue,
                        "storypoints" => quest.StoryPoints.HasValue,
                        "remainingestimate" => quest.RemainingEstimateMinutes.HasValue,
                        "fixversion" => !string.IsNullOrWhiteSpace(quest.FixVersion),
                        "component" => !string.IsNullOrWhiteSpace(quest.Component),
                        _ => true
                    };
                    if (!present) throw new InvalidOperationException($"Transition requires field '{field}'");
                }
            }
        }
    }

    public async Task<List<QuestLinkDto>> GetLinksAsync(Guid questId, CancellationToken ct)
    {
        var links = await _db.QuestLinks.AsNoTracking()
            .Where(x => x.SourceQuestId == questId || x.TargetQuestId == questId)
            .ToListAsync(ct);
        var questIds = links.SelectMany(x => new[] { x.SourceQuestId, x.TargetQuestId }).Distinct().ToList();
        var quests = await _db.Quests.AsNoTracking().Where(q => questIds.Contains(q.Id))
            .ToDictionaryAsync(q => q.Id, ct);
        return links.Select(x => new QuestLinkDto(
            x.Id, x.SourceQuestId, x.TargetQuestId, x.Type,
            quests.GetValueOrDefault(x.SourceQuestId)?.IssueKey,
            quests.GetValueOrDefault(x.TargetQuestId)?.IssueKey,
            quests.GetValueOrDefault(x.SourceQuestId)?.Title,
            quests.GetValueOrDefault(x.TargetQuestId)?.Title)).ToList();
    }

    public async Task<QuestLinkDto> AddLinkAsync(Guid questId, Guid userId, CreateQuestLinkRequest request, CancellationToken ct)
    {
        var source = await _db.Quests.FirstOrDefaultAsync(q => q.Id == questId, ct) ?? throw new KeyNotFoundException("Quest not found");
        var target = await ResolveLinkTargetAsync(source, request, ct)
            ?? throw new KeyNotFoundException($"Задача «{request.Target ?? request.TargetQuestId?.ToString()}» не найдена на этой доске");
        if (target.Id == questId) throw new ArgumentException("Нельзя связать задачу саму с собой");
        if (source.BoardId != target.BoardId) throw new ArgumentException("Linked quests must be on the same board");
        var exists = await _db.QuestLinks.AnyAsync(x => x.SourceQuestId == questId && x.TargetQuestId == target.Id && x.Type == request.Type, ct);
        if (exists) throw new ArgumentException("Такая связь уже есть");
        var link = new QuestLink
        {
            Id = Guid.NewGuid(),
            SourceQuestId = questId,
            TargetQuestId = target.Id,
            Type = request.Type,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = userId
        };
        _db.QuestLinks.Add(link);
        await AddChangeAsync(questId, userId, "link", "link", null, $"{request.Type}:{target.IssueKey}", ct);
        await EnqueueAsync("IssueUpdated", new { questId, boardId = source.BoardId, field = "link" }, ct);
        await _db.SaveChangesAsync(ct);
        return new QuestLinkDto(link.Id, source.Id, target.Id, link.Type, source.IssueKey, target.IssueKey, source.Title, target.Title);
    }

    private async Task<Quest?> ResolveLinkTargetAsync(Quest source, CreateQuestLinkRequest request, CancellationToken ct)
    {
        if (request.TargetQuestId is { } id && id != Guid.Empty)
            return await _db.Quests.FirstOrDefaultAsync(q => q.Id == id, ct);
        var target = request.Target?.Trim();
        if (string.IsNullOrEmpty(target)) throw new ArgumentException("Укажите ключ или ID связанной задачи");
        if (Guid.TryParse(target, out var parsed))
            return await _db.Quests.FirstOrDefaultAsync(q => q.Id == parsed, ct);
        var key = target.ToUpperInvariant();
        return await _db.Quests.FirstOrDefaultAsync(q => q.BoardId == source.BoardId && q.IssueKey == key, ct);
    }

    public async Task<bool> DeleteLinkAsync(Guid questId, Guid id, CancellationToken ct)
    {
        var link = await _db.QuestLinks.FirstOrDefaultAsync(x => x.Id == id && (x.SourceQuestId == questId || x.TargetQuestId == questId), ct);
        if (link == null) return false;
        _db.QuestLinks.Remove(link);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<List<BoardComponentDto>> GetComponentsAsync(Guid boardId, CancellationToken ct) =>
        (await _db.BoardComponents.AsNoTracking().Where(x => x.BoardId == boardId).OrderBy(x => x.Name).ToListAsync(ct))
        .Select(x => new BoardComponentDto(x.Id, x.BoardId, x.Name, x.Description, x.LeadUserId, x.Archived)).ToList();

    public async Task<BoardComponentDto> SaveComponentAsync(Guid boardId, Guid? id, UpsertBoardComponentRequest request, CancellationToken ct)
    {
        BoardComponent entity;
        if (id.HasValue)
            entity = await _db.BoardComponents.FirstOrDefaultAsync(x => x.Id == id && x.BoardId == boardId, ct)
                ?? throw new KeyNotFoundException("Component not found");
        else
        {
            entity = new BoardComponent { Id = Guid.NewGuid(), BoardId = boardId };
            _db.BoardComponents.Add(entity);
        }
        entity.Name = request.Name.Trim();
        entity.Description = request.Description;
        entity.LeadUserId = request.LeadUserId;
        entity.Archived = request.Archived;
        await _db.SaveChangesAsync(ct);
        return new BoardComponentDto(entity.Id, entity.BoardId, entity.Name, entity.Description, entity.LeadUserId, entity.Archived);
    }

    public async Task<bool> DeleteComponentAsync(Guid id, CancellationToken ct)
    {
        var entity = await _db.BoardComponents.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (entity == null) return false;
        _db.BoardComponents.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<List<BoardReleaseDto>> GetReleasesAsync(Guid boardId, CancellationToken ct) =>
        (await _db.BoardReleases.AsNoTracking().Where(x => x.BoardId == boardId).OrderBy(x => x.Name).ToListAsync(ct))
        .Select(x => new BoardReleaseDto(x.Id, x.BoardId, x.Name, x.Description, x.Status, x.StartDate, x.ReleaseDate)).ToList();

    public async Task<BoardReleaseDto> SaveReleaseAsync(Guid boardId, Guid? id, UpsertBoardReleaseRequest request, CancellationToken ct)
    {
        BoardRelease entity;
        if (id.HasValue)
            entity = await _db.BoardReleases.FirstOrDefaultAsync(x => x.Id == id && x.BoardId == boardId, ct)
                ?? throw new KeyNotFoundException("Release not found");
        else
        {
            entity = new BoardRelease { Id = Guid.NewGuid(), BoardId = boardId };
            _db.BoardReleases.Add(entity);
        }
        entity.Name = request.Name.Trim();
        entity.Description = request.Description;
        entity.Status = request.Status;
        entity.StartDate = request.StartDate;
        entity.ReleaseDate = request.ReleaseDate;
        await _db.SaveChangesAsync(ct);
        return new BoardReleaseDto(entity.Id, entity.BoardId, entity.Name, entity.Description, entity.Status, entity.StartDate, entity.ReleaseDate);
    }

    public async Task<BoardReleaseDto?> MarkReleaseReleasedAsync(Guid id, CancellationToken ct)
    {
        var entity = await _db.BoardReleases.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (entity == null) return null;
        entity.Status = ReleaseStatus.Released;
        entity.ReleaseDate ??= DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return new BoardReleaseDto(entity.Id, entity.BoardId, entity.Name, entity.Description, entity.Status, entity.StartDate, entity.ReleaseDate);
    }

    public async Task<bool> DeleteReleaseAsync(Guid id, CancellationToken ct)
    {
        var entity = await _db.BoardReleases.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (entity == null) return false;
        _db.BoardReleases.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<List<WorkLogDto>> GetWorkLogsAsync(Guid questId, CancellationToken ct)
    {
        var logs = await _db.WorkLogs.AsNoTracking().Where(x => x.QuestId == questId).OrderByDescending(x => x.StartedAt).ToListAsync(ct);
        var users = await _db.Users.AsNoTracking().Where(u => logs.Select(l => l.UserId).Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);
        return logs.Select(x => new WorkLogDto(x.Id, x.QuestId, x.UserId, users.GetValueOrDefault(x.UserId)?.DisplayName, x.TimeSpentMinutes, x.StartedAt, x.Note)).ToList();
    }

    public async Task<WorkLogDto> SaveWorkLogAsync(Guid questId, Guid userId, Guid? id, UpsertWorkLogRequest request, CancellationToken ct)
    {
        if (request.TimeSpentMinutes <= 0) throw new ArgumentException("Time spent must be positive");
        var quest = await _db.Quests.FirstOrDefaultAsync(q => q.Id == questId, ct) ?? throw new KeyNotFoundException("Quest not found");
        WorkLog entity;
        if (id.HasValue)
        {
            entity = await _db.WorkLogs.FirstOrDefaultAsync(x => x.Id == id && x.QuestId == questId, ct)
                ?? throw new KeyNotFoundException("Work log not found");
            if (entity.UserId != userId) throw new UnauthorizedAccessException("Only author can edit work log");
        }
        else
        {
            entity = new WorkLog { Id = Guid.NewGuid(), QuestId = questId, UserId = userId, CreatedAt = DateTime.UtcNow };
            _db.WorkLogs.Add(entity);
        }
        entity.TimeSpentMinutes = request.TimeSpentMinutes;
        entity.StartedAt = request.StartedAt.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(request.StartedAt, DateTimeKind.Utc) : request.StartedAt.ToUniversalTime();
        entity.Note = request.Note;
        entity.UpdatedAt = DateTime.UtcNow;
        if (request.RemainingEstimateMinutes.HasValue)
            quest.RemainingEstimateMinutes = Math.Max(0, request.RemainingEstimateMinutes.Value);
        else if (quest.RemainingEstimateMinutes.HasValue)
            quest.RemainingEstimateMinutes = Math.Max(0, quest.RemainingEstimateMinutes.Value - request.TimeSpentMinutes);
        await AddChangeAsync(questId, userId, "worklog", "timeSpent", null, request.TimeSpentMinutes.ToString(CultureInfo.InvariantCulture), ct);
        await EnqueueAsync("WorkLogged", new { questId, boardId = quest.BoardId, userId, request.TimeSpentMinutes }, ct);
        await _db.SaveChangesAsync(ct);
        var user = await _db.Users.AsNoTracking().FirstAsync(u => u.Id == userId, ct);
        return new WorkLogDto(entity.Id, entity.QuestId, entity.UserId, user.DisplayName, entity.TimeSpentMinutes, entity.StartedAt, entity.Note);
    }

    public async Task<bool> DeleteWorkLogAsync(Guid questId, Guid id, Guid userId, bool canManage, CancellationToken ct)
    {
        var entity = await _db.WorkLogs.FirstOrDefaultAsync(x => x.Id == id && x.QuestId == questId, ct);
        if (entity == null) return false;
        if (!canManage && entity.UserId != userId) throw new UnauthorizedAccessException();
        _db.WorkLogs.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<List<QuestChangeDto>> GetHistoryAsync(Guid questId, CancellationToken ct)
    {
        var items = await _db.QuestChanges.AsNoTracking().Where(x => x.QuestId == questId).OrderByDescending(x => x.CreatedAt).Take(500).ToListAsync(ct);
        var users = await _db.Users.AsNoTracking().Where(u => items.Where(i => i.UserId.HasValue).Select(i => i.UserId!.Value).Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);
        return items.Select(x => new QuestChangeDto(x.Id, x.QuestId, x.UserId, x.UserId.HasValue ? users.GetValueOrDefault(x.UserId.Value)?.DisplayName : null, x.ChangeType, x.Field, x.OldValue, x.NewValue, x.CreatedAt)).ToList();
    }

    public async Task AddChangeAsync(Guid questId, Guid? userId, string changeType, string? field, string? oldValue, string? newValue, CancellationToken ct)
    {
        _db.QuestChanges.Add(new QuestChange
        {
            Id = Guid.NewGuid(),
            QuestId = questId,
            UserId = userId,
            ChangeType = changeType,
            Field = field,
            OldValue = oldValue,
            NewValue = newValue,
            CreatedAt = DateTime.UtcNow
        });
        await Task.CompletedTask;
    }

    public async Task<List<AppNotificationDto>> GetNotificationsAsync(Guid userId, bool unreadOnly, CancellationToken ct)
    {
        var query = _db.AppNotifications.AsNoTracking().Where(x => x.UserId == userId);
        if (unreadOnly) query = query.Where(x => !x.Read);
        var items = await query.OrderByDescending(x => x.CreatedAt).Take(200).ToListAsync(ct);
        var questIds = items.Where(x => x.QuestId.HasValue).Select(x => x.QuestId!.Value).Distinct().ToList();
        var quests = await _db.Quests.AsNoTracking().Where(q => questIds.Contains(q.Id))
            .Select(q => new
            {
                q.Id, q.BoardId, q.IssueKey, q.Title, q.IssueType, BoardName = q.Board.Name,
                Assigned = q.AssigneeId == userId || q.Assignees.Any(a => a.UserId == userId)
            })
            .ToDictionaryAsync(q => q.Id, ct);
        return items.Select(x =>
        {
            var quest = x.QuestId.HasValue && quests.TryGetValue(x.QuestId.Value, out var found) ? found : null;
            return new AppNotificationDto(x.Id, x.QuestId, x.Type, x.Title, x.Body, x.Read, x.CreatedAt,
                quest?.BoardId, quest?.IssueKey, quest?.Title, quest?.BoardName, quest?.IssueType, quest?.Assigned ?? x.Type == "kudos");
        }).ToList();
    }

    public async Task<int> MarkAllNotificationsReadAsync(Guid userId, CancellationToken ct) =>
        await _db.AppNotifications.Where(x => x.UserId == userId && !x.Read)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Read, true), ct);

    public async Task<List<MyWorkItemDto>> GetMyWorkAsync(Guid userId, string kind, IReadOnlyCollection<Guid> questIds, CancellationToken ct)
    {
        var accessible = _db.Quests.AsNoTracking()
            .Where(q => q.Board.Team.OwnerId == userId || q.Board.Team.Members.Any(m => m.UserId == userId));
        Dictionary<Guid, DateTime> activity;
        switch (kind.ToLowerInvariant())
        {
            case "assigned":
                activity = await accessible
                    .Where(q => q.CompletedAt == null && q.Column.Kind != ColumnKind.Done && q.Column.Kind != ColumnKind.Archive
                        && (q.AssigneeId == userId || q.Assignees.Any(a => a.UserId == userId)))
                    .Select(q => new { q.Id, At = _db.QuestChanges.Where(c => c.QuestId == q.Id).Max(c => (DateTime?)c.CreatedAt) ?? q.CreatedAt })
                    .ToDictionaryAsync(x => x.Id, x => x.At, ct);
                break;
            case "worked":
                var since = DateTime.UtcNow.AddDays(-90);
                activity = await _db.QuestChanges.AsNoTracking()
                    .Where(c => c.UserId == userId && c.CreatedAt >= since)
                    .GroupBy(c => c.QuestId)
                    .Select(g => new { Id = g.Key, At = g.Max(c => c.CreatedAt) })
                    .OrderByDescending(x => x.At).Take(100)
                    .ToDictionaryAsync(x => x.Id, x => x.At, ct);
                break;
            case "watching":
                activity = await accessible
                    .Where(q => q.NotificationRecipients.Any(r => r.UserId == userId))
                    .Select(q => new { q.Id, q.CreatedAt })
                    .ToDictionaryAsync(x => x.Id, x => x.CreatedAt, ct);
                break;
            case "viewed":
                activity = questIds.Distinct().Take(100).Select((id, index) => (id, index))
                    .ToDictionary(x => x.id, x => DateTime.UtcNow.AddSeconds(-x.index));
                break;
            default:
                throw new ArgumentException("Unknown work kind");
        }
        var ids = activity.Keys.ToList();
        var rows = await accessible.Where(q => ids.Contains(q.Id))
            .Select(q => new
            {
                q.Id, q.BoardId, BoardName = q.Board.Name, q.IssueKey, q.Title, q.IssueType,
                Status = q.Column.Title, Done = q.CompletedAt != null || q.Column.Kind == ColumnKind.Done
            })
            .ToListAsync(ct);
        return rows
            .Select(q => new MyWorkItemDto(q.Id, q.BoardId, q.BoardName, q.IssueKey, q.Title, q.IssueType, q.Status, q.Done, activity[q.Id]))
            .OrderByDescending(x => x.ActivityAt)
            .ToList();
    }

    public async Task<bool> MarkNotificationReadAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var entity = await _db.AppNotifications.FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId, ct);
        if (entity == null) return false;
        entity.Read = true;
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task NotifyUsersAsync(IEnumerable<Guid> userIds, Guid? questId, string type, string title, string? body, CancellationToken ct)
    {
        foreach (var userId in userIds.Distinct())
        {
            _db.AppNotifications.Add(new AppNotification
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                QuestId = questId,
                Type = type,
                Title = title,
                Body = body,
                CreatedAt = DateTime.UtcNow
            });
        }
        await _db.SaveChangesAsync(ct);
    }

    public async Task<List<SavedFilterDto>> GetFiltersAsync(Guid userId, CancellationToken ct) =>
        (await _db.SavedFilters.AsNoTracking().Where(x => x.OwnerUserId == userId || x.Shared).OrderBy(x => x.Name).ToListAsync(ct))
        .Select(MapFilter).ToList();

    public async Task<SavedFilterDto> SaveFilterAsync(Guid userId, Guid? id, UpsertSavedFilterRequest request, CancellationToken ct)
    {
        SavedFilter entity;
        if (id.HasValue)
        {
            entity = await _db.SavedFilters.FirstOrDefaultAsync(x => x.Id == id && x.OwnerUserId == userId, ct)
                ?? throw new KeyNotFoundException("Filter not found");
        }
        else
        {
            entity = new SavedFilter { Id = Guid.NewGuid(), OwnerUserId = userId, CreatedAt = DateTime.UtcNow };
            _db.SavedFilters.Add(entity);
        }
        entity.Name = request.Name.Trim();
        entity.Jql = request.Jql.Trim();
        entity.BoardId = request.BoardId;
        entity.Shared = request.Shared;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return MapFilter(entity);
    }

    public async Task<bool> DeleteFilterAsync(Guid userId, Guid id, CancellationToken ct)
    {
        var entity = await _db.SavedFilters.FirstOrDefaultAsync(x => x.Id == id && x.OwnerUserId == userId, ct);
        if (entity == null) return false;
        _db.SavedFilters.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<BulkEditResult> BulkEditAsync(Guid boardId, Guid userId, BulkEditQuestsRequest request, CancellationToken ct)
    {
        var quests = await _db.Quests.Where(q => q.BoardId == boardId && request.QuestIds.Contains(q.Id)).ToListAsync(ct);
        foreach (var quest in quests)
        {
            if (request.SprintIdSet) quest.SprintId = request.SprintId;
            if (request.ColumnId.HasValue) quest.ColumnId = request.ColumnId.Value;
            if (request.Labels != null) quest.Labels = request.Labels;
            if (request.Priority.HasValue) quest.Priority = request.Priority.Value;
            if (request.IssueType.HasValue) quest.IssueType = request.IssueType.Value;
            await AddChangeAsync(quest.Id, userId, "bulk", "bulk", null, "updated", ct);
        }
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + boardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(boardId, ct);
        return new BulkEditResult(quests.Count);
    }

    public async Task<QuestDto> CloneQuestAsync(Guid questId, Guid userId, CloneQuestRequest request, CancellationToken ct)
    {
        var source = await _db.Quests
            .Include(q => q.Assignees)
            .Include(q => q.NotificationRecipients)
            .Include(q => q.OutgoingLinks)
            .FirstOrDefaultAsync(q => q.Id == questId, ct) ?? throw new KeyNotFoundException("Quest not found");
        var board = await _db.Boards.FirstAsync(b => b.Id == source.BoardId, ct);
        var issueNumber = board.NextIssueNumber++;
        var clone = new Quest
        {
            Id = Guid.NewGuid(),
            BoardId = source.BoardId,
            ColumnId = source.ColumnId,
            Title = source.Title + (request.TitleSuffix ?? " (copy)"),
            Description = source.Description,
            DescriptionDocumentJson = source.DescriptionDocumentJson,
            AssigneeId = source.AssigneeId,
            Order = source.Order + 1,
            DueDate = source.DueDate,
            CreatedAt = DateTime.UtcNow,
            Category = source.Category,
            XpReward = source.XpReward,
            IsEpic = source.IsEpic,
            ParentEpicId = source.ParentEpicId,
            ParentQuestId = source.ParentQuestId,
            IssueNumber = issueNumber,
            IssueKey = $"{board.KeyPrefix}-{issueNumber}",
            IssueType = source.IssueType,
            Priority = source.Priority,
            Labels = source.Labels,
            Component = source.Component,
            FixVersion = source.FixVersion,
            StoryPoints = source.StoryPoints,
            SprintId = source.SprintId,
            OriginalEstimateMinutes = source.OriginalEstimateMinutes,
            RemainingEstimateMinutes = source.RemainingEstimateMinutes
        };
        foreach (var assignee in source.Assignees.OrderBy(a => a.Order))
            clone.Assignees.Add(new QuestAssignee { Id = Guid.NewGuid(), QuestId = clone.Id, UserId = assignee.UserId, Order = assignee.Order });
        if (request.IncludeWatchers)
            foreach (var recipient in source.NotificationRecipients)
                clone.NotificationRecipients.Add(new QuestNotificationRecipient { Id = Guid.NewGuid(), QuestId = clone.Id, UserId = recipient.UserId });
        _db.Quests.Add(clone);
        if (request.IncludeLinks)
        {
            foreach (var link in source.OutgoingLinks)
            {
                _db.QuestLinks.Add(new QuestLink
                {
                    Id = Guid.NewGuid(),
                    SourceQuestId = clone.Id,
                    TargetQuestId = link.TargetQuestId,
                    Type = link.Type,
                    CreatedAt = DateTime.UtcNow,
                    CreatedByUserId = userId
                });
            }
        }
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + source.BoardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(source.BoardId, ct);
        return (await _db.Quests.Include(q => q.Assignee).Include(q => q.Assignees).ThenInclude(a => a.User)
            .Include(q => q.Sprint).Include(q => q.NotificationRecipients).Include(q => q.ExternalNotificationRecipients)
            .FirstAsync(q => q.Id == clone.Id, ct)) is var loaded
            ? BoardService.MapQuest(loaded)
            : throw new InvalidOperationException();
    }

    public async Task<BoardDto> CloneBoardAsync(Guid boardId, Guid userId, CloneBoardRequest request, CancellationToken ct)
    {
        var source = await _db.Boards.Include(b => b.Columns).FirstOrDefaultAsync(b => b.Id == boardId, ct)
            ?? throw new KeyNotFoundException("Board not found");
        var board = new Board
        {
            Id = Guid.NewGuid(),
            TeamId = source.TeamId,
            Name = request.Name.Trim(),
            Description = source.Description,
            Order = source.Order + 1,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = userId,
            KeyPrefix = source.KeyPrefix,
            NextIssueNumber = 1,
            Template = source.Template,
            ManagementType = source.ManagementType,
            Access = source.Access,
            Features = source.Features,
        };
        var columnMap = new Dictionary<Guid, Guid>();
        foreach (var column in source.Columns.OrderBy(c => c.Order))
        {
            var copy = new Column
            {
                Id = Guid.NewGuid(),
                BoardId = board.Id,
                Title = column.Title,
                Order = column.Order,
                Kind = column.Kind,
                CreatedAt = DateTime.UtcNow
            };
            columnMap[column.Id] = copy.Id;
            board.Columns.Add(copy);
        }
        _db.Boards.Add(board);
        if (request.IncludeQuests)
        {
            var quests = await _db.Quests.Where(q => q.BoardId == boardId).OrderBy(q => q.Order).ToListAsync(ct);
            foreach (var quest in quests)
            {
                var issueNumber = board.NextIssueNumber++;
                _db.Quests.Add(new Quest
                {
                    Id = Guid.NewGuid(),
                    BoardId = board.Id,
                    ColumnId = columnMap[quest.ColumnId],
                    Title = quest.Title,
                    Description = quest.Description,
                    Order = quest.Order,
                    CreatedAt = DateTime.UtcNow,
                    Category = quest.Category,
                    XpReward = quest.XpReward,
                    IsEpic = quest.IsEpic,
                    IssueType = quest.IssueType,
                    Priority = quest.Priority,
                    Labels = quest.Labels,
                    Component = quest.Component,
                    FixVersion = quest.FixVersion,
                    StoryPoints = quest.StoryPoints,
                    IssueNumber = issueNumber,
                    IssueKey = $"{board.KeyPrefix}-{issueNumber}"
                });
            }
        }
        await _db.SaveChangesAsync(ct);
        return BoardDto.From(board);
    }

    public ImportPreviewResult PreviewImport(ImportPreviewRequest request)
    {
        var rows = ParseImportRows(request.Format, request.Content, out var errors);
        return new ImportPreviewResult(rows.Count, errors.Count, errors, rows.Take(10).ToList());
    }

    public async Task<ImportExecuteResult> ExecuteImportAsync(Guid userId, ImportExecuteRequest request, CancellationToken ct)
    {
        var rows = ParseImportRows(request.Format, request.Content, out var errors);
        var board = await _db.Boards.FirstOrDefaultAsync(b => b.Id == request.BoardId, ct)
            ?? throw new KeyNotFoundException("Board not found");
        var columnOk = await _db.Columns.AnyAsync(c => c.Id == request.ColumnId && c.BoardId == request.BoardId, ct);
        if (!columnOk) throw new ArgumentException("Column not found on board");
        var created = 0;
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        foreach (var row in rows)
        {
            if (!row.TryGetValue("title", out var title) || string.IsNullOrWhiteSpace(title))
            {
                errors.Add("Row missing title");
                continue;
            }
            var issueNumber = board.NextIssueNumber++;
            _db.Quests.Add(new Quest
            {
                Id = Guid.NewGuid(),
                BoardId = board.Id,
                ColumnId = request.ColumnId,
                Title = title.Trim(),
                Description = row.GetValueOrDefault("description"),
                CreatedAt = DateTime.UtcNow,
                Order = created,
                Category = QuestCategory.Other,
                XpReward = 10,
                IssueNumber = issueNumber,
                IssueKey = $"{board.KeyPrefix}-{issueNumber}",
                IssueType = Enum.TryParse<IssueType>(row.GetValueOrDefault("type"), true, out var type) ? type : IssueType.Task,
                Priority = Enum.TryParse<IssuePriority>(row.GetValueOrDefault("priority"), true, out var priority) ? priority : IssuePriority.Medium,
                Labels = row.GetValueOrDefault("labels") ?? "",
                Component = row.GetValueOrDefault("component"),
                FixVersion = row.GetValueOrDefault("fixVersion")
            });
            created++;
        }
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + board.Id, ct);
        await _boardHub.NotifyBoardUpdatedAsync(board.Id, ct);
        return new ImportExecuteResult(created, errors);
    }

    public async Task<string> ExportAsync(Guid boardId, string format, CancellationToken ct)
    {
        var quests = await _db.Quests.AsNoTracking().Where(q => q.BoardId == boardId).OrderBy(q => q.IssueNumber).ToListAsync(ct);
        if (string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
        {
            var sb = new StringBuilder();
            sb.AppendLine("key,title,type,priority,status,labels,component,fixVersion,storyPoints");
            foreach (var q in quests)
                sb.AppendLine($"\"{q.IssueKey}\",\"{Escape(q.Title)}\",\"{q.IssueType}\",\"{q.Priority}\",\"{q.ColumnId}\",\"{Escape(q.Labels)}\",\"{Escape(q.Component)}\",\"{Escape(q.FixVersion)}\",\"{q.StoryPoints}\"");
            return sb.ToString();
        }
        return JsonSerializer.Serialize(quests.Select(q => new
        {
            q.IssueKey,
            q.Title,
            q.Description,
            Type = q.IssueType.ToString(),
            Priority = q.Priority.ToString(),
            q.Labels,
            q.Component,
            q.FixVersion,
            q.StoryPoints
        }));
    }

    public async Task<object> GetReportAsync(Guid boardId, string kind, Guid? releaseId, CancellationToken ct)
    {
        var quests = await _db.Quests.AsNoTracking().Include(q => q.Column).Include(q => q.Sprint)
            .Where(q => q.BoardId == boardId).ToListAsync(ct);
        var links = await _db.QuestLinks.AsNoTracking().Where(l => quests.Select(q => q.Id).Contains(l.SourceQuestId)).ToListAsync(ct);
        return kind.ToLowerInvariant() switch
        {
            "roadmap" => quests.Select(q => new
            {
                q.Id,
                q.IssueKey,
                q.Title,
                q.IssueType,
                ParentQuestId = q.ParentQuestId ?? q.ParentEpicId,
                q.DueDate,
                q.SprintId,
                SprintName = q.Sprint?.Name,
                BlockedByIds = links.Where(l => l.TargetQuestId == q.Id && l.Type == QuestLinkType.Blocks).Select(l => l.SourceQuestId).ToList()
            }).ToList(),
            "burndown" => BuildBurndown(quests),
            "velocity" => quests.Where(q => q.SprintId.HasValue).GroupBy(q => new { q.SprintId, Name = q.Sprint?.Name ?? "?" })
                .Select(g => new { g.Key.SprintId, SprintName = g.Key.Name, CommittedPoints = g.Sum(x => x.StoryPoints ?? 0), CompletedPoints = g.Where(x => x.CompletedAt != null).Sum(x => x.StoryPoints ?? 0) }).ToList(),
            "cumulativeflow" => quests.GroupBy(q => q.Column.Title).Select(g => new { ColumnTitle = g.Key, Count = g.Count(), Date = DateTime.UtcNow.Date }).ToList(),
            "release" => await BuildReleaseProgressAsync(boardId, releaseId, ct),
            "timetracking" => await BuildTimeTrackingAsync(boardId, ct),
            _ => throw new ArgumentException($"Unknown report '{kind}'")
        };
    }

    public async Task<List<AutomationRuleDto>> GetAutomationRulesAsync(Guid boardId, CancellationToken ct) =>
        (await _db.AutomationRules.AsNoTracking().Where(x => x.BoardId == boardId).OrderBy(x => x.Name).ToListAsync(ct))
        .Select(x => new AutomationRuleDto(x.Id, x.BoardId, x.Name, x.Trigger, x.ConditionsJson, x.ActionsJson, x.Enabled)).ToList();

    public async Task<AutomationRuleDto> SaveAutomationRuleAsync(Guid boardId, Guid? id, UpsertAutomationRuleRequest request, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(request.ConditionsJson)) _ = JsonDocument.Parse(request.ConditionsJson);
        _ = JsonDocument.Parse(string.IsNullOrWhiteSpace(request.ActionsJson) ? "[]" : request.ActionsJson);
        AutomationRule entity;
        if (id.HasValue)
            entity = await _db.AutomationRules.FirstOrDefaultAsync(x => x.Id == id && x.BoardId == boardId, ct)
                ?? throw new KeyNotFoundException("Rule not found");
        else
        {
            entity = new AutomationRule { Id = Guid.NewGuid(), BoardId = boardId };
            _db.AutomationRules.Add(entity);
        }
        entity.Name = request.Name.Trim();
        entity.Trigger = request.Trigger;
        entity.ConditionsJson = request.ConditionsJson;
        entity.ActionsJson = string.IsNullOrWhiteSpace(request.ActionsJson) ? "[]" : request.ActionsJson;
        entity.Enabled = request.Enabled;
        await _db.SaveChangesAsync(ct);
        return new AutomationRuleDto(entity.Id, entity.BoardId, entity.Name, entity.Trigger, entity.ConditionsJson, entity.ActionsJson, entity.Enabled);
    }

    public async Task<bool> DeleteAutomationRuleAsync(Guid boardId, Guid id, CancellationToken ct)
    {
        var entity = await _db.AutomationRules.FirstOrDefaultAsync(x => x.Id == id && x.BoardId == boardId, ct);
        if (entity == null) return false;
        _db.AutomationRules.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<RunAutomationResult> RunAutomationRuleAsync(Guid boardId, Guid id, RunAutomationRequest request, CancellationToken ct)
    {
        var rule = await _db.AutomationRules.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Rule not found");
        var keys = (request.IssueKeys ?? new List<string>())
            .Select(k => k.Trim().ToUpperInvariant()).Where(k => k.Length > 0).Distinct().ToList();
        if (keys.Count == 0) throw new ArgumentException("Specify at least one issue key");
        var quests = await _db.Quests.Where(q => q.BoardId == boardId && keys.Contains(q.IssueKey)).ToListAsync(ct);
        foreach (var quest in quests)
            await AutomationActions.ApplyAsync(_db, rule, quest, ct);
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + boardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(boardId, ct);
        var found = quests.Select(q => q.IssueKey).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return new RunAutomationResult(quests.Count, keys.Where(k => !found.Contains(k)).ToList());
    }

    public async Task<List<OutboundWebhookDto>> GetWebhooksAsync(Guid boardId, CancellationToken ct) =>
        (await _db.OutboundWebhooks.AsNoTracking().Where(x => x.BoardId == boardId).ToListAsync(ct))
        .Select(x => new OutboundWebhookDto(x.Id, x.BoardId, x.Url, x.SecretConfigurationKey, x.Events, x.Enabled)).ToList();

    public async Task<OutboundWebhookDto> SaveWebhookAsync(Guid boardId, Guid? id, UpsertOutboundWebhookRequest request, CancellationToken ct)
    {
        if (!Uri.TryCreate(request.Url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            throw new ArgumentException("Webhook URL must be an absolute HTTPS URL");
        if (string.IsNullOrWhiteSpace(request.SecretConfigurationKey))
            throw new ArgumentException("Webhook secret must be referenced by configuration key");
        OutboundWebhook entity;
        if (id.HasValue)
            entity = await _db.OutboundWebhooks.FirstOrDefaultAsync(x => x.Id == id && x.BoardId == boardId, ct)
                ?? throw new KeyNotFoundException("Webhook not found");
        else
        {
            entity = new OutboundWebhook { Id = Guid.NewGuid(), BoardId = boardId };
            _db.OutboundWebhooks.Add(entity);
        }
        entity.Url = request.Url.Trim();
        entity.SecretConfigurationKey = request.SecretConfigurationKey.Trim();
        entity.Events = request.Events.Trim();
        entity.Enabled = request.Enabled;
        await _db.SaveChangesAsync(ct);
        return new OutboundWebhookDto(entity.Id, entity.BoardId, entity.Url, entity.SecretConfigurationKey, entity.Events, entity.Enabled);
    }

    public async Task<bool> DeleteWebhookAsync(Guid boardId, Guid id, CancellationToken ct)
    {
        var entity = await _db.OutboundWebhooks.FirstOrDefaultAsync(x => x.Id == id && x.BoardId == boardId, ct);
        if (entity == null) return false;
        _db.OutboundWebhooks.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public bool IsGitHubAppConfigured => _gitHub.IsConfigured;

    public async Task<List<GitHubIntegrationDto>> GetGitHubIntegrationsAsync(Guid boardId, CancellationToken ct) =>
        (await _db.GitHubIntegrations.AsNoTracking().Where(x => x.BoardId == boardId).ToListAsync(ct))
        .Select(MapGitHubIntegration).ToList();

    public async Task<GitHubIntegrationDto> SaveGitHubIntegrationAsync(Guid boardId, Guid? id, UpsertGitHubIntegrationRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.RepositoryOwner) || string.IsNullOrWhiteSpace(request.RepositoryName))
            throw new ArgumentException("Repository owner and name are required");
        if (string.IsNullOrWhiteSpace(request.WebhookSecretConfigurationKey))
            throw new ArgumentException("GitHub webhook secret must be referenced by configuration key");
        if (string.IsNullOrWhiteSpace(ResolveConfiguration(request.WebhookSecretConfigurationKey)))
            throw new ArgumentException($"Configuration key '{request.WebhookSecretConfigurationKey.Trim()}' is not set on the server");
        var owner = request.RepositoryOwner.Trim();
        var name = request.RepositoryName.Trim();
        var installationId = request.InstallationId;
        if (installationId <= 0 && _gitHub.IsConfigured)
            installationId = await _gitHub.FindRepositoryInstallationAsync(owner, name, ct)
                ?? throw new ArgumentException($"GitHub App is not installed on {owner}/{name}");
        GitHubIntegration? entity;
        if (id.HasValue)
            entity = await _db.GitHubIntegrations.FirstOrDefaultAsync(x => x.Id == id && x.BoardId == boardId, ct)
                ?? throw new KeyNotFoundException("Integration not found");
        else
        {
            entity = await _db.GitHubIntegrations.FirstOrDefaultAsync(x => x.BoardId == boardId
                && x.RepositoryOwner.ToLower() == owner.ToLower() && x.RepositoryName.ToLower() == name.ToLower(), ct);
            if (entity == null)
            {
                entity = new GitHubIntegration { Id = Guid.NewGuid(), BoardId = boardId };
                _db.GitHubIntegrations.Add(entity);
            }
        }
        entity.InstallationId = installationId;
        entity.RepositoryOwner = owner;
        entity.RepositoryName = name;
        entity.WebhookSecretConfigurationKey = request.WebhookSecretConfigurationKey.Trim();
        entity.Enabled = request.Enabled;
        await _db.SaveChangesAsync(ct);
        return MapGitHubIntegration(entity);
    }

    public async Task<bool> DeleteGitHubIntegrationAsync(Guid boardId, Guid id, CancellationToken ct)
    {
        var entity = await _db.GitHubIntegrations.FirstOrDefaultAsync(x => x.Id == id && x.BoardId == boardId, ct);
        if (entity == null) return false;
        _db.DevelopmentLinks.RemoveRange(_db.DevelopmentLinks.Where(x => x.GitHubIntegrationId == id));
        _db.GitHubIntegrations.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<DevelopmentSummaryDto> GetDevelopmentAsync(Guid questId, CancellationToken ct)
    {
        var links = await _db.DevelopmentLinks.AsNoTracking().Where(x => x.QuestId == questId)
            .OrderByDescending(x => x.UpdatedAt).ToListAsync(ct);
        var dtos = links.Select(x => new DevelopmentLinkDto(x.Id, x.QuestId, NormalizeDevelopmentKind(x.Kind), x.ExternalId, x.Url, x.Title, x.Status, x.UpdatedAt)).ToList();
        return new DevelopmentSummaryDto(
            dtos.Where(x => x.Kind == GitHubEventParser.BranchKind).ToList(),
            dtos.Where(x => x.Kind == GitHubEventParser.CommitKind).ToList(),
            dtos.Where(x => x.Kind == GitHubEventParser.PullRequestKind).ToList(),
            dtos.Where(x => x.Kind == GitHubEventParser.CheckRunKind).ToList());
    }

    public async Task<List<GitHubRepositoryOptionDto>> GetQuestRepositoriesAsync(Guid questId, CancellationToken ct)
    {
        var boardId = await _db.Quests.AsNoTracking().Where(q => q.Id == questId).Select(q => (Guid?)q.BoardId).FirstOrDefaultAsync(ct)
            ?? throw new KeyNotFoundException("Quest not found");
        var integrations = await _db.GitHubIntegrations.Where(x => x.BoardId == boardId && x.Enabled)
            .OrderBy(x => x.RepositoryOwner).ThenBy(x => x.RepositoryName).ToListAsync(ct);
        var result = new List<GitHubRepositoryOptionDto>();
        foreach (var integration in integrations)
        {
            string? defaultBranch = null;
            if (await EnsureInstallationAsync(integration, ct))
            {
                try
                {
                    using var repo = await _gitHub.GetAsync(integration.InstallationId, RepoPath(integration), ct);
                    defaultBranch = repo.RootElement.TryGetProperty("default_branch", out var b) ? b.GetString() : null;
                }
                catch (InvalidOperationException) { }
            }
            result.Add(new GitHubRepositoryOptionDto(integration.Id, integration.RepositoryOwner, integration.RepositoryName, defaultBranch));
        }
        await _db.SaveChangesAsync(ct);
        return result;
    }

    public async Task<DevelopmentSummaryDto> CreateBranchAsync(Guid questId, CreateGitHubBranchRequest request, CancellationToken ct)
    {
        var quest = await _db.Quests.AsNoTracking().FirstOrDefaultAsync(q => q.Id == questId, ct)
            ?? throw new KeyNotFoundException("Quest not found");
        var integration = await _db.GitHubIntegrations.FirstOrDefaultAsync(x => x.Id == request.IntegrationId && x.BoardId == quest.BoardId && x.Enabled, ct)
            ?? throw new ArgumentException("Репозиторий не подключён к этому разделу");
        var name = (request.Name ?? "").Trim();
        if (!GitHubEventParser.IsValidBranchName(name)) throw new ArgumentException("Недопустимое название ветки");
        if (!await EnsureInstallationAsync(integration, ct))
            throw new InvalidOperationException("GitHub App не установлен для этого репозитория");

        var repoPath = RepoPath(integration);
        var from = request.FromBranch?.Trim();
        if (string.IsNullOrEmpty(from))
        {
            using var repo = await _gitHub.GetAsync(integration.InstallationId, repoPath, ct);
            from = repo.RootElement.GetProperty("default_branch").GetString() ?? "main";
        }
        string sha;
        try
        {
            using var baseRef = await _gitHub.GetAsync(integration.InstallationId, $"{repoPath}/git/ref/heads/{EscapeRef(from)}", ct);
            sha = baseRef.RootElement.GetProperty("object").GetProperty("sha").GetString() ?? throw new InvalidOperationException("GitHub returned no commit for the base branch");
        }
        catch (InvalidOperationException ex) when (ex.Message.StartsWith("GitHub API 404", StringComparison.Ordinal))
        {
            throw new ArgumentException($"Ветка «{from}» не найдена в репозитории");
        }
        try
        {
            using var created = await _gitHub.PostAsync(integration.InstallationId, $"{repoPath}/git/refs", new { @ref = $"refs/heads/{name}", sha }, ct);
        }
        catch (InvalidOperationException ex) when (ex.Message.StartsWith("GitHub API 422", StringComparison.Ordinal))
        {
            throw new ArgumentException($"Ветка «{name}» уже существует");
        }
        catch (InvalidOperationException ex) when (ex.Message.StartsWith("GitHub API 403", StringComparison.Ordinal) || ex.Message.StartsWith("GitHub API 404", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("У GitHub App нет права создавать ветки: включите Contents: Read and write в настройках приложения");
        }

        var repoUrl = $"https://github.com/{integration.RepositoryOwner}/{integration.RepositoryName}";
        var keys = string.IsNullOrWhiteSpace(quest.IssueKey) ? Array.Empty<string>() : new[] { quest.IssueKey };
        await UpsertDevelopmentLinkAsync(questId, integration.Id,
            new GitHubDevelopmentEvent(GitHubEventParser.BranchKind, name, $"{repoUrl}/tree/{EscapeRef(name)}", name, null, keys), null, ct);
        await _db.SaveChangesAsync(ct);
        return await GetDevelopmentAsync(questId, ct);
    }

    private async Task<bool> EnsureInstallationAsync(GitHubIntegration integration, CancellationToken ct)
    {
        if (integration.InstallationId <= 0)
            integration.InstallationId = await _gitHub.FindRepositoryInstallationAsync(integration.RepositoryOwner, integration.RepositoryName, ct) ?? 0;
        return integration.InstallationId > 0;
    }

    private static string RepoPath(GitHubIntegration integration) =>
        $"repos/{Uri.EscapeDataString(integration.RepositoryOwner)}/{Uri.EscapeDataString(integration.RepositoryName)}";

    private static string EscapeRef(string name) => string.Join('/', name.Split('/').Select(Uri.EscapeDataString));

    public async Task<DevelopmentSummaryDto> SyncDevelopmentAsync(Guid questId, CancellationToken ct)
    {
        if (!_gitHub.IsConfigured) throw new InvalidOperationException("GitHub App is not configured on the server");
        var quest = await _db.Quests.AsNoTracking().FirstOrDefaultAsync(q => q.Id == questId, ct)
            ?? throw new KeyNotFoundException("Quest not found");
        var key = quest.IssueKey;
        if (string.IsNullOrWhiteSpace(key)) return await GetDevelopmentAsync(questId, ct);
        var integrations = await _db.GitHubIntegrations.Where(x => x.BoardId == quest.BoardId && x.Enabled).ToListAsync(ct);
        foreach (var integration in integrations)
        {
            if (integration.InstallationId <= 0)
            {
                integration.InstallationId = await _gitHub.FindRepositoryInstallationAsync(integration.RepositoryOwner, integration.RepositoryName, ct) ?? 0;
                if (integration.InstallationId <= 0) continue;
            }
            var repoPath = $"repos/{Uri.EscapeDataString(integration.RepositoryOwner)}/{Uri.EscapeDataString(integration.RepositoryName)}";
            var repoUrl = $"https://github.com/{integration.RepositoryOwner}/{integration.RepositoryName}";
            var found = new List<GitHubDevelopmentEvent>();

            using (var branches = await _gitHub.GetAsync(integration.InstallationId, $"{repoPath}/branches?per_page=100", ct))
                foreach (var branch in branches.RootElement.EnumerateArray())
                {
                    var name = branch.GetProperty("name").GetString() ?? "";
                    if (GitHubEventParser.ExtractIssueKeys(name).Contains(key))
                        found.Add(new GitHubDevelopmentEvent(GitHubEventParser.BranchKind, name, $"{repoUrl}/tree/{name}", name, null, new[] { key }));
                }

            using (var pulls = await _gitHub.GetAsync(integration.InstallationId, $"{repoPath}/pulls?state=all&sort=updated&direction=desc&per_page=100", ct))
                foreach (var pr in pulls.RootElement.EnumerateArray())
                {
                    var title = pr.GetProperty("title").GetString() ?? "";
                    var headRef = pr.TryGetProperty("head", out var head) && head.TryGetProperty("ref", out var r) ? r.GetString() : null;
                    if (!GitHubEventParser.ExtractIssueKeys(title, headRef).Contains(key)) continue;
                    var merged = pr.TryGetProperty("merged_at", out var mergedAt) && mergedAt.ValueKind == JsonValueKind.String;
                    found.Add(new GitHubDevelopmentEvent(GitHubEventParser.PullRequestKind, pr.GetProperty("id").ToString(),
                        pr.GetProperty("html_url").GetString() ?? repoUrl, $"#{pr.GetProperty("number")} {title}",
                        merged ? "merged" : pr.GetProperty("state").GetString(), new[] { key }));
                }

            using (var commits = await _gitHub.GetAsync(integration.InstallationId,
                       $"search/commits?q={Uri.EscapeDataString($"{key} repo:{integration.RepositoryOwner}/{integration.RepositoryName}")}&sort=committer-date&order=desc&per_page=30", ct))
                foreach (var item in commits.RootElement.GetProperty("items").EnumerateArray())
                {
                    var message = item.GetProperty("commit").GetProperty("message").GetString() ?? "";
                    if (!GitHubEventParser.ExtractIssueKeys(message).Contains(key)) continue;
                    found.Add(new GitHubDevelopmentEvent(GitHubEventParser.CommitKind, item.GetProperty("sha").GetString() ?? "",
                        item.GetProperty("html_url").GetString() ?? repoUrl, message.Split('\n', 2)[0].Trim(), null, new[] { key }));
                }

            foreach (var item in found)
                await UpsertDevelopmentLinkAsync(questId, integration.Id, item, null, ct);
        }
        await _db.SaveChangesAsync(ct);
        return await GetDevelopmentAsync(questId, ct);
    }

    public async Task<IReadOnlyList<SmartCommitRequest>> ProcessGitHubWebhookAsync(string eventName, string payload, string signature, CancellationToken ct)
    {
        try
        {
            return await ApplyGitHubWebhookAsync(eventName, payload, signature, ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: Npgsql.PostgresErrorCodes.UniqueViolation })
        {
            // GitHub delivers e.g. "create" and "push" for a new branch concurrently; the retry updates the row the other request inserted.
            _db.ChangeTracker.Clear();
            return await ApplyGitHubWebhookAsync(eventName, payload, signature, ct);
        }
    }

    private async Task<IReadOnlyList<SmartCommitRequest>> ApplyGitHubWebhookAsync(string eventName, string payload, string signature, CancellationToken ct)
    {
        using var doc = JsonDocument.Parse(payload);
        var root = doc.RootElement;
        var fullName = GitHubEventParser.RepositoryFullName(root);
        var candidates = (await _db.GitHubIntegrations.Where(x => x.Enabled).ToListAsync(ct))
            .Where(x => fullName != null && string.Equals($"{x.RepositoryOwner}/{x.RepositoryName}", fullName, StringComparison.OrdinalIgnoreCase))
            .ToList();
        var matched = candidates
            .Where(x => ResolveConfiguration(x.WebhookSecretConfigurationKey) is { Length: > 0 } secret && VerifyGitHubSignature(payload, signature, secret))
            .ToList();
        if (matched.Count == 0)
        {
            var defaultSecret = _configuration["GitHub:WebhookSecret"];
            if (candidates.Count == 0 && !string.IsNullOrWhiteSpace(defaultSecret) && VerifyGitHubSignature(payload, signature, defaultSecret))
                return Array.Empty<SmartCommitRequest>();
            throw new UnauthorizedAccessException("Invalid GitHub signature");
        }

        var installationId = GitHubEventParser.InstallationId(root);
        var events = GitHubEventParser.Parse(eventName, root);
        var keys = events.SelectMany(e => e.IssueKeys).Distinct().ToList();
        var smartCommits = new List<SmartCommitRequest>();
        foreach (var integration in matched)
        {
            if (installationId.HasValue && integration.InstallationId != installationId.Value)
                integration.InstallationId = installationId.Value;
            var shas = events.Where(e => e.Kind == GitHubEventParser.CheckRunKind && !string.IsNullOrEmpty(e.HeadSha)).Select(e => e.HeadSha!).Distinct().ToList();
            var shaLinks = shas.Count == 0
                ? new List<(Guid QuestId, string Sha)>()
                : (await _db.DevelopmentLinks.AsNoTracking()
                    .Where(l => l.GitHubIntegrationId == integration.Id && l.Kind == GitHubEventParser.CommitKind && shas.Contains(l.ExternalId))
                    .Select(l => new { l.QuestId, l.ExternalId })
                    .ToListAsync(ct)).Select(l => (l.QuestId, Sha: l.ExternalId)).ToList();
            if (keys.Count == 0 && shaLinks.Count == 0) continue;
            var questIds = shaLinks.Select(l => l.QuestId).ToList();
            var quests = await _db.Quests.AsNoTracking()
                .Where(q => q.BoardId == integration.BoardId && (keys.Contains(q.IssueKey) || questIds.Contains(q.Id)))
                .Select(q => new { q.Id, q.IssueKey })
                .ToListAsync(ct);
            foreach (var quest in quests)
            {
                var questShas = shaLinks.Where(l => l.QuestId == quest.Id).Select(l => l.Sha).ToHashSet();
                foreach (var item in events.Where(e => e.IssueKeys.Contains(quest.IssueKey) || (e.HeadSha != null && questShas.Contains(e.HeadSha))))
                {
                    var isNew = await UpsertDevelopmentLinkAsync(quest.Id, integration.Id, item, payload, ct);
                    if (isNew && item.Kind == GitHubEventParser.CommitKind && !string.IsNullOrWhiteSpace(item.Message))
                        smartCommits.Add(new SmartCommitRequest(quest.Id, item.AuthorEmail, item.Message));
                }
                await EnqueueAsync("WebhookReceived", new { boardId = integration.BoardId, questId = quest.Id, eventName }, ct);
            }
        }
        await _db.SaveChangesAsync(ct);
        return smartCommits;
    }

    public async Task<BoardPermissionsDto> GetBoardPermissionsAsync(Guid boardId, Guid userId, CancellationToken ct)
    {
        var board = await _db.Boards.AsNoTracking().FirstOrDefaultAsync(b => b.Id == boardId, ct)
            ?? throw new KeyNotFoundException("Board not found");
        var team = await _db.Teams.AsNoTracking().FirstOrDefaultAsync(t => t.Id == board.TeamId, ct);
        var members = await _db.TeamMembers.AsNoTracking().Include(m => m.User)
            .Where(m => m.TeamId == board.TeamId).ToListAsync(ct);
        var result = members.Select(m => new BoardMemberPermissionDto(m.UserId, m.User.DisplayName, m.User.Email, m.Role,
            team?.OwnerId == m.UserId, _access.MapRole(m.Role, team?.OwnerId == m.UserId))).ToList();
        if (team?.OwnerId is { } ownerId && result.All(m => m.UserId != ownerId))
        {
            var owner = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == ownerId, ct);
            result.Insert(0, new BoardMemberPermissionDto(ownerId, owner?.DisplayName, owner?.Email, null, true, BoardPermission.Admin));
        }
        var current = result.FirstOrDefault(m => m.UserId == userId)?.Permission
            ?? (await _access.GetBoardAccessAsync(boardId, userId, ct)).Permission
            ?? BoardPermission.View;
        return new BoardPermissionsDto(boardId, current, result.OrderByDescending(m => m.Permission).ThenBy(m => m.DisplayName).ToList());
    }

    private async Task<bool> UpsertDevelopmentLinkAsync(Guid questId, Guid integrationId, GitHubDevelopmentEvent item, string? payload, CancellationToken ct)
    {
        var existing = _db.DevelopmentLinks.Local.FirstOrDefault(x => x.QuestId == questId && x.Kind == item.Kind && x.ExternalId == item.ExternalId)
            ?? await _db.DevelopmentLinks.FirstOrDefaultAsync(x => x.QuestId == questId && x.Kind == item.Kind && x.ExternalId == item.ExternalId, ct);
        var isNew = existing == null;
        if (existing == null)
        {
            existing = new DevelopmentLink { Id = Guid.NewGuid(), QuestId = questId, GitHubIntegrationId = integrationId, Kind = item.Kind, ExternalId = item.ExternalId };
            _db.DevelopmentLinks.Add(existing);
        }
        existing.Url = item.Url;
        existing.Title = item.Title.Length > 500 ? item.Title[..500] : item.Title;
        existing.Status = item.Status;
        if (payload != null) existing.PayloadJson = payload;
        existing.UpdatedAt = DateTime.UtcNow;
        return isNew;
    }

    private string? ResolveConfiguration(string key) =>
        string.IsNullOrWhiteSpace(key) ? null : _configuration[key.Trim().Replace("__", ":")];

    private static string NormalizeDevelopmentKind(string kind) => kind switch
    {
        "push" => GitHubEventParser.CommitKind,
        _ => kind
    };

    private static GitHubIntegrationDto MapGitHubIntegration(GitHubIntegration x) =>
        new(x.Id, x.BoardId, x.InstallationId, x.RepositoryOwner, x.RepositoryName, x.WebhookSecretConfigurationKey, x.Enabled);

    public async Task EnqueueAsync(string type, object payload, CancellationToken ct)
    {
        _db.OutboxMessages.Add(new OutboxMessage
        {
            Id = Guid.NewGuid(),
            Type = type,
            PayloadJson = JsonSerializer.Serialize(payload),
            Status = OutboxStatus.Pending,
            AvailableAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        });
        await Task.CompletedTask;
    }

    private async Task EnsureColumnsAsync(Guid boardId, Guid source, Guid target, CancellationToken ct)
    {
        var ids = await _db.Columns.AsNoTracking().Where(c => c.BoardId == boardId).Select(c => c.Id).ToListAsync(ct);
        if (!ids.Contains(source) || !ids.Contains(target))
            throw new ArgumentException("Transition columns must belong to the board");
    }

    private static WorkflowTransitionDto MapTransition(WorkflowTransition x) =>
        new(x.Id, x.BoardId, x.SourceColumnId, x.TargetColumnId, x.Name, x.AllowedIssueTypes, x.AllowedRoles, x.ConditionsJson, x.Enabled, x.FromAnyStatus, x.PostFunctionsJson);

    private static string? NormalizeJsonObject(string? json, string what)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        if (json.Length > 20000) throw new ArgumentException($"Workflow {what} are too large");
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) throw new ArgumentException($"Workflow {what} must be a JSON object");
            return doc.RootElement.EnumerateObject().Any() ? doc.RootElement.GetRawText() : null;
        }
        catch (JsonException) { throw new ArgumentException($"Workflow {what} are not valid JSON"); }
    }

    public async Task<List<WorkflowTransitionDto>> CopyWorkflowAsync(Guid targetBoardId, Guid sourceBoardId, CancellationToken ct)
    {
        if (targetBoardId == sourceBoardId) throw new ArgumentException("Choose another space");
        var sourceColumns = await _db.Columns.AsNoTracking().Where(c => c.BoardId == sourceBoardId).ToListAsync(ct);
        var targetColumns = await _db.Columns.AsNoTracking().Where(c => c.BoardId == targetBoardId).ToListAsync(ct);
        var byTitle = targetColumns.GroupBy(c => c.Title.Trim().ToLowerInvariant()).ToDictionary(g => g.Key, g => g.First().Id);
        Guid? Map(Guid sourceColumnId)
        {
            var title = sourceColumns.FirstOrDefault(c => c.Id == sourceColumnId)?.Title.Trim().ToLowerInvariant();
            return title != null && byTitle.TryGetValue(title, out var id) ? id : null;
        }
        var source = await _db.WorkflowTransitions.AsNoTracking().Where(x => x.BoardId == sourceBoardId).ToListAsync(ct);
        var copies = new List<WorkflowTransition>();
        foreach (var rule in source)
        {
            var target = Map(rule.TargetColumnId);
            var from = rule.FromAnyStatus ? target : Map(rule.SourceColumnId);
            if (target == null || from == null) continue;
            copies.Add(new WorkflowTransition
            {
                Id = Guid.NewGuid(), BoardId = targetBoardId, SourceColumnId = from.Value, TargetColumnId = target.Value,
                Name = rule.Name, AllowedIssueTypes = rule.AllowedIssueTypes, AllowedRoles = rule.AllowedRoles,
                ConditionsJson = rule.ConditionsJson, PostFunctionsJson = rule.PostFunctionsJson,
                FromAnyStatus = rule.FromAnyStatus, Enabled = rule.Enabled,
            });
        }
        if (source.Count > 0 && copies.Count == 0)
            throw new ArgumentException("No statuses of the source space match this space by name");
        await _db.WorkflowTransitions.Where(x => x.BoardId == targetBoardId).ExecuteDeleteAsync(ct);
        _db.WorkflowTransitions.AddRange(copies);
        await _db.SaveChangesAsync(ct);
        return await GetTransitionsAsync(targetBoardId, ct);
    }

    private static SavedFilterDto MapFilter(SavedFilter x) =>
        new(x.Id, x.OwnerUserId, x.BoardId, x.Name, x.Jql, x.Shared, x.CreatedAt, x.UpdatedAt);

    private static List<Dictionary<string, string>> ParseImportRows(string format, string content, out List<string> errors)
    {
        errors = new List<string>();
        var rows = new List<Dictionary<string, string>>();
        if (string.IsNullOrWhiteSpace(content))
        {
            errors.Add("Empty content");
            return rows;
        }
        if (string.Equals(format, "json", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                using var doc = JsonDocument.Parse(content);
                foreach (var item in doc.RootElement.EnumerateArray())
                {
                    var row = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    foreach (var prop in item.EnumerateObject())
                        row[prop.Name] = prop.Value.ToString();
                    rows.Add(row);
                }
            }
            catch (Exception ex)
            {
                errors.Add(ex.Message);
            }
            return rows;
        }

        var lines = content.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (lines.Length < 2)
        {
            errors.Add("CSV requires header and rows");
            return rows;
        }
        var headers = lines[0].Split(',').Select(h => h.Trim().Trim('"').ToLowerInvariant()).ToArray();
        for (var i = 1; i < lines.Length; i++)
        {
            var parts = lines[i].Split(',');
            var row = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (var c = 0; c < headers.Length && c < parts.Length; c++)
                row[headers[c]] = parts[c].Trim().Trim('"');
            rows.Add(row);
        }
        return rows;
    }

    private static object BuildBurndown(List<Quest> quests)
    {
        var active = quests.Where(q => q.Sprint?.Status == SprintStatus.Active).ToList();
        var total = active.Sum(q => q.StoryPoints ?? 0d);
        var start = active.Select(q => q.Sprint?.StartDate).Where(d => d.HasValue).Select(d => d!.Value.Date).DefaultIfEmpty(DateTime.UtcNow.Date.AddDays(-7)).Min();
        var end = active.Select(q => q.Sprint?.EndDate).Where(d => d.HasValue).Select(d => d!.Value.Date).DefaultIfEmpty(DateTime.UtcNow.Date.AddDays(7)).Max();
        var days = Math.Max(1, (end - start).Days);
        var points = new List<object>();
        for (var i = 0; i <= days; i++)
        {
            var day = start.AddDays(i);
            var completed = active.Where(q => q.CompletedAt.HasValue && q.CompletedAt.Value.Date <= day).Sum(q => q.StoryPoints ?? 0d);
            points.Add(new { Date = day, RemainingPoints = Math.Max(0, total - completed), IdealRemaining = total * (1 - (double)i / days) });
        }
        return points;
    }

    private async Task<object> BuildReleaseProgressAsync(Guid boardId, Guid? releaseId, CancellationToken ct)
    {
        var releases = await _db.BoardReleases.AsNoTracking().Where(r => r.BoardId == boardId && (!releaseId.HasValue || r.Id == releaseId)).ToListAsync(ct);
        var links = await _db.QuestReleases.AsNoTracking().Where(qr => releases.Select(r => r.Id).Contains(qr.ReleaseId)).ToListAsync(ct);
        var quests = await _db.Quests.AsNoTracking().Include(q => q.Column)
            .Where(q => links.Select(l => l.QuestId).Contains(q.Id)).ToListAsync(ct);
        return releases.Select(r =>
        {
            var ids = links.Where(l => l.ReleaseId == r.Id).Select(l => l.QuestId).ToHashSet();
            var related = quests.Where(q => ids.Contains(q.Id)).ToList();
            return new
            {
                ReleaseId = r.Id,
                r.Name,
                TotalIssues = related.Count,
                DoneIssues = related.Count(q => q.Column.Kind == ColumnKind.Done || q.CompletedAt != null),
                StoryPointsTotal = related.Sum(q => q.StoryPoints ?? 0),
                StoryPointsDone = related.Where(q => q.CompletedAt != null).Sum(q => q.StoryPoints ?? 0)
            };
        }).ToList();
    }

    private async Task<object> BuildTimeTrackingAsync(Guid boardId, CancellationToken ct)
    {
        var quests = await _db.Quests.AsNoTracking().Where(q => q.BoardId == boardId).ToListAsync(ct);
        var spent = await _db.WorkLogs.AsNoTracking().Where(w => quests.Select(q => q.Id).Contains(w.QuestId))
            .GroupBy(w => w.QuestId).Select(g => new { QuestId = g.Key, Minutes = g.Sum(x => x.TimeSpentMinutes) })
            .ToDictionaryAsync(x => x.QuestId, x => x.Minutes, ct);
        return quests.Select(q => new
        {
            q.Id,
            q.IssueKey,
            q.OriginalEstimateMinutes,
            q.RemainingEstimateMinutes,
            SpentMinutes = spent.GetValueOrDefault(q.Id)
        }).ToList();
    }

    private static bool VerifyGitHubSignature(string payload, string signature, string secret)
    {
        if (string.IsNullOrWhiteSpace(signature) || !signature.StartsWith("sha256=", StringComparison.OrdinalIgnoreCase))
            return false;
        var expectedHex = signature["sha256=".Length..];
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        var actual = Convert.ToHexString(hash).ToLowerInvariant();
        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(actual), Encoding.UTF8.GetBytes(expectedHex.ToLowerInvariant()));
    }

    private static string Escape(string? value) => (value ?? "").Replace("\"", "\"\"");
}
