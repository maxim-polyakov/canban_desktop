namespace CanbanServer.Application.Contracts;

public interface IQuestAttachmentStorageService
{
    Task<string?> UploadAsync(
        Guid teamId,
        Guid questId,
        Stream data,
        string contentType,
        string fileName,
        CancellationToken ct = default);

    Task<bool> DeleteAsync(string storageKey, CancellationToken ct = default);

    string? CreateDownloadUrl(
        string storageKey,
        string fileName,
        TimeSpan validFor);
}
