namespace CanbanServer.Application.DTOs;

public enum QuestAttachmentOperationStatus
{
    Success,
    NotFound,
    Forbidden,
    StorageError
}

public record QuestAttachmentDto(
    Guid Id,
    Guid QuestId,
    string FileName,
    string ContentType,
    long SizeBytes,
    Guid UploadedByUserId,
    string UploadedByName,
    DateTime CreatedAt);

public record QuestAttachmentDownloadDto(
    string Url,
    DateTime ExpiresAt);
