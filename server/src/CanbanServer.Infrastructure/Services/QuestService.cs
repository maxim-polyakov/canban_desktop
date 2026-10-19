using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using System.Text.Json;

namespace CanbanServer.Infrastructure.Services;

public class QuestService : IQuestService
{
    private readonly CanbanDbContext _db;
    private readonly IActivityFeedService _activityFeed;
    private readonly IActivityHub _activityHub;
    private readonly IBoardHub _boardHub;
    private readonly ICharacterXpService _xpService;
    private readonly IAchievementService _achievementService;
    private readonly IQuestAttachmentService _attachmentService;
    private readonly IQuestCollaborationService _collaborationService;
    private readonly IQuestNotificationService _notificationService;
    private readonly IJiraPlatformService _jira;
    private readonly IProjectAccessService _access;
    private readonly CacheService _cache;

    public QuestService(
        CanbanDbContext db,
        IActivityFeedService activityFeed,
        IActivityHub activityHub,
        IBoardHub boardHub,
        ICharacterXpService xpService,
        IAchievementService achievementService,
        IQuestAttachmentService attachmentService,
        IQuestCollaborationService collaborationService,
        IQuestNotificationService notificationService,
        IJiraPlatformService jira,
        IProjectAccessService access,
        CacheService cache)
    {
        _db = db;
        _activityFeed = activityFeed;
        _activityHub = activityHub;
        _boardHub = boardHub;
        _xpService = xpService;
        _achievementService = achievementService;
        _attachmentService = attachmentService;
        _collaborationService = collaborationService;
        _notificationService = notificationService;
        _jira = jira;
        _access = access;
        _cache = cache;
    }

    public async Task<QuestDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var q = await _db.Quests
            .Include(x => x.Assignee)
            .Include(x => x.Assignees).ThenInclude(x => x.User)
            .Include(x => x.Sprint)
            .Include(x => x.QuestComponents)
            .Include(x => x.QuestReleases)
            .Include(x => x.NotificationRecipients)
            .Include(x => x.ExternalNotificationRecipients)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        return q == null ? null : Map(q);
    }

    public async Task<List<QuestDto>> GetByColumnIdAsync(Guid columnId, CancellationToken ct = default)
    {
        var list = await _db.Quests
            .Include(x => x.Assignee)
            .Include(x => x.Assignees).ThenInclude(x => x.User)
            .Include(x => x.Sprint)
            .Include(x => x.NotificationRecipients)
            .Include(x => x.ExternalNotificationRecipients)
            .Include(x => x.QuestComponents)
            .Include(x => x.QuestReleases)
            .Where(x => x.ColumnId == columnId)
            .OrderBy(x => x.Order)
            .ToListAsync(ct);
        return list.Select(Map).ToList();
    }

    public async Task<QuestDto> CreateAsync(CreateQuestRequest request, Guid userId, CancellationToken ct = default)
    {
        var col = await _db.Columns.Include(c => c.Board).ThenInclude(b => b.Team).FirstOrDefaultAsync(c => c.Id == request.ColumnId, ct)
            ?? throw new ArgumentException("Column not found");
        var assigneeIds = NormalizeAssigneeIds(request.AssigneeIds, request.AssigneeId);
        await ValidateAssigneesAsync(col.Board.TeamId, assigneeIds, ct);
        if (request.SprintId.HasValue)
        {
            var sprintOk = await _db.Sprints.AnyAsync(s => s.Id == request.SprintId && s.BoardId == col.BoardId, ct);
            if (!sprintOk) throw new ArgumentException("Sprint not found on this board");
        }
        var maxOrder = await _db.Quests.Where(q => q.ColumnId == request.ColumnId).MaxAsync(q => (int?)q.Order, ct) ?? -1;
        var issueType = request.IssueType ?? (request.IsEpic ? IssueType.Epic : IssueType.Task);
        var isEpic = request.IsEpic || issueType == IssueType.Epic;
        var issueNumber = col.Board.NextIssueNumber++;
        if (string.IsNullOrWhiteSpace(col.Board.KeyPrefix))
            col.Board.KeyPrefix = string.IsNullOrWhiteSpace(col.Board.Team?.Key) ? "KAN" : col.Board.Team.Key;
        var issueKey = $"{col.Board.KeyPrefix}-{issueNumber}";
        var parentQuestId = request.ParentQuestId ?? request.ParentEpicId;
        await ValidateParentAsync(null, col.BoardId, issueType, parentQuestId, ct);
        ValidateDocumentJson(request.DescriptionDocumentJson);
        await ValidateCatalogIdsAsync(col.BoardId, request.ComponentIds, request.ReleaseIds, ct);
        var quest = new Quest
        {
            Id = Guid.NewGuid(),
            ColumnId = request.ColumnId,
            BoardId = col.BoardId,
            Title = request.Title,
            Description = request.Description,
            AssigneeId = assigneeIds.Count == 0 ? null : assigneeIds[0],
            Order = maxOrder + 1,
            DueDate = request.DueDate,
            CreatedAt = DateTime.UtcNow,
            Category = request.Category,
            XpReward = request.XpReward,
            IsEpic = isEpic,
            ParentEpicId = request.ParentEpicId,
            ParentQuestId = parentQuestId,
            IssueKey = issueKey,
            IssueNumber = issueNumber,
            IssueType = issueType,
            Priority = request.Priority ?? IssuePriority.Medium,
            Labels = NormalizeLabels(request.Labels),
            SprintId = request.SprintId,
            Component = NormalizeOptionalText(request.Component),
            FixVersion = NormalizeOptionalText(request.FixVersion),
            StoryPoints = NormalizeStoryPoints(request.StoryPoints),
            OriginalEstimateMinutes = NormalizeEstimate(request.OriginalEstimateMinutes),
            RemainingEstimateMinutes = NormalizeEstimate(request.RemainingEstimateMinutes),
            DescriptionDocumentJson = request.DescriptionDocumentJson
        };
        quest.Assignees = assigneeIds.Select((id, index) => new QuestAssignee
        {
            Id = Guid.NewGuid(),
            QuestId = quest.Id,
            UserId = id,
            Order = index
        }).ToList();
        quest.QuestComponents = (request.ComponentIds ?? new()).Distinct().Select(x => new QuestComponent { QuestId = quest.Id, ComponentId = x }).ToList();
        quest.QuestReleases = (request.ReleaseIds ?? new()).Distinct().Select(x => new QuestRelease { QuestId = quest.Id, ReleaseId = x }).ToList();
        _db.Quests.Add(quest);
        await _jira.AddChangeAsync(quest.Id, userId, "created", null, null, issueKey, ct);
        await _jira.EnqueueAsync("IssueCreated", new { questId = quest.Id, boardId = quest.BoardId, userId }, ct);
        await _db.SaveChangesAsync(ct);
        var recipients = request.NotificationRecipientIds?.Distinct().ToList() ?? new List<Guid>();
        recipients.AddRange(assigneeIds.Where(id => !recipients.Contains(id)));
        await _collaborationService.SetRecipientsAsync(
            quest.Id,
            userId,
            recipients,
            ct,
            notifyBoard: false,
            externalRecipients: request.ExternalNotificationRecipients);
        await _notificationService.NotifyAsync(quest.Id, userId, "Задача создана", "Вам назначены уведомления по новой задаче.", ct);
        await _cache.InvalidateAsync("board:detail:" + col.BoardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(col.BoardId, ct);
        return (await GetByIdAsync(quest.Id, ct))!;
    }

    public async Task<QuestDto?> UpdateAsync(Guid id, UpdateQuestRequest request, Guid userId, CancellationToken ct = default)
    {
        var q = await _db.Quests
            .Include(x => x.Assignees)
            .Include(x => x.QuestComponents)
            .Include(x => x.QuestReleases)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (q == null) return null;
        var requestedAssigneeIds = GetUpdatedAssigneeIds(request);
        if (requestedAssigneeIds != null)
            await ValidateAssigneesAsync(
                await _db.Boards.Where(b => b.Id == q.BoardId).Select(b => b.TeamId).FirstAsync(ct),
                requestedAssigneeIds,
                ct);
        var currentAssigneeIds = q.Assignees.OrderBy(a => a.Order).Select(a => a.UserId).ToList();
        var assigneesChanged = requestedAssigneeIds != null && !currentAssigneeIds.SequenceEqual(requestedAssigneeIds);
        var changes = new List<string>();
        var auditChanges = new List<(string Field, string? OldValue, string? NewValue)>();
        if (request.Title != null && request.Title != q.Title) changes.Add("изменено название");
        if (request.Description != null && request.Description != q.Description) changes.Add("изменено описание");
        if (assigneesChanged) changes.Add("изменены исполнители");
        if (request.DueDate != null && request.DueDate != q.DueDate) changes.Add("изменён срок");
        if (request.XpReward != null && request.XpReward != q.XpReward) changes.Add("изменена награда XP");
        if (request.IssueType != null && request.IssueType != q.IssueType) changes.Add("изменён тип задачи");
        if (request.Priority != null && request.Priority != q.Priority) changes.Add("изменён приоритет");
        if (request.Labels != null && NormalizeLabels(request.Labels) != (q.Labels ?? string.Empty)) changes.Add("изменены метки");
        if (request.StoryPointsSet && NormalizeStoryPoints(request.StoryPoints) != q.StoryPoints) changes.Add("изменена оценка");
        if ((request.OriginalEstimateMinutesSet && NormalizeEstimate(request.OriginalEstimateMinutes) != q.OriginalEstimateMinutes)
            || (request.RemainingEstimateMinutesSet && NormalizeEstimate(request.RemainingEstimateMinutes) != q.RemainingEstimateMinutes))
            changes.Add("изменена оценка времени");
        if (request.ParentQuestIdSet && request.ParentQuestId != q.ParentQuestId) changes.Add("изменена родительская задача");
        if (request.SprintIdSet && request.SprintId != q.SprintId) changes.Add("изменён спринт");
        if ((request.Component != null && NormalizeOptionalText(request.Component) != q.Component)
            || (request.ComponentIdsSet && !SameIds(request.ComponentIds, q.QuestComponents.Select(x => x.ComponentId))))
            changes.Add("изменены компоненты");
        if ((request.FixVersion != null && NormalizeOptionalText(request.FixVersion) != q.FixVersion)
            || (request.ReleaseIdsSet && !SameIds(request.ReleaseIds, q.QuestReleases.Select(x => x.ReleaseId))))
            changes.Add("изменены релизы");
        if (request.Title != null) { auditChanges.Add(("title", q.Title, request.Title)); q.Title = request.Title; }
        if (request.Description != null) { auditChanges.Add(("description", q.Description, request.Description)); q.Description = request.Description; }
        if (requestedAssigneeIds != null && assigneesChanged)
            q.AssigneeId = requestedAssigneeIds.Count == 0 ? null : requestedAssigneeIds[0];
        if (request.DueDate != null) q.DueDate = request.DueDate;
        if (request.Category != null) q.Category = request.Category.Value;
        if (request.XpReward != null) q.XpReward = request.XpReward.Value;
        if (request.IssueType != null)
        {
            q.IssueType = request.IssueType.Value;
            q.IsEpic = request.IssueType == IssueType.Epic || (request.IsEpic ?? q.IsEpic);
        }
        else if (request.IsEpic != null)
        {
            q.IsEpic = request.IsEpic.Value;
            if (request.IsEpic.Value) q.IssueType = IssueType.Epic;
        }
        if (request.Priority != null) q.Priority = request.Priority.Value;
        if (request.Labels != null) q.Labels = NormalizeLabels(request.Labels);
        if (request.Component != null) q.Component = NormalizeOptionalText(request.Component);
        if (request.FixVersion != null) q.FixVersion = NormalizeOptionalText(request.FixVersion);
        if (request.StoryPointsSet) q.StoryPoints = NormalizeStoryPoints(request.StoryPoints);
        if (request.ParentEpicIdSet) q.ParentEpicId = request.ParentEpicId;
        if (request.ParentQuestIdSet)
        {
            await ValidateParentAsync(q.Id, q.BoardId, request.IssueType ?? q.IssueType, request.ParentQuestId, ct);
            auditChanges.Add(("parent", q.ParentQuestId?.ToString(), request.ParentQuestId?.ToString()));
            q.ParentQuestId = request.ParentQuestId;
            if ((request.IssueType ?? q.IssueType) != IssueType.Epic) q.ParentEpicId = request.ParentQuestId;
        }
        if (request.OriginalEstimateMinutesSet) q.OriginalEstimateMinutes = NormalizeEstimate(request.OriginalEstimateMinutes);
        if (request.RemainingEstimateMinutesSet) q.RemainingEstimateMinutes = NormalizeEstimate(request.RemainingEstimateMinutes);
        if (request.DescriptionDocumentJson != null)
        {
            ValidateDocumentJson(request.DescriptionDocumentJson);
            auditChanges.Add(("descriptionDocument", q.DescriptionDocumentJson, request.DescriptionDocumentJson));
            q.DescriptionDocumentJson = request.DescriptionDocumentJson;
        }
        if (request.ComponentIdsSet || request.ReleaseIdsSet)
        {
            await ValidateCatalogIdsAsync(q.BoardId, request.ComponentIdsSet ? request.ComponentIds : null, request.ReleaseIdsSet ? request.ReleaseIds : null, ct);
            if (request.ComponentIdsSet)
            {
                _db.QuestComponents.RemoveRange(q.QuestComponents);
                q.QuestComponents = (request.ComponentIds ?? new()).Distinct().Select(x => new QuestComponent { QuestId = q.Id, ComponentId = x }).ToList();
            }
            if (request.ReleaseIdsSet)
            {
                _db.QuestReleases.RemoveRange(q.QuestReleases);
                q.QuestReleases = (request.ReleaseIds ?? new()).Distinct().Select(x => new QuestRelease { QuestId = q.Id, ReleaseId = x }).ToList();
            }
        }
        if (request.SprintIdSet)
        {
            if (request.SprintId.HasValue)
            {
                var sprintOk = await _db.Sprints.AnyAsync(s => s.Id == request.SprintId && s.BoardId == q.BoardId, ct);
                if (!sprintOk) throw new ArgumentException("Sprint not found on this board");
            }
            q.SprintId = request.SprintId;
        }

        foreach (var change in auditChanges.Where(x => x.OldValue != x.NewValue))
            await _jira.AddChangeAsync(id, userId, "updated", change.Field, change.OldValue, change.NewValue, ct);
        await _jira.EnqueueAsync("IssueUpdated", new { questId = id, boardId = q.BoardId, userId }, ct);

        if (assigneesChanged)
        {
            await using var transaction = await _db.Database.BeginTransactionAsync(ct);
            await _db.SaveChangesAsync(ct);
            await _db.QuestAssignees.Where(a => a.QuestId == id).ExecuteDeleteAsync(ct);
            foreach (var (assigneeId, order) in requestedAssigneeIds!.Select((userId, index) => (userId, index)))
            {
                var assignmentId = Guid.NewGuid();
                await _db.Database.ExecuteSqlInterpolatedAsync(
                    $"""
                    INSERT INTO "QuestAssignees" ("Id", "QuestId", "UserId", "Order")
                    VALUES ({assignmentId}, {id}, {assigneeId}, {order})
                    """,
                    ct);
            }
            await transaction.CommitAsync(ct);
            _db.ChangeTracker.Clear();
        }
        else
        {
            await _db.SaveChangesAsync(ct);
        }
        if (request.NotificationRecipientIds != null || request.ExternalNotificationRecipients != null)
        {
            var recipientIds = request.NotificationRecipientIds?.Distinct().ToList()
                ?? await _db.QuestNotificationRecipients
                    .Where(r => r.QuestId == id)
                    .Select(r => r.UserId)
                    .ToListAsync(ct);
            var assignedIds = requestedAssigneeIds ?? currentAssigneeIds;
            recipientIds.AddRange(assignedIds.Where(assignedId => !recipientIds.Contains(assignedId)));
            await _collaborationService.SetRecipientsAsync(
                id,
                userId,
                recipientIds,
                ct,
                notifyBoard: false,
                externalRecipients: request.ExternalNotificationRecipients);
        }
        else if (assigneesChanged)
        {
            var recipientIds = await _db.QuestNotificationRecipients
                .Where(r => r.QuestId == id).Select(r => r.UserId).ToListAsync(ct);
            recipientIds.AddRange(requestedAssigneeIds!.Where(assignedId => !recipientIds.Contains(assignedId)));
            await _collaborationService.SetRecipientsAsync(id, userId, recipientIds, ct, notifyBoard: false);
        }
        if (changes.Count > 0)
            await _notificationService.NotifyAsync(id, userId, "Задача изменена", string.Join(", ", changes), ct);
        await _cache.InvalidateAsync("board:detail:" + q.BoardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(q.BoardId, ct);
        return await GetByIdAsync(id, ct);
    }

    public async Task<QuestDto?> MoveAsync(MoveQuestRequest request, Guid userId, CancellationToken ct = default)
    {
        var quest = await _db.Quests
            .Include(q => q.Column)
            .Include(q => q.Board)
            .Include(q => q.Assignee)
            .Include(q => q.Assignees).ThenInclude(a => a.User)
            .FirstOrDefaultAsync(q => q.Id == request.QuestId, ct);
        if (quest == null) return null;

        var targetColumn = await _db.Columns.FirstOrDefaultAsync(c => c.Id == request.TargetColumnId, ct);
        if (targetColumn == null) return null;
        if (targetColumn.BoardId != quest.BoardId) return null;

        var (_, permission) = await _access.GetBoardAccessAsync(quest.BoardId, userId, ct);
        if (permission == null) return null;
        await _jira.ValidateTransitionAsync(quest, request.TargetColumnId, permission.Value, ct);

        var oldColumnId = quest.ColumnId;
        var oldColumnTitle = quest.Column.Title;
        quest.ColumnId = request.TargetColumnId;
        quest.Order = request.NewOrder;
        if (oldColumnId != quest.ColumnId)
        {
            await _jira.AddChangeAsync(quest.Id, userId, "status", "status", oldColumnTitle, targetColumn.Title, ct);
            await _jira.EnqueueAsync("IssueMoved", new { questId = quest.Id, boardId = quest.BoardId, from = oldColumnId, to = targetColumn.Id }, ct);
        }

        var isMovedToDone = targetColumn.Kind == ColumnKind.Done;
        var justCompleted = false;
        if (isMovedToDone && quest.CompletedAt == null)
        {
            justCompleted = true;
            quest.CompletedAt = DateTime.UtcNow;
            if (quest.Assignees.Count == 0)
            {
                var mover = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct)
                    ?? throw new ArgumentException("Mover not found");
                var moverAssignment = new QuestAssignee
                {
                    Id = Guid.NewGuid(),
                    QuestId = quest.Id,
                    UserId = userId,
                    User = mover,
                    Order = 0
                };
                // A preset key on an entity discovered through a navigation is tracked as Modified (UPDATE of a missing row).
                _db.QuestAssignees.Add(moverAssignment);
                quest.Assignees.Add(moverAssignment);
                quest.AssigneeId = userId;
            }

            var assignees = quest.Assignees
                .OrderBy(a => a.Order)
                .GroupBy(a => a.UserId)
                .Select(g => g.First())
                .ToList();
            quest.AssigneeId = assignees[0].UserId;
            var teamId = quest.Board.TeamId;
            foreach (var assignment in assignees)
            {
                var assigneeId = assignment.UserId;
                var user = assignment.User;
                var (xpGained, levelUp, newLevel) = await _xpService.AwardQuestCompletedAsync(assigneeId, quest, ct);
                var title = $"{user?.DisplayName ?? "Кто-то"} закрыл квест «{quest.Title}»";
                if (xpGained > 0)
                    title += $" (+{xpGained} XP)";
                var activity = await _activityFeed.PublishAsync(teamId, assigneeId, "QuestCompleted", title, null, $"{{ \"questId\": \"{quest.Id}\", \"xp\": {xpGained} }}", ct);
                await _activityHub.PushToTeamAsync(teamId, activity, ct);
                if (levelUp && newLevel > 0)
                {
                    var levelActivity = await _activityFeed.PublishAsync(teamId, assigneeId, "LevelUp", $"{user?.DisplayName ?? "Кто-то"} получил уровень {newLevel}!", null, $"{{ \"level\": {newLevel} }}", ct);
                    await _activityHub.PushToTeamAsync(teamId, levelActivity, ct);
                }
                if (quest.IsEpic)
                {
                    var epicActivity = await _activityFeed.PublishAsync(teamId, assigneeId, "EpicClosed", $"{user?.DisplayName ?? "Кто-то"} закрыл эпик «{quest.Title}»", null, null, ct);
                    await _activityHub.PushToTeamAsync(teamId, epicActivity, ct);
                }
            }
        }

        await _db.SaveChangesAsync(ct);
        if (justCompleted)
        {
            var recipientIds = await _db.QuestNotificationRecipients
                .Where(r => r.QuestId == quest.Id)
                .Select(r => r.UserId)
                .ToListAsync(ct);
            recipientIds.AddRange(quest.Assignees.Select(a => a.UserId).Where(id => !recipientIds.Contains(id)));
            await _collaborationService.SetRecipientsAsync(quest.Id, userId, recipientIds, ct, notifyBoard: false);
        }
        if (oldColumnId != quest.ColumnId)
        {
            await _notificationService.NotifyAsync(quest.Id, userId, "Статус задачи изменён", $"Перемещено из «{oldColumnTitle}» в «{targetColumn.Title}».", ct);
        }
        await _cache.InvalidateAsync("board:detail:" + quest.BoardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(quest.BoardId, ct);
        if (justCompleted)
        {
            foreach (var assigneeId in quest.Assignees.Select(a => a.UserId).Distinct())
                await _achievementService.TryGrantAchievementsForUserAsync(assigneeId, ct);
        }
        return await GetByIdAsync(quest.Id, ct);
    }

    public async Task<List<QuestDto>> GetArchivedByBoardIdAsync(Guid boardId, CancellationToken ct = default)
    {
        var list = await _db.Quests
            .Include(q => q.Assignee)
            .Include(q => q.Assignees).ThenInclude(a => a.User)
            .Include(q => q.Column)
            .Include(q => q.Sprint)
            .Include(q => q.NotificationRecipients)
            .Include(q => q.ExternalNotificationRecipients)
            .Include(q => q.QuestComponents)
            .Include(q => q.QuestReleases)
            .Where(q => q.BoardId == boardId && q.Column.Kind == ColumnKind.Archive)
            .OrderByDescending(q => q.CompletedAt ?? q.CreatedAt)
            .ThenBy(q => q.Order)
            .ToListAsync(ct);

        return list.Select(Map).ToList();
    }

    public async Task<List<QuestDto>> GetBacklogByBoardIdAsync(Guid boardId, QuestFilterRequest? filter = null, CancellationToken ct = default)
    {
        filter ??= new QuestFilterRequest(BacklogOnly: true, UnassignedSprint: true);
        if (filter.BacklogOnly != false)
            filter = filter with { BacklogOnly = true };
        if (filter.UnassignedSprint == null && filter.SprintId == null)
            filter = filter with { UnassignedSprint = true };
        return await FilterByBoardIdAsync(boardId, filter, ct);
    }

    public async Task<List<QuestDto>> FilterByBoardIdAsync(Guid boardId, QuestFilterRequest filter, CancellationToken ct = default)
    {
        var query = _db.Quests
            .Include(q => q.Assignee)
            .Include(q => q.Assignees).ThenInclude(a => a.User)
            .Include(q => q.Column)
            .Include(q => q.Sprint)
            .Include(q => q.NotificationRecipients)
            .Include(q => q.ExternalNotificationRecipients)
            .Include(q => q.QuestComponents)
            .Include(q => q.QuestReleases)
            .Where(q => q.BoardId == boardId);

        if (filter.BacklogOnly == true)
            query = query.Where(q => q.Column.Kind == ColumnKind.Backlog || q.SprintId == null);
        if (filter.SprintId.HasValue)
            query = query.Where(q => q.SprintId == filter.SprintId);
        if (filter.UnassignedSprint == true)
            query = query.Where(q => q.SprintId == null);
        if (filter.IssueType.HasValue)
            query = query.Where(q => q.IssueType == filter.IssueType);
        if (filter.Priority.HasValue)
            query = query.Where(q => q.Priority == filter.Priority);
        if (filter.AssigneeId.HasValue)
            query = query.Where(q => q.Assignees.Any(a => a.UserId == filter.AssigneeId) || q.AssigneeId == filter.AssigneeId);
        if (filter.ColumnId.HasValue)
            query = query.Where(q => q.ColumnId == filter.ColumnId);
        if (!string.IsNullOrWhiteSpace(filter.Label))
        {
            var label = filter.Label.Trim().ToLowerInvariant();
            query = query.Where(q => q.Labels.ToLower().Contains(label));
        }
        if (!string.IsNullOrWhiteSpace(filter.Component))
        {
            var component = filter.Component.Trim().ToLowerInvariant();
            query = query.Where(q => q.Component != null && q.Component.ToLower().Contains(component));
        }
        if (!string.IsNullOrWhiteSpace(filter.FixVersion))
        {
            var version = filter.FixVersion.Trim().ToLowerInvariant();
            query = query.Where(q => q.FixVersion != null && q.FixVersion.ToLower().Contains(version));
        }
        if (!string.IsNullOrWhiteSpace(filter.Text))
        {
            var text = filter.Text.Trim().ToLowerInvariant();
            query = query.Where(q =>
                q.Title.ToLower().Contains(text) ||
                (q.Description != null && q.Description.ToLower().Contains(text)) ||
                q.IssueKey.ToLower().Contains(text));
        }

        var list = await query
            .OrderBy(q => q.Column.Order)
            .ThenBy(q => q.Order)
            .ToListAsync(ct);
        return list.Select(Map).ToList();
    }

    public async Task<ArchiveCompletedQuestsResult?> ArchiveCompletedAsync(Guid boardId, Guid userId, CancellationToken ct = default)
    {
        var boardExists = await _db.Boards.AnyAsync(b => b.Id == boardId, ct);
        if (!boardExists) return null;

        var archiveColumn = await _db.Columns
            .FirstOrDefaultAsync(c => c.BoardId == boardId && c.Kind == ColumnKind.Archive, ct);

        if (archiveColumn == null)
        {
            var maxColumnOrder = await _db.Columns
                .Where(c => c.BoardId == boardId)
                .MaxAsync(c => (int?)c.Order, ct) ?? -1;

            archiveColumn = new Column
            {
                Id = Guid.NewGuid(),
                BoardId = boardId,
                Title = "Архив",
                Order = maxColumnOrder + 1,
                Kind = ColumnKind.Archive,
                CreatedAt = DateTime.UtcNow
            };
            _db.Columns.Add(archiveColumn);
        }

        var completedQuests = await _db.Quests
            .Include(q => q.Column)
            .Where(q => q.BoardId == boardId && q.Column.Kind == ColumnKind.Done)
            .OrderBy(q => q.Column.Order)
            .ThenBy(q => q.Order)
            .ToListAsync(ct);

        if (completedQuests.Count == 0)
        {
            await _db.SaveChangesAsync(ct);
            return new ArchiveCompletedQuestsResult(0);
        }

        var nextArchiveOrder = (await _db.Quests
            .Where(q => q.ColumnId == archiveColumn.Id)
            .MaxAsync(q => (int?)q.Order, ct) ?? -1) + 1;

        foreach (var quest in completedQuests)
        {
            quest.ColumnId = archiveColumn.Id;
            quest.Order = nextArchiveOrder++;
            quest.CompletedAt ??= DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(ct);
        foreach (var quest in completedQuests)
            await _notificationService.NotifyAsync(quest.Id, userId, "Задача архивирована", "Выполненная задача перемещена в архив.", ct);
        await _cache.InvalidateAsync("board:detail:" + boardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(boardId, ct);

        return new ArchiveCompletedQuestsResult(completedQuests.Count);
    }

    public async Task ReorderAsync(ReorderQuestsRequest request, CancellationToken ct = default)
    {
        Guid? boardId = null;
        for (var i = 0; i < request.QuestIdsInOrder.Count; i++)
        {
            var id = request.QuestIdsInOrder[i];
            var q = await _db.Quests.FirstOrDefaultAsync(x => x.Id == id && x.ColumnId == request.ColumnId, ct);
            if (q != null)
            {
                q.Order = i;
                boardId = q.BoardId;
            }
        }
        await _db.SaveChangesAsync(ct);
        if (boardId.HasValue)
        {
            await _cache.InvalidateAsync("board:detail:" + boardId.Value, ct);
            await _boardHub.NotifyBoardUpdatedAsync(boardId.Value, ct);
        }
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var q = await _db.Quests.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (q == null) return false;
        var boardId = q.BoardId;
        await _attachmentService.DeleteFilesForQuestIdsAsync(new[] { id }, ct);
        _db.Quests.Remove(q);
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + boardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(boardId, ct);
        return true;
    }

    private static QuestDto Map(Quest q) => BoardService.MapQuest(q);

    private static bool SameIds(IEnumerable<Guid>? requested, IEnumerable<Guid> current) =>
        (requested ?? Enumerable.Empty<Guid>()).ToHashSet().SetEquals(current);

    private static string NormalizeLabels(string? labels)
    {
        if (string.IsNullOrWhiteSpace(labels)) return string.Empty;
        return string.Join(",", labels
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => x.Trim())
            .Where(x => x.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase));
    }

    private static string? NormalizeOptionalText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length > 200 ? trimmed[..200] : trimmed;
    }

    private static int? NormalizeStoryPoints(int? storyPoints)
    {
        if (!storyPoints.HasValue) return null;
        if (storyPoints is < 0 or > 100)
            throw new ArgumentException("Story points must be between 0 and 100");
        return storyPoints;
    }

    private static int? NormalizeEstimate(int? minutes)
    {
        if (!minutes.HasValue) return null;
        if (minutes is < 0 or > 5256000) throw new ArgumentException("Estimate is out of range");
        return minutes;
    }

    private static void ValidateDocumentJson(string? json)
    {
        if (!string.IsNullOrWhiteSpace(json)) _ = JsonDocument.Parse(json);
    }

    private async Task ValidateParentAsync(Guid? questId, Guid boardId, IssueType issueType, Guid? parentId, CancellationToken ct)
    {
        if (!parentId.HasValue)
        {
            if (issueType == IssueType.Subtask) throw new ArgumentException("A subtask requires a parent");
            return;
        }
        if (parentId == questId) throw new ArgumentException("An issue cannot be its own parent");
        if (issueType == IssueType.Epic) throw new ArgumentException("An epic cannot have a parent");
        var parent = await _db.Quests.AsNoTracking().FirstOrDefaultAsync(q => q.Id == parentId, ct)
            ?? throw new ArgumentException("Parent issue not found");
        if (parent.BoardId != boardId) throw new ArgumentException("Parent issue must be on the same board");
        if (issueType == IssueType.Subtask && parent.IssueType == IssueType.Subtask)
            throw new ArgumentException("A subtask cannot parent another subtask");
        if (issueType != IssueType.Subtask && parent.IssueType != IssueType.Epic)
            throw new ArgumentException("Story, task, and bug parents must be epics");
        var seen = new HashSet<Guid>();
        var cursor = parent.ParentQuestId ?? parent.ParentEpicId;
        while (cursor.HasValue)
        {
            if (cursor == questId || !seen.Add(cursor.Value)) throw new ArgumentException("Hierarchy cycle detected");
            cursor = await _db.Quests.AsNoTracking().Where(q => q.Id == cursor).Select(q => q.ParentQuestId ?? q.ParentEpicId).FirstOrDefaultAsync(ct);
        }
    }

    private async Task ValidateCatalogIdsAsync(Guid boardId, IReadOnlyCollection<Guid>? componentIds, IReadOnlyCollection<Guid>? releaseIds, CancellationToken ct)
    {
        if (componentIds is { Count: > 0 })
        {
            var distinct = componentIds.Distinct().ToList();
            if (await _db.BoardComponents.CountAsync(x => x.BoardId == boardId && distinct.Contains(x.Id), ct) != distinct.Count)
                throw new ArgumentException("Every component must belong to the board");
        }
        if (releaseIds is { Count: > 0 })
        {
            var distinct = releaseIds.Distinct().ToList();
            if (await _db.BoardReleases.CountAsync(x => x.BoardId == boardId && distinct.Contains(x.Id), ct) != distinct.Count)
                throw new ArgumentException("Every release must belong to the board");
        }
    }

    private static List<Guid> NormalizeAssigneeIds(IEnumerable<Guid>? assigneeIds, Guid? legacyAssigneeId)
    {
        var result = assigneeIds?.Distinct().ToList()
            ?? (legacyAssigneeId.HasValue ? new List<Guid> { legacyAssigneeId.Value } : new List<Guid>());
        if (result.Contains(Guid.Empty))
            throw new ArgumentException("Assignee id cannot be empty");
        return result;
    }

    private static List<Guid>? GetUpdatedAssigneeIds(UpdateQuestRequest request)
    {
        if (request.AssigneeIdsSet)
            return NormalizeAssigneeIds(request.AssigneeIds, null);
        if (request.AssigneeIdSet)
            return NormalizeAssigneeIds(null, request.AssigneeId);
        return null;
    }

    private async Task ValidateAssigneesAsync(Guid teamId, IReadOnlyCollection<Guid> assigneeIds, CancellationToken ct)
    {
        if (assigneeIds.Count == 0) return;
        var allowedIds = await _db.TeamMembers
            .Where(m => m.TeamId == teamId && assigneeIds.Contains(m.UserId))
            .Select(m => m.UserId)
            .ToListAsync(ct);
        var ownerId = await _db.Teams
            .Where(t => t.Id == teamId)
            .Select(t => t.OwnerId)
            .FirstOrDefaultAsync(ct);
        if (ownerId.HasValue)
            allowedIds.Add(ownerId.Value);
        if (assigneeIds.Any(id => !allowedIds.Contains(id)))
            throw new ArgumentException("Every assignee must be a member or owner of the board team");
    }
}
