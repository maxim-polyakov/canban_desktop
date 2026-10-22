using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Removes audit events past each team's retention period.</summary>
public sealed class AuditRetentionService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<AuditRetentionService> _logger;

    public AuditRetentionService(IServiceScopeFactory scopes, ILogger<AuditRetentionService> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken); }
        catch (OperationCanceledException) { return; }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await DistributedJobLock.TryRunAsync(_scopes, "audit-retention", async ct =>
                {
                    using var scope = _scopes.CreateScope();
                    var removed = await scope.ServiceProvider.GetRequiredService<AuditLogService>().PurgeExpiredAsync(ct);
                    if (removed > 0) _logger.LogInformation("Removed {Count} expired audit events", removed);
                }, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Audit retention cleanup failed");
            }
            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }
}
