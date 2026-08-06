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
    private readonly IEmailSender _emailSender;
    private readonly IQuestAttachmentService _attachmentService;
    private readonly CacheService _cache;

    public QuestService(
        CanbanDbContext db,
        IActivityFeedService activityFeed,
        IActivityHub activityHub,
        IBoardHub boardHub,
        ICharacterXpService xpService,
        IAchievementService achievementService,
        IEmailSender emailSender,
        IQuestAttachmentService attachmentService,
        CacheService cache)
    {
        _db = db;
        _activityFeed = activityFeed;
        _activityHub = activityHub;
        _boardHub = boardHub;
        _xpService = xpService;
        _achievementService = achievementService;
        _emailSender = emailSender;
        _attachmentService = attachmentService;
        _cache = cache;
    }

    public async Task<QuestDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var q = await _db.Quests
            .Include(x => x.Assignee)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        return q == null ? null : Map(q);
    }

    public async Task<List<QuestDto>> GetByColumnIdAsync(Guid columnId, CancellationToken ct = default)
    {
        var list = await _db.Quests
            .Include(x => x.Assignee)
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
        if (quest.AssigneeId.HasValue)
        {
            var assignee = await _db.Users.FirstOrDefaultAsync(u => u.Id == quest.AssigneeId.Value, ct);
            if (assignee != null)
                await SendAssignmentNotificationAsync(assignee, quest, col.Board.Name, ct);
        }
        await _cache.InvalidateAsync("board:detail:" + col.BoardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(col.BoardId, ct);
        return (await GetByIdAsync(quest.Id, ct))!;
    }

    public async Task<QuestDto?> UpdateAsync(Guid id, UpdateQuestRequest request, CancellationToken ct = default)
    {
        var q = await _db.Quests.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (q == null) return null;
        User? newAssignee = null;
        var assigneeChanged = request.AssigneeIdSet
            && request.AssigneeId.HasValue
            && q.AssigneeId != request.AssigneeId;
        if (assigneeChanged)
            newAssignee = await _db.Users.FirstOrDefaultAsync(u => u.Id == request.AssigneeId!.Value, ct);
        if (request.Title != null) q.Title = request.Title;
        if (request.Description != null) q.Description = request.Description;
        if (request.AssigneeIdSet) q.AssigneeId = request.AssigneeId;
        if (request.DueDate != null) q.DueDate = request.DueDate;
        if (request.Category != null) q.Category = request.Category.Value;
        if (request.XpReward != null) q.XpReward = request.XpReward.Value;
        await _db.SaveChangesAsync(ct);
        if (newAssignee != null)
        {
            var boardName = await _db.Boards
                .Where(b => b.Id == q.BoardId)
                .Select(b => b.Name)
                .FirstOrDefaultAsync(ct) ?? "Без названия";
            await SendAssignmentNotificationAsync(newAssignee, q, boardName, ct);
        }
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
            .Where(q => q.BoardId == boardId && q.Column.Kind == ColumnKind.Archive)
            .OrderByDescending(q => q.CompletedAt ?? q.CreatedAt)
            .ThenBy(q => q.Order)
            .ToListAsync(ct);

        return list.Select(Map).ToList();
    }

    public async Task<ArchiveCompletedQuestsResult?> ArchiveCompletedAsync(Guid boardId, CancellationToken ct = default)
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
        q.Category, q.XpReward, q.IsEpic, q.ParentEpicId
    );

    private async Task SendAssignmentNotificationAsync(User assignee, Quest quest, string boardName, CancellationToken ct)
    {
        var encodedName = System.Net.WebUtility.HtmlEncode(assignee.DisplayName);
        var encodedTitle = System.Net.WebUtility.HtmlEncode(quest.Title);
        var encodedBoardName = System.Net.WebUtility.HtmlEncode(boardName);
        var description = string.IsNullOrWhiteSpace(quest.Description)
            ? string.Empty
            : $"<p><strong>Описание:</strong><br>{System.Net.WebUtility.HtmlEncode(quest.Description).Replace("\r\n", "<br>").Replace("\n", "<br>")}</p>";
        var dueDate = quest.DueDate.HasValue
            ? $"<p><strong>Срок:</strong> {quest.DueDate.Value:dd.MM.yyyy}</p>"
            : string.Empty;
        var subject = $"Вам назначена задача «{quest.Title}»";
        var body = $@"
<!DOCTYPE html>
<html>
<head><meta charset=""utf-8""></head>
<body style=""font-family: sans-serif; line-height: 1.5;"">
  <h2>Вам назначена новая задача</h2>
  <p>Здравствуйте, <strong>{encodedName}</strong>.</p>
  <p>На доске <strong>{encodedBoardName}</strong> вам назначена задача:</p>
  <p style=""font-size: 1.1rem;""><strong>{encodedTitle}</strong></p>
  {description}
  {dueDate}
  <p><strong>Награда:</strong> {quest.XpReward} XP</p>
  <p style=""color: #6b7280; font-size: 0.9em;"">Это письмо отправлено автоматически.</p>
</body>
</html>";

        await _emailSender.SendAsync(assignee.Email, assignee.DisplayName, subject, body.Trim(), ct);
    }
}
