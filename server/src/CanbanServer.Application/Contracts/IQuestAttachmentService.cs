using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface IQuestAttachmentService
{
    Task<QuestAttachmentOperationStatus> CheckQuestAccessAsync(
        Guid questId,
        Guid userId,
        CancellationToken ct = default);

    Task<QuestAttachmentOperationStatus> CheckColumnAccessAsync(
        Guid columnId,
        Guid userId,
        CancellationToken ct = default);

    Task<(QuestAttachmentOperationStatus Status, List<QuestAttachmentDto> Items)> GetByQuestAsync(
        Guid questId,
        Guid userId,
        CancellationToken ct = default);

    Task<(QuestAttachmentOperationStatus Status, QuestAttachmentDto? Attachment)> UploadAsync(
        Guid questId,
        Guid userId,
        Stream data,
        string fileName,
        string contentType,
        long sizeBytes,
        CancellationToken ct = default);

    Task<(QuestAttachmentOperationStatus Status, QuestAttachmentDownloadDto? Download)> GetDownloadAsync(
        Guid questId,
        Guid attachmentId,
        Guid userId,
        CancellationToken ct = default);

    Task<QuestAttachmentOperationStatus> DeleteAsync(
        Guid questId,
        Guid attachmentId,
        Guid userId,
        CancellationToken ct = default);

    Task DeleteFilesForQuestIdsAsync(
        IReadOnlyCollection<Guid> questIds,
        CancellationToken ct = default);
}
