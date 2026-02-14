using Amazon;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using CanbanServer.Application.Contracts;

namespace CanbanServer.Infrastructure.Services;

public class AvatarStorageService : IAvatarStorageService
{
    private readonly IConfiguration _config;
    private readonly ILogger<AvatarStorageService> _logger;
    private readonly string? _bucket;
    private readonly string? _publicBaseUrl;
    private readonly AmazonS3Client? _s3Client;

    public AvatarStorageService(IConfiguration config, ILogger<AvatarStorageService> logger)
    {
        _config = config;
        _logger = logger;
        _bucket = _config["S3:Bucket"]?.Trim();
        _publicBaseUrl = _config["S3:PublicBaseUrl"]?.Trim();
        if (string.IsNullOrEmpty(_bucket))
        {
            _logger.LogWarning("S3:Bucket не задан — загрузка аватаров отключена.");
            _s3Client = null;
            return;
        }

        var accessKey = _config["AWS:AccessKeyId"] ?? _config["S3:AccessKeyId"];
        var secretKey = _config["AWS:SecretAccessKey"] ?? _config["S3:SecretAccessKey"];
        var regionName = _config["S3:Region"] ?? _config["AWS:Region"] ?? "us-east-1";
        var serviceUrl = _config["S3:ServiceUrl"]?.Trim();

        AmazonS3Config s3Config;
        if (!string.IsNullOrEmpty(serviceUrl))
        {
            s3Config = new AmazonS3Config { ServiceURL = serviceUrl, ForcePathStyle = true };
        }
        else
        {
            var region = RegionEndpoint.GetBySystemName(regionName);
            s3Config = new AmazonS3Config { RegionEndpoint = region };
        }

        if (!string.IsNullOrEmpty(accessKey) && !string.IsNullOrEmpty(secretKey))
            _s3Client = new AmazonS3Client(accessKey, secretKey, s3Config);
        else
            _s3Client = new AmazonS3Client(s3Config);
    }

    public async Task<string?> UploadAsync(Guid userId, Stream data, string contentType, string suggestedFileName, CancellationToken ct = default)
    {
        if (_s3Client == null || string.IsNullOrEmpty(_bucket))
            return null;

        var ext = GetSafeExtension(contentType, suggestedFileName);
        var key = $"avatars/{userId}/{Guid.NewGuid():N}{ext}";

        try
        {
            var request = new PutObjectRequest
            {
                BucketName = _bucket,
                Key = key,
                InputStream = data,
                ContentType = contentType,
                CannedACL = S3CannedACL.PublicRead
            };

            await _s3Client.PutObjectAsync(request, ct);

            var url = GetPublicUrl(key);
            _logger.LogInformation("Аватар загружен: {Key} -> {Url}", key, url);
            return url;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка загрузки аватара в S3");
            return null;
        }
    }

    public async Task<bool> DeleteByUrlAsync(string? avatarUrl, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(avatarUrl)) return true;
        if (_s3Client == null || string.IsNullOrEmpty(_bucket)) return true;

        var key = GetKeyFromUrl(avatarUrl);
        if (string.IsNullOrEmpty(key) || !key.StartsWith("avatars/", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("Не удалось извлечь ключ S3 из URL аватара: {Url}", avatarUrl);
            return true;
        }

        try
        {
            await _s3Client.DeleteObjectAsync(_bucket, key, ct);
            _logger.LogInformation("Аватар удалён из S3: {Key}", key);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка удаления аватара из S3: {Key}", key);
            return false;
        }
    }

    private string? GetKeyFromUrl(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        var u = url.Trim();
        if (!string.IsNullOrEmpty(_publicBaseUrl))
        {
            var baseUrl = _publicBaseUrl.TrimEnd('/');
            if (u.StartsWith(baseUrl + "/", StringComparison.OrdinalIgnoreCase))
                return u[(baseUrl.Length + 1)..];
        }
        try
        {
            var uri = new Uri(u);
            var path = uri.AbsolutePath.TrimStart('/');
            if (!string.IsNullOrEmpty(path)) return path;
        }
        catch { /* ignore */ }
        return null;
    }

    private string GetPublicUrl(string key)
    {
        if (!string.IsNullOrEmpty(_publicBaseUrl))
        {
            var baseUrl = _publicBaseUrl.TrimEnd('/');
            return $"{baseUrl}/{key}";
        }
        var region = _config["S3:Region"] ?? _config["AWS:Region"] ?? "us-east-1";
        return $"https://{_bucket}.s3.{region}.amazonaws.com/{key}";
    }

    private static string GetSafeExtension(string contentType, string suggestedFileName)
    {
        var ext = Path.GetExtension(suggestedFileName);
        if (!string.IsNullOrEmpty(ext) && ext.Length <= 5)
        {
            ext = ext.ToLowerInvariant();
            if (ext is ".jpg" or ".jpeg" or ".png" or ".webp" or ".gif") return ext;
        }
        return contentType?.ToLowerInvariant() switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            "image/gif" => ".gif",
            _ => ".jpg"
        };
    }
}
