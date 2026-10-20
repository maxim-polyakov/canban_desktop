using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Emails filter subscriptions when their scheduled time comes.</summary>
public sealed class FilterSubscriptionDispatcher : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<FilterSubscriptionDispatcher> _logger;

    public FilterSubscriptionDispatcher(IServiceScopeFactory scopes, ILogger<FilterSubscriptionDispatcher> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
        catch (OperationCanceledException) { return; }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var count = await scope.ServiceProvider.GetRequiredService<FilterSubscriptionService>().RunDueAsync(stoppingToken);
                if (count > 0) _logger.LogInformation("Processed {Count} filter subscriptions", count);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Filter subscription run failed");
            }
            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }
}
