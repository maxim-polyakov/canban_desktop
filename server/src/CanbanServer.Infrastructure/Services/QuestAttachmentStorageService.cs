using Amazon;
using Amazon.S3;
using Amazon.S3.Model;
using CanbanServer.Application.Contracts;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

public class QuestAttachmentStorageService : IQuestAttachmentStorageService
{
    private const string KeyPrefix = "quest-attachments/";

    private readonly ILogger<QuestAttachmentStorageService> _logger;
    private readonly string? _bucket;
    private readonly AmazonS3Client? _s3Client;

    public QuestAttachmentStorageService(
        IConfiguration config,
        ILogger<QuestAttachmentStorageService> logger)
    {
        _logger = logger;
        _bucket = config["S3:Bucket"]?.Trim();
        if (string.IsNullOrEmpty(_bucket))
        {
            _logger.LogWarning("S3:Bucket не задан — вложения к задачам отключены.");
            return;
        }

        var accessKey = config["AWS:AccessKeyId"] ?? config["S3:AccessKeyId"];
        var secretKey = config["AWS:SecretAccessKey"] ?? config["S3:SecretAccessKey"];
        var regionName = config["S3:Region"] ?? config["AWS:Region"] ?? "us-east-1";
        var serviceUrl = config["S3:ServiceUrl"]?.Trim();

        AmazonS3Config s3Config;
        if (!string.IsNullOrEmpty(serviceUrl))
        {
            s3Config = new AmazonS3Config
            {
                ServiceURL = serviceUrl,
                ForcePathStyle = true
            };
        }
        else
        {
            s3Config = new AmazonS3Config
            {
                RegionEndpoint = RegionEndpoint.GetBySystemName(regionName)
            };
        }

        _s3Client = !string.IsNullOrEmpty(accessKey) && !string.IsNullOrEmpty(secretKey)
            ? new AmazonS3Client(accessKey, secretKey, s3Config)
            : new AmazonS3Client(s3Config);
    }

    public async Task<string?> UploadAsync(
        Guid teamId,
        Guid questId,
        Stream data,
        string contentType,
        string fileName,
        CancellationToken ct = default)
    {
        if (_s3Client == null || string.IsNullOrEmpty(_bucket))
            return null;

        var extension = GetSafeExtension(fileName);
        var key = $"{KeyPrefix}{teamId:N}/{questId:N}/{Guid.NewGuid():N}{extension}";

        try
        {
            await _s3Client.PutObjectAsync(new PutObjectRequest
            {
                BucketName = _bucket,
                Key = key,
                InputStream = data,
                ContentType = string.IsNullOrWhiteSpace(contentType)
                    ? "application/octet-stream"
                    : contentType
            }, ct);

            _logger.LogInformation("Вложение задачи загружено в S3: {Key}", key);
            return key;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка загрузки вложения задачи в S3");
            return null;
        }
    }

    public async Task<bool> DeleteAsync(string storageKey, CancellationToken ct = default)
    {
        if (!IsAllowedKey(storageKey))
        {
            _logger.LogWarning("Отклонено удаление неизвестного S3 key: {Key}", storageKey);
            return false;
        }
        if (_s3Client == null || string.IsNullOrEmpty(_bucket))
            return false;

        try
        {
            await _s3Client.DeleteObjectAsync(_bucket, storageKey, ct);
            _logger.LogInformation("Вложение задачи удалено из S3: {Key}", storageKey);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка удаления вложения задачи из S3: {Key}", storageKey);
            return false;
        }
    }

    public string? CreateDownloadUrl(string storageKey, string fileName, TimeSpan validFor)
    {
        if (!IsAllowedKey(storageKey) || _s3Client == null || string.IsNullOrEmpty(_bucket))
            return null;

        try
        {
            var safeFileName = Path.GetFileName(fileName);
            var encodedFileName = Uri.EscapeDataString(
                string.IsNullOrWhiteSpace(safeFileName) ? "attachment" : safeFileName);

            return _s3Client.GetPreSignedURL(new GetPreSignedUrlRequest
            {
                BucketName = _bucket,
                Key = storageKey,
                Expires = DateTime.UtcNow.Add(validFor),
                Verb = HttpVerb.GET,
                ResponseHeaderOverrides = new ResponseHeaderOverrides
                {
                    ContentDisposition = $"attachment; filename*=UTF-8''{encodedFileName}",
                    ContentType = "application/octet-stream"
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка создания ссылки на вложение: {Key}", storageKey);
            return null;
        }
    }

    private static bool IsAllowedKey(string? key) =>
        !string.IsNullOrWhiteSpace(key)
        && key.StartsWith(KeyPrefix, StringComparison.Ordinal);

    private static string GetSafeExtension(string fileName)
    {
        var extension = Path.GetExtension(Path.GetFileName(fileName));
        if (string.IsNullOrWhiteSpace(extension)
            || extension.Length > 16
            || extension.Skip(1).Any(c => !char.IsLetterOrDigit(c)))
            return string.Empty;

        return extension.ToLowerInvariant();
    }
}
