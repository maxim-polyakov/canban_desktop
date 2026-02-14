namespace CanbanServer.Application.Contracts;

/// <summary>Загрузка аватаров в S3-совместимое хранилище и получение публичного URL.</summary>
public interface IAvatarStorageService
{
    /// <summary>Загружает файл аватара и возвращает публичный URL. Возвращает null при ошибке или отключённом хранилище.</summary>
    Task<string?> UploadAsync(Guid userId, Stream data, string contentType, string suggestedFileName, CancellationToken ct = default);

    /// <summary>Удаляет объект из хранилища по ранее выданному URL. Возвращает true, если удалено или хранилище отключено.</summary>
    Task<bool> DeleteByUrlAsync(string? avatarUrl, CancellationToken ct = default);
}
