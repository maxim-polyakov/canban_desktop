using CanbanServer.Infrastructure.Services;
using Microsoft.Extensions.Caching.Distributed;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class CacheServiceTests
{
    [Fact]
    public async Task GetOrCreateCachesFactoryValueAndReusesIt()
    {
        var cache = new RecordingDistributedCache();
        var service = new CacheService(cache);
        var factoryCalls = 0;

        Task<CachedBoard> Factory(CancellationToken _)
        {
            factoryCalls++;
            return Task.FromResult(new CachedBoard("Roadmap", 4));
        }

        var first = await service.GetOrCreateAsync("board:42", TimeSpan.FromMinutes(5), Factory);
        var second = await service.GetOrCreateAsync("board:42", TimeSpan.FromMinutes(5), Factory);

        Assert.Equal(1, factoryCalls);
        Assert.Equal("Roadmap", first?.Name);
        Assert.Equal(4, second?.ColumnCount);
        Assert.Contains("canban:board:42", cache.Values.Keys);
    }

    [Fact]
    public async Task InvalidJsonIsEvictedAndReplacedFromFactory()
    {
        var cache = new RecordingDistributedCache();
        cache.Values["canban:board:broken"] = "{not-json"u8.ToArray();
        var service = new CacheService(cache);

        var result = await service.GetOrCreateAsync(
            "board:broken",
            null,
            _ => Task.FromResult(new CachedBoard("Recovered", 2)));

        Assert.Equal("Recovered", result?.Name);
        Assert.Contains("canban:board:broken", cache.RemovedKeys);
        Assert.NotEqual("{not-json"u8.ToArray(), cache.Values["canban:board:broken"]);
    }

    private sealed record CachedBoard(string Name, int ColumnCount);

    private sealed class RecordingDistributedCache : IDistributedCache
    {
        public Dictionary<string, byte[]> Values { get; } = new();
        public List<string> RemovedKeys { get; } = new();

        public byte[]? Get(string key) => Values.GetValueOrDefault(key);

        public Task<byte[]?> GetAsync(string key, CancellationToken token = default) =>
            Task.FromResult(Get(key));

        public void Refresh(string key) { }

        public Task RefreshAsync(string key, CancellationToken token = default) =>
            Task.CompletedTask;

        public void Remove(string key)
        {
            RemovedKeys.Add(key);
            Values.Remove(key);
        }

        public Task RemoveAsync(string key, CancellationToken token = default)
        {
            Remove(key);
            return Task.CompletedTask;
        }

        public void Set(string key, byte[] value, DistributedCacheEntryOptions options) =>
            Values[key] = value;

        public Task SetAsync(
            string key,
            byte[] value,
            DistributedCacheEntryOptions options,
            CancellationToken token = default)
        {
            Set(key, value, options);
            return Task.CompletedTask;
        }
    }
}
