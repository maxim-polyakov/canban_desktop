using CanbanServer.Application.Contracts;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Warns operators before the shared Object Storage quota is exhausted.</summary>
public sealed class StorageQuotaMonitorService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    private readonly IServiceScopeFactory _scopes;
    private readonly IConfiguration _config;
    private readonly ILogger<StorageQuotaMonitorService> _logger;
    private int _lastAlertLevel;

    public StorageQuotaMonitorService(
        IServiceScopeFactory scopes,
        IConfiguration config,
        ILogger<StorageQuotaMonitorService> logger)
    {
        _scopes = scopes;
        _config = config;
        _logger = logger;
    }

    public static int AlertLevel(long usedBytes, long quotaBytes)
    {
        if (quotaBytes <= 0) return 0;
        var percent = usedBytes * 100d / quotaBytes;
        return percent >= 95 ? 95 : percent >= 85 ? 85 : percent >= 70 ? 70 : 0;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await CheckAsync(stoppingToken); }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                _logger.LogError(ex, "Storage quota monitoring failed");
            }
            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    private async Task CheckAsync(CancellationToken ct)
    {
        var quotaGb = int.TryParse(_config["Storage:QuotaGb"], out var configured) && configured > 0 ? configured : 1024;
        var quotaBytes = quotaGb * 1024L * 1024 * 1024;
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CanbanDbContext>();
        var storage = scope.ServiceProvider.GetRequiredService<IQuestAttachmentStorageService>();
        var usedBytes = await storage.GetTotalStoredBytesAsync(ct)
            ?? await db.QuestAttachments.AsNoTracking().SumAsync(a => (long?)a.SizeBytes, ct)
            ?? 0;
        var level = AlertLevel(usedBytes, quotaBytes);
        if (level == 0)
        {
            _lastAlertLevel = 0;
            return;
        }
        if (level <= _lastAlertLevel) return;
        _lastAlertLevel = level;

        var usedGb = usedBytes / (1024d * 1024 * 1024);
        _logger.LogWarning(
            "Object Storage is {Percent}% full: {UsedGb:F2} of {QuotaGb} GB. Request a quota increase before uploads stop.",
            level, usedGb, quotaGb);

        var recipients = (_config["Storage:AlertEmails"] ?? _config["Billing:EnterpriseEmails"] ?? "")
            .Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase);
        var email = scope.ServiceProvider.GetRequiredService<IEmailSender>();
        foreach (var recipient in recipients)
        {
            await email.SendAsync(
                recipient,
                "Администратор Kanban",
                $"Object Storage заполнено на {level}%",
                $"<p>Хранилище вложений использует <strong>{usedGb:F2} ГБ из {quotaGb} ГБ</strong>.</p>"
                + "<p>Заранее запросите увеличение квоты <code>storage.volume.size</code> в Yandex Cloud Quota Manager.</p>",
                ct);
        }
    }
}
