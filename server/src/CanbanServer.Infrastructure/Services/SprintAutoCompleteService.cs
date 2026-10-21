using CanbanServer.Application.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Jira's «Автоматически завершать спринт»: closes sprints at their end date.</summary>
public sealed class SprintAutoCompleteService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(15);
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<SprintAutoCompleteService> _logger;

    public SprintAutoCompleteService(IServiceScopeFactory scopes, ILogger<SprintAutoCompleteService> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken); }
        catch (OperationCanceledException) { return; }
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var closed = await scope.ServiceProvider.GetRequiredService<ISprintService>().CompleteDueAsync(stoppingToken);
                if (closed > 0) _logger.LogInformation("Auto-completed {Count} sprints", closed);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Sprint auto-complete failed");
            }
            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }
}
