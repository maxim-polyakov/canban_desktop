using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public class QuestCollaborationService : IQuestCollaborationService
{
    private readonly CanbanDbContext _db;
    private readonly IQuestAttachmentService _access;
    private readonly IQuestNotificationService _notifications;
    private readonly IBoardHub _boardHub;

    public QuestCollaborationService(CanbanDbContext db, IQuestAttachmentService access, IQuestNotificationService notifications, IBoardHub boardHub)
    {
        _db = db;
        _access = access;
        _notifications = notifications;
        _boardHub = boardHub;
    }

    public async Task<QuestAttachmentOperationStatus> SetRecipientsAsync(Guid questId, Guid actorUserId, IReadOnlyCollection<Guid> userIds, CancellationToken ct = default)
    {
        var access = await _access.CheckQuestAccessAsync(questId, actorUserId, ct);
        if (access != QuestAttachmentOperationStatus.Success) return access;
        var teamId = await _db.Quests.Where(q => q.Id == questId).Select(q => q.Board.TeamId).FirstAsync(ct);
        var allowed = await _db.TeamMembers.Where(m => m.TeamId == teamId).Select(m => m.UserId).ToListAsync(ct);
        var ownerId = await _db.Teams.Where(t => t.Id == teamId).Select(t => t.OwnerId).FirstOrDefaultAsync(ct);
        if (ownerId.HasValue) allowed.Add(ownerId.Value);
        var requested = userIds.Distinct().ToList();
        if (requested.Any(id => !allowed.Contains(id))) return QuestAttachmentOperationStatus.Forbidden;

        var existing = await _db.QuestNotificationRecipients.Where(r => r.QuestId == questId).ToListAsync(ct);
        _db.QuestNotificationRecipients.RemoveRange(existing.Where(r => !requested.Contains(r.UserId)));
        var existingIds = existing.Select(r => r.UserId).ToHashSet();
        _db.QuestNotificationRecipients.AddRange(requested.Where(id => !existingIds.Contains(id)).Select(id =>
            new QuestNotificationRecipient { Id = Guid.NewGuid(), QuestId = questId, UserId = id }));
        await _db.SaveChangesAsync(ct);
        var boardId = await _db.Quests.Where(q => q.Id == questId).Select(q => q.BoardId).FirstAsync(ct);
        await _boardHub.NotifyBoardUpdatedAsync(boardId, ct);
        return QuestAttachmentOperationStatus.Success;
    }

    public async Task<(QuestAttachmentOperationStatus Status, List<QuestCommentDto> Comments)> GetCommentsAsync(Guid questId, Guid userId, CancellationToken ct = default)
    {
        var access = await _access.CheckQuestAccessAsync(questId, userId, ct);
        if (access != QuestAttachmentOperationStatus.Success) return (access, new());
        var comments = await _db.QuestComments.AsNoTracking().Include(c => c.AuthorUser)
            .Where(c => c.QuestId == questId).OrderBy(c => c.CreatedAt).ToListAsync(ct);
        return (QuestAttachmentOperationStatus.Success, comments.Select(Map).ToList());
    }

    public async Task<(QuestAttachmentOperationStatus Status, QuestCommentDto? Comment)> AddCommentAsync(Guid questId, Guid userId, string text, CancellationToken ct = default)
    {
        var access = await _access.CheckQuestAccessAsync(questId, userId, ct);
        if (access != QuestAttachmentOperationStatus.Success) return (access, null);
        var comment = new QuestComment { Id = Guid.NewGuid(), QuestId = questId, AuthorUserId = userId, Text = text.Trim(), CreatedAt = DateTime.UtcNow };
        _db.QuestComments.Add(comment);
        await _db.SaveChangesAsync(ct);
        comment.AuthorUser = await _db.Users.FirstAsync(u => u.Id == userId, ct);
        var boardId = await _db.Quests.Where(q => q.Id == questId).Select(q => q.BoardId).FirstAsync(ct);
        await _boardHub.NotifyBoardUpdatedAsync(boardId, ct);
        await _notifications.NotifyAsync(questId, userId, "Новый комментарий", comment.Text, ct);
        return (QuestAttachmentOperationStatus.Success, Map(comment));
    }

    public async Task<QuestAttachmentOperationStatus> DeleteCommentAsync(Guid questId, Guid commentId, Guid userId, CancellationToken ct = default)
    {
        var access = await _access.CheckQuestAccessAsync(questId, userId, ct);
        if (access != QuestAttachmentOperationStatus.Success) return access;
        var comment = await _db.QuestComments.FirstOrDefaultAsync(c => c.Id == commentId && c.QuestId == questId, ct);
        if (comment == null) return QuestAttachmentOperationStatus.NotFound;
        var teamId = await _db.Quests.Where(q => q.Id == questId).Select(q => q.Board.TeamId).FirstAsync(ct);
        var isOwner = await _db.Teams.AnyAsync(t => t.Id == teamId && t.OwnerId == userId, ct);
        if (comment.AuthorUserId != userId && !isOwner) return QuestAttachmentOperationStatus.Forbidden;
        var preview = comment.Text;
        _db.QuestComments.Remove(comment);
        await _db.SaveChangesAsync(ct);
        var boardId = await _db.Quests.Where(q => q.Id == questId).Select(q => q.BoardId).FirstAsync(ct);
        await _boardHub.NotifyBoardUpdatedAsync(boardId, ct);
        await _notifications.NotifyAsync(questId, userId, "Комментарий удалён", preview, ct);
        return QuestAttachmentOperationStatus.Success;
    }

    private static QuestCommentDto Map(QuestComment c) => new(c.Id, c.QuestId, c.AuthorUserId, c.AuthorUser.DisplayName, c.AuthorUser.AvatarUrl, c.Text, c.CreatedAt);
}
