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

    public JiraPlatformService(
        CanbanDbContext db,
        IProjectAccessService access,
        IConfiguration configuration,
        IBoardHub boardHub,
        CacheService cache)
    {
        _db = db;
        _access = access;
        _configuration = configuration;
        _boardHub = boardHub;
        _cache = cache;
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
        entity.ConditionsJson = request.ConditionsJson;
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

    public async Task ValidateTransitionAsync(Quest quest, Guid targetColumnId, BoardPermission permission, CancellationToken ct)
    {
        var rules = await _db.WorkflowTransitions.AsNoTracking()
            .Where(x => x.BoardId == quest.BoardId && x.Enabled)
            .ToListAsync(ct);
        if (rules.Count == 0) return;
        var match = rules.FirstOrDefault(x => x.SourceColumnId == quest.ColumnId && x.TargetColumnId == targetColumnId);
        if (match == null) throw new InvalidOperationException("Transition is not allowed by workflow");
        if (!string.IsNullOrWhiteSpace(match.AllowedIssueTypes))
        {
            var allowed = match.AllowedIssueTypes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (!allowed.Any(a => a.Equals(quest.IssueType.ToString(), StringComparison.OrdinalIgnoreCase) || a == ((int)quest.IssueType).ToString()))
                throw new InvalidOperationException("Transition is not allowed for this issue type");
        }
        if (!string.IsNullOrWhiteSpace(match.AllowedRoles))
        {
            var allowed = match.AllowedRoles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var roleNames = new[] { permission.ToString(), ((int)permission).ToString() };
            if (!allowed.Any(a => roleNames.Contains(a, StringComparer.OrdinalIgnoreCase)))
                throw new InvalidOperationException("Transition is not allowed for your role");
        }
        if (!string.IsNullOrWhiteSpace(match.ConditionsJson))
        {
            using var conditions = JsonDocument.Parse(match.ConditionsJson);
            var root = conditions.RootElement;
            if (root.TryGetProperty("requireAssignee", out var requireAssignee) && requireAssignee.GetBoolean()
                && !quest.AssigneeId.HasValue && quest.Assignees.Count == 0)
                throw new InvalidOperationException("Transition requires an assignee");
            if (root.TryGetProperty("requireEstimate", out var requireEstimate) && requireEstimate.GetBoolean()
                && !quest.OriginalEstimateMinutes.HasValue && !quest.StoryPoints.HasValue)
                throw new InvalidOperationException("Transition requires an estimate");
            if (root.TryGetProperty("requiredFields", out var requiredFields) && requiredFields.ValueKind == JsonValueKind.Array)
            {
                foreach (var field in requiredFields.EnumerateArray().Select(x => x.GetString()?.ToLowerInvariant()))
                {
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
        if (questId == request.TargetQuestId) throw new ArgumentException("Cannot link a quest to itself");
        var source = await _db.Quests.FirstOrDefaultAsync(q => q.Id == questId, ct) ?? throw new KeyNotFoundException("Quest not found");
        var target = await _db.Quests.FirstOrDefaultAsync(q => q.Id == request.TargetQuestId, ct) ?? throw new KeyNotFoundException("Target quest not found");
        if (source.BoardId != target.BoardId) throw new ArgumentException("Linked quests must be on the same board");
        var exists = await _db.QuestLinks.AnyAsync(x => x.SourceQuestId == questId && x.TargetQuestId == request.TargetQuestId && x.Type == request.Type, ct);
        if (exists) throw new ArgumentException("Link already exists");
        var link = new QuestLink
        {
            Id = Guid.NewGuid(),
            SourceQuestId = questId,
            TargetQuestId = request.TargetQuestId,
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
        return (await query.OrderByDescending(x => x.CreatedAt).Take(200).ToListAsync(ct))
            .Select(x => new AppNotificationDto(x.Id, x.QuestId, x.Type, x.Title, x.Body, x.Read, x.CreatedAt)).ToList();
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
            NextIssueNumber = 1
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
        return new BoardDto(board.Id, board.TeamId, board.Name, board.Description, board.Order, board.CreatedAt, board.CreatedByUserId, board.KeyPrefix);
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

    public async Task<List<DashboardDto>> GetDashboardsAsync(Guid userId, CancellationToken ct) =>
        (await _db.Dashboards.AsNoTracking().Where(x => x.OwnerUserId == userId || x.Shared).OrderBy(x => x.Name).ToListAsync(ct))
        .Select(x => new DashboardDto(x.Id, x.OwnerUserId, x.Name, x.Shared, x.LayoutJson)).ToList();

    public async Task<DashboardDto> SaveDashboardAsync(Guid userId, Guid? id, UpsertDashboardRequest request, CancellationToken ct)
    {
        Dashboard entity;
        if (id.HasValue)
            entity = await _db.Dashboards.FirstOrDefaultAsync(x => x.Id == id && x.OwnerUserId == userId, ct)
                ?? throw new KeyNotFoundException("Dashboard not found");
        else
        {
            entity = new Dashboard { Id = Guid.NewGuid(), OwnerUserId = userId };
            _db.Dashboards.Add(entity);
        }
        entity.Name = request.Name.Trim();
        entity.Shared = request.Shared;
        entity.LayoutJson = string.IsNullOrWhiteSpace(request.LayoutJson) ? "[]" : request.LayoutJson;
        _ = JsonDocument.Parse(entity.LayoutJson);
        await _db.SaveChangesAsync(ct);
        return new DashboardDto(entity.Id, entity.OwnerUserId, entity.Name, entity.Shared, entity.LayoutJson);
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

    public async Task<List<GitHubIntegrationDto>> GetGitHubIntegrationsAsync(Guid boardId, CancellationToken ct) =>
        (await _db.GitHubIntegrations.AsNoTracking().Where(x => x.BoardId == boardId).ToListAsync(ct))
        .Select(x => new GitHubIntegrationDto(x.Id, x.BoardId, x.InstallationId, x.RepositoryOwner, x.RepositoryName, x.WebhookSecretConfigurationKey, x.Enabled)).ToList();

    public async Task<GitHubIntegrationDto> SaveGitHubIntegrationAsync(Guid boardId, Guid? id, UpsertGitHubIntegrationRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.WebhookSecretConfigurationKey))
            throw new ArgumentException("GitHub webhook secret must be referenced by configuration key");
        GitHubIntegration entity;
        if (id.HasValue)
            entity = await _db.GitHubIntegrations.FirstOrDefaultAsync(x => x.Id == id && x.BoardId == boardId, ct)
                ?? throw new KeyNotFoundException("Integration not found");
        else
        {
            entity = new GitHubIntegration { Id = Guid.NewGuid(), BoardId = boardId };
            _db.GitHubIntegrations.Add(entity);
        }
        entity.InstallationId = request.InstallationId;
        entity.RepositoryOwner = request.RepositoryOwner.Trim();
        entity.RepositoryName = request.RepositoryName.Trim();
        entity.WebhookSecretConfigurationKey = request.WebhookSecretConfigurationKey.Trim();
        entity.Enabled = request.Enabled;
        await _db.SaveChangesAsync(ct);
        return new GitHubIntegrationDto(entity.Id, entity.BoardId, entity.InstallationId, entity.RepositoryOwner, entity.RepositoryName, entity.WebhookSecretConfigurationKey, entity.Enabled);
    }

    public async Task ProcessGitHubWebhookAsync(string eventName, string payload, string signature, CancellationToken ct)
    {
        var integrations = await _db.GitHubIntegrations.Where(x => x.Enabled).ToListAsync(ct);
        GitHubIntegration? matched = null;
        foreach (var integration in integrations)
        {
            var secret = _configuration[integration.WebhookSecretConfigurationKey];
            if (string.IsNullOrWhiteSpace(secret)) continue;
            if (VerifyGitHubSignature(payload, signature, secret))
            {
                matched = integration;
                break;
            }
        }
        if (matched == null) throw new UnauthorizedAccessException("Invalid GitHub signature");

        using var doc = JsonDocument.Parse(payload);
        var root = doc.RootElement;
        var title = root.TryGetProperty("pull_request", out var pr) ? pr.GetProperty("title").GetString()
            : root.TryGetProperty("head_commit", out var commit) ? commit.GetProperty("message").GetString()
            : root.TryGetProperty("check_run", out var check) ? check.GetProperty("name").GetString()
            : eventName;
        var url = root.TryGetProperty("pull_request", out var pr2) ? pr2.GetProperty("html_url").GetString()
            : root.TryGetProperty("repository", out var repo) ? repo.GetProperty("html_url").GetString()
            : "";
        var externalId = root.TryGetProperty("pull_request", out var pr3) ? pr3.GetProperty("id").ToString()
            : root.TryGetProperty("head_commit", out var commit2) ? commit2.GetProperty("id").GetString()
            : Guid.NewGuid().ToString("N");
        var issueKey = ExtractIssueKey(title ?? "");
        if (string.IsNullOrWhiteSpace(issueKey)) return;
        var quest = await _db.Quests.FirstOrDefaultAsync(q => q.BoardId == matched.BoardId && q.IssueKey == issueKey, ct);
        if (quest == null) return;
        var existing = await _db.DevelopmentLinks.FirstOrDefaultAsync(x => x.QuestId == quest.Id && x.Kind == eventName && x.ExternalId == externalId, ct);
        if (existing == null)
        {
            existing = new DevelopmentLink
            {
                Id = Guid.NewGuid(),
                QuestId = quest.Id,
                GitHubIntegrationId = matched.Id,
                Kind = eventName,
                ExternalId = externalId ?? Guid.NewGuid().ToString("N"),
            };
            _db.DevelopmentLinks.Add(existing);
        }
        existing.Url = url ?? "";
        existing.Title = title ?? eventName;
        existing.Status = root.TryGetProperty("action", out var action) ? action.GetString() : null;
        existing.PayloadJson = payload;
        existing.UpdatedAt = DateTime.UtcNow;
        await EnqueueAsync("WebhookReceived", new { boardId = matched.BoardId, questId = quest.Id, eventName }, ct);
        await _db.SaveChangesAsync(ct);
    }

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
        new(x.Id, x.BoardId, x.SourceColumnId, x.TargetColumnId, x.Name, x.AllowedIssueTypes, x.AllowedRoles, x.ConditionsJson, x.Enabled);

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

    private static string? ExtractIssueKey(string text)
    {
        var match = System.Text.RegularExpressions.Regex.Match(text, @"\b([A-Z][A-Z0-9]+-\d+)\b");
        return match.Success ? match.Groups[1].Value : null;
    }

    private static string Escape(string? value) => (value ?? "").Replace("\"", "\"\"");
}
