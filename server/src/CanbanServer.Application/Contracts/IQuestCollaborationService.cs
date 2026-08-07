using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface IQuestCollaborationService
{
    Task<QuestAttachmentOperationStatus> SetRecipientsAsync(
        Guid questId,
        Guid actorUserId,
        IReadOnlyCollection<Guid> userIds,
        CancellationToken ct = default,
        bool notifyBoard = true);
    Task<(QuestAttachmentOperationStatus Status, List<QuestCommentDto> Comments)> GetCommentsAsync(Guid questId, Guid userId, CancellationToken ct = default);
    Task<(QuestAttachmentOperationStatus Status, QuestCommentDto? Comment)> AddCommentAsync(Guid questId, Guid userId, string text, CancellationToken ct = default);
    Task<QuestAttachmentOperationStatus> DeleteCommentAsync(Guid questId, Guid commentId, Guid userId, CancellationToken ct = default);
}
