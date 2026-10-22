using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Renews paid plans with saved cards and switches unpaid ones to Free.</summary>
public class BillingRenewalService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<BillingRenewalService> _logger;

    public BillingRenewalService(IServiceScopeFactory scopes, ILogger<BillingRenewalService> logger)
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
                await DistributedJobLock.TryRunAsync(_scopes, "billing-renewal", async ct =>
                {
                    using var scope = _scopes.CreateScope();
                    await scope.ServiceProvider.GetRequiredService<BillingService>().ProcessRenewalsAsync(ct);
                }, stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                _logger.LogError(ex, "Billing renewal pass failed");
            }
            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }
}
