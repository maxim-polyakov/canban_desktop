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
            .Include(x => x.NotificationRecipients)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        return q == null ? null : Map(q);
    }

    public async Task<List<QuestDto>> GetByColumnIdAsync(Guid columnId, CancellationToken ct = default)
    {
        var list = await _db.Quests
            .Include(x => x.Assignee)
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
        var maxOrder = await _db.Quests.Where(q => q.ColumnId == request.ColumnId).MaxAsync(q => (int?)q.Order, ct) ?? -1;
        var quest = new Quest
        {
            Id = Guid.NewGuid(),
            ColumnId = request.ColumnId,
            BoardId = col.BoardId,
            Title = request.Title,
            Description = request.Description,
            AssigneeId = request.AssigneeId,
            Order = maxOrder + 1,
            DueDate = request.DueDate,
            CreatedAt = DateTime.UtcNow,
            Category = request.Category,
            XpReward = request.XpReward,
            IsEpic = request.IsEpic,
            ParentEpicId = request.ParentEpicId
        };
        _db.Quests.Add(quest);
        await _db.SaveChangesAsync(ct);
        var recipients = request.NotificationRecipientIds?.Distinct().ToList() ?? new List<Guid>();
        if (recipients.Count == 0 && quest.AssigneeId.HasValue) recipients.Add(quest.AssigneeId.Value);
        await _collaborationService.SetRecipientsAsync(quest.Id, userId, recipients, ct);
        await _notificationService.NotifyAsync(quest.Id, userId, "Задача создана", "Вам назначены уведомления по новой задаче.", ct);
        await _cache.InvalidateAsync("board:detail:" + col.BoardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(col.BoardId, ct);
        return (await GetByIdAsync(quest.Id, ct))!;
    }

    public async Task<QuestDto?> UpdateAsync(Guid id, UpdateQuestRequest request, Guid userId, CancellationToken ct = default)
    {
        var q = await _db.Quests.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (q == null) return null;
        var oldAssigneeId = q.AssigneeId;
        var changes = new List<string>();
        if (request.Title != null && request.Title != q.Title) changes.Add("изменено название");
        if (request.Description != null && request.Description != q.Description) changes.Add("изменено описание");
        if (request.AssigneeIdSet && request.AssigneeId != q.AssigneeId) changes.Add("изменён исполнитель");
        if (request.DueDate != null && request.DueDate != q.DueDate) changes.Add("изменён срок");
        if (request.XpReward != null && request.XpReward != q.XpReward) changes.Add("изменена награда XP");
        if (request.Title != null) q.Title = request.Title;
        if (request.Description != null) q.Description = request.Description;
        if (request.AssigneeIdSet) q.AssigneeId = request.AssigneeId;
        if (request.DueDate != null) q.DueDate = request.DueDate;
        if (request.Category != null) q.Category = request.Category.Value;
        if (request.XpReward != null) q.XpReward = request.XpReward.Value;
        await _db.SaveChangesAsync(ct);
        if (request.NotificationRecipientIds != null)
            await _collaborationService.SetRecipientsAsync(id, userId, request.NotificationRecipientIds, ct);
        else if (request.AssigneeIdSet && request.AssigneeId.HasValue && request.AssigneeId != oldAssigneeId)
        {
            var recipientIds = await _db.QuestNotificationRecipients
                .Where(r => r.QuestId == id).Select(r => r.UserId).ToListAsync(ct);
            if (!recipientIds.Contains(request.AssigneeId.Value)) recipientIds.Add(request.AssigneeId.Value);
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
            if (quest.AssigneeId == null)
                quest.AssigneeId = userId;
            var assigneeId = quest.AssigneeId ?? userId;
            var (xpGained, levelUp, newLevel) = await _xpService.AwardQuestCompletedAsync(assigneeId, quest, ct);
            if (assigneeId != Guid.Empty)
            {
                var teamId = quest.Board.TeamId;
                var user = await _db.Users.FindAsync(new object[] { assigneeId }, ct);
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
            }
            if (quest.IsEpic && quest.AssigneeId.HasValue)
            {
                var teamId = quest.Board.TeamId;
                var assignee = await _db.Users.FindAsync(new object[] { quest.AssigneeId.Value }, ct);
                var activity = await _activityFeed.PublishAsync(teamId, quest.AssigneeId.Value, "EpicClosed", $"{assignee?.DisplayName ?? "Кто-то"} закрыл эпик «{quest.Title}»", null, null, ct);
                await _activityHub.PushToTeamAsync(teamId, activity, ct);
            }
        }

        await _db.SaveChangesAsync(ct);
        if (oldColumnId != quest.ColumnId)
            await _notificationService.NotifyAsync(quest.Id, userId, "Статус задачи изменён", $"Перемещено из «{quest.Column.Title}» в «{targetColumn.Title}».", ct);
        await _cache.InvalidateAsync("board:detail:" + quest.BoardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(quest.BoardId, ct);
        if (justCompleted)
        {
            var assigneeId = quest.AssigneeId ?? userId;
            await _achievementService.TryGrantAchievementsForUserAsync(assigneeId, ct);
        }
        return await GetByIdAsync(quest.Id, ct);
    }

    public async Task<List<QuestDto>> GetArchivedByBoardIdAsync(Guid boardId, CancellationToken ct = default)
    {
        var list = await _db.Quests
            .Include(q => q.Assignee)
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
        q.Category, q.XpReward, q.IsEpic, q.ParentEpicId, q.NotificationRecipients.Select(r => r.UserId).ToList()
    );
}
