using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;

namespace CanbanServer.Infrastructure.Services;

/// <summary>
/// Обёртка над IDistributedCache с JSON-сериализацией и общим префиксом ключей.
/// </summary>
public class CacheService
{
    private readonly IDistributedCache _cache;
    private const string KeyPrefix = "canban:";
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = false
    };

    public CacheService(IDistributedCache cache) => _cache = cache;

    public async Task<T?> GetOrCreateAsync<T>(string key, TimeSpan? absoluteTtl, Func<CancellationToken, Task<T>> factory, CancellationToken ct = default) where T : class
    {
        var fullKey = KeyPrefix + key;
        var bytes = await _cache.GetAsync(fullKey, ct);
        if (bytes != null && bytes.Length > 0)
        {
            try
            {
                return JsonSerializer.Deserialize<T>(bytes, JsonOptions);
            }
            catch
            {
                await _cache.RemoveAsync(fullKey, ct);
            }
        }

        var value = await factory(ct);
        if (value != null)
        {
            var options = new DistributedCacheEntryOptions();
            if (absoluteTtl.HasValue)
                options.AbsoluteExpirationRelativeToNow = absoluteTtl;
            await _cache.SetStringAsync(fullKey, JsonSerializer.Serialize(value, JsonOptions), options, ct);
        }
        return value;
    }

    public async Task InvalidateAsync(string key, CancellationToken ct = default)
    {
        await _cache.RemoveAsync(KeyPrefix + key, ct);
    }
}
