using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;

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
        _cache = cache;
    }

    public async Task<QuestDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var q = await _db.Quests
            .Include(x => x.Assignee)
            .Include(x => x.Assignees).ThenInclude(x => x.User)
            .Include(x => x.NotificationRecipients)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        return q == null ? null : Map(q);
    }

    public async Task<List<QuestDto>> GetByColumnIdAsync(Guid columnId, CancellationToken ct = default)
    {
        var list = await _db.Quests
            .Include(x => x.Assignee)
            .Include(x => x.Assignees).ThenInclude(x => x.User)
            .Include(x => x.NotificationRecipients)
            .Where(x => x.ColumnId == columnId)
            .OrderBy(x => x.Order)
            .ToListAsync(ct);
        return list.Select(Map).ToList();
    }

    public async Task<QuestDto> CreateAsync(CreateQuestRequest request, Guid userId, CancellationToken ct = default)
    {
        var col = await _db.Columns.Include(c => c.Board).FirstOrDefaultAsync(c => c.Id == request.ColumnId, ct)
            ?? throw new ArgumentException("Column not found");
        var assigneeIds = NormalizeAssigneeIds(request.AssigneeIds, request.AssigneeId);
        await ValidateAssigneesAsync(col.Board.TeamId, assigneeIds, ct);
        var maxOrder = await _db.Quests.Where(q => q.ColumnId == request.ColumnId).MaxAsync(q => (int?)q.Order, ct) ?? -1;
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
            IsEpic = request.IsEpic,
            ParentEpicId = request.ParentEpicId
        };
        quest.Assignees = assigneeIds.Select((id, index) => new QuestAssignee
        {
            Id = Guid.NewGuid(),
            QuestId = quest.Id,
            UserId = id,
            Order = index
        }).ToList();
        _db.Quests.Add(quest);
        await _db.SaveChangesAsync(ct);
        var recipients = request.NotificationRecipientIds?.Distinct().ToList() ?? new List<Guid>();
        recipients.AddRange(assigneeIds.Where(id => !recipients.Contains(id)));
        await _collaborationService.SetRecipientsAsync(quest.Id, userId, recipients, ct);
        await _notificationService.NotifyAsync(quest.Id, userId, "Задача создана", "Вам назначены уведомления по новой задаче.", ct);
        await _cache.InvalidateAsync("board:detail:" + col.BoardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(col.BoardId, ct);
        return (await GetByIdAsync(quest.Id, ct))!;
    }

    public async Task<QuestDto?> UpdateAsync(Guid id, UpdateQuestRequest request, Guid userId, CancellationToken ct = default)
    {
        var q = await _db.Quests
            .Include(x => x.Assignees)
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
        if (request.Title != null && request.Title != q.Title) changes.Add("изменено название");
        if (request.Description != null && request.Description != q.Description) changes.Add("изменено описание");
        if (assigneesChanged) changes.Add("изменены исполнители");
        if (request.DueDate != null && request.DueDate != q.DueDate) changes.Add("изменён срок");
        if (request.XpReward != null && request.XpReward != q.XpReward) changes.Add("изменена награда XP");
        if (request.Title != null) q.Title = request.Title;
        if (request.Description != null) q.Description = request.Description;
        if (requestedAssigneeIds != null && assigneesChanged)
            q.AssigneeId = requestedAssigneeIds.Count == 0 ? null : requestedAssigneeIds[0];
        if (request.DueDate != null) q.DueDate = request.DueDate;
        if (request.Category != null) q.Category = request.Category.Value;
        if (request.XpReward != null) q.XpReward = request.XpReward.Value;

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
        if (request.NotificationRecipientIds != null)
        {
            var recipientIds = request.NotificationRecipientIds.Distinct().ToList();
            var assignedIds = requestedAssigneeIds ?? currentAssigneeIds;
            recipientIds.AddRange(assignedIds.Where(assignedId => !recipientIds.Contains(assignedId)));
            await _collaborationService.SetRecipientsAsync(id, userId, recipientIds, ct);
        }
        else if (assigneesChanged)
        {
            var recipientIds = await _db.QuestNotificationRecipients
                .Where(r => r.QuestId == id).Select(r => r.UserId).ToListAsync(ct);
            recipientIds.AddRange(requestedAssigneeIds!.Where(assignedId => !recipientIds.Contains(assignedId)));
            await _collaborationService.SetRecipientsAsync(id, userId, recipientIds, ct);
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

        var oldColumnId = quest.ColumnId;
        quest.ColumnId = request.TargetColumnId;
        quest.Order = request.NewOrder;

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
                quest.Assignees.Add(new QuestAssignee
                {
                    Id = Guid.NewGuid(),
                    QuestId = quest.Id,
                    UserId = userId,
                    User = mover,
                    Order = 0
                });
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
            await _collaborationService.SetRecipientsAsync(quest.Id, userId, recipientIds, ct);
        }
        if (oldColumnId != quest.ColumnId)
            await _notificationService.NotifyAsync(quest.Id, userId, "Статус задачи изменён", $"Перемещено из «{quest.Column.Title}» в «{targetColumn.Title}».", ct);
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
            .Include(q => q.NotificationRecipients)
            .Where(q => q.BoardId == boardId && q.Column.Kind == ColumnKind.Archive)
            .OrderByDescending(q => q.CompletedAt ?? q.CreatedAt)
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

    private static QuestDto Map(Quest q) => new(
        q.Id, q.ColumnId, q.BoardId, q.Title, q.Description, q.AssigneeId,
        q.Assignee?.DisplayName, q.Assignee?.AvatarUrl, q.Order, q.DueDate, q.CreatedAt, q.CompletedAt,
        q.Category, q.XpReward, q.IsEpic, q.ParentEpicId, q.NotificationRecipients.Select(r => r.UserId).ToList(),
        q.Assignees.OrderBy(a => a.Order).Select(a => new QuestAssigneeDto(a.UserId, a.User.DisplayName, a.User.AvatarUrl)).ToList(),
        q.Assignees.OrderBy(a => a.Order).Select(a => a.UserId).ToList()
    );

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
