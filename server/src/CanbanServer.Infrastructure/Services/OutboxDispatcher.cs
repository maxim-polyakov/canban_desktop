using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

public sealed class OutboxDispatcher : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly IHttpClientFactory _clients;
    private readonly IConfiguration _configuration;
    private readonly ILogger<OutboxDispatcher> _logger;
    public OutboxDispatcher(IServiceScopeFactory scopes, IHttpClientFactory clients, IConfiguration configuration, ILogger<OutboxDispatcher> logger)
    { _scopes = scopes; _clients = clients; _configuration = configuration; _logger = logger; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await DispatchBatchAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "Outbox dispatch batch failed"); }
            await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
        }
    }

    internal async Task DispatchBatchAsync(CancellationToken ct)
    {
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CanbanDbContext>();
        var now = DateTime.UtcNow;
        var messages = await db.OutboxMessages.Where(x => x.Status == OutboxStatus.Pending && x.AvailableAt <= now)
            .OrderBy(x => x.CreatedAt).Take(20).ToListAsync(ct);
        foreach (var message in messages)
        {
            message.Status = OutboxStatus.Processing; message.Attempts++;
            await db.SaveChangesAsync(ct);
            try
            {
                await RunAutomationsAsync(db, message, ct);
                await DeliverWebhooksAsync(db, message, ct);
                message.Status = OutboxStatus.Completed; message.ProcessedAt = DateTime.UtcNow; message.LastError = null;
            }
            catch (Exception ex)
            {
                message.LastError = ex.Message.Length > 2000 ? ex.Message[..2000] : ex.Message;
                message.Status = message.Attempts >= 8 ? OutboxStatus.DeadLetter : OutboxStatus.Pending;
                message.AvailableAt = DateTime.UtcNow.AddSeconds(Math.Min(3600, Math.Pow(2, message.Attempts) * 5));
            }
            await db.SaveChangesAsync(ct);
        }
    }

    private static async Task RunAutomationsAsync(CanbanDbContext db, OutboxMessage message, CancellationToken ct)
    {
        using var payload = JsonDocument.Parse(message.PayloadJson);
        if (!payload.RootElement.TryGetProperty("boardId", out var boardValue) || !Guid.TryParse(boardValue.ToString(), out var boardId)) return;
        var trigger = message.Type switch
        {
            "IssueCreated" => AutomationTrigger.IssueCreated, "IssueUpdated" => AutomationTrigger.IssueUpdated,
            "IssueMoved" => AutomationTrigger.IssueMoved, "WorkLogged" => AutomationTrigger.WorkLogged,
            "SprintChanged" => AutomationTrigger.SprintChanged, _ => AutomationTrigger.WebhookReceived
        };
        var rules = await db.AutomationRules.Where(x => x.BoardId == boardId && x.Enabled && x.Trigger == trigger).ToListAsync(ct);
        foreach (var rule in rules)
        {
            using var actions = JsonDocument.Parse(rule.ActionsJson);
            foreach (var action in actions.RootElement.EnumerateArray())
            {
                if (!payload.RootElement.TryGetProperty("questId", out var questValue) || !Guid.TryParse(questValue.ToString(), out var questId)) continue;
                var quest = await db.Quests.FirstOrDefaultAsync(q => q.Id == questId && q.BoardId == boardId, ct); if (quest == null) continue;
                var type = action.TryGetProperty("type", out var t) ? t.GetString() : null;
                if (type == "setPriority" && action.TryGetProperty("value", out var p) && Enum.TryParse<IssuePriority>(p.GetString(), true, out var priority)) quest.Priority = priority;
                if (type == "addLabel" && action.TryGetProperty("value", out var l))
                {
                    var labels = quest.Labels.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
                    if (!labels.Contains(l.GetString() ?? "", StringComparer.OrdinalIgnoreCase)) labels.Add(l.GetString() ?? "");
                    quest.Labels = string.Join(',', labels);
                }
                if (type == "move" && action.TryGetProperty("columnId", out var c) && Guid.TryParse(c.ToString(), out var columnId)
                    && await db.Columns.AnyAsync(x => x.Id == columnId && x.BoardId == boardId, ct)) quest.ColumnId = columnId;
            }
        }
    }

    private async Task DeliverWebhooksAsync(CanbanDbContext db, OutboxMessage message, CancellationToken ct)
    {
        using var payload = JsonDocument.Parse(message.PayloadJson);
        if (!payload.RootElement.TryGetProperty("boardId", out var value) || !Guid.TryParse(value.ToString(), out var boardId)) return;
        var hooks = await db.OutboundWebhooks.Where(x => x.BoardId == boardId && x.Enabled).ToListAsync(ct);
        foreach (var hook in hooks.Where(h => string.IsNullOrWhiteSpace(h.Events) || h.Events.Split(',').Contains(message.Type, StringComparer.OrdinalIgnoreCase)))
        {
            var secret = _configuration[hook.SecretConfigurationKey] ?? throw new InvalidOperationException($"Missing webhook secret configuration '{hook.SecretConfigurationKey}'");
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
            var signature = "sha256=" + Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(message.PayloadJson))).ToLowerInvariant();
            using var request = new HttpRequestMessage(HttpMethod.Post, hook.Url) { Content = new StringContent(message.PayloadJson, Encoding.UTF8, "application/json") };
            request.Headers.Add("X-Canban-Event", message.Type); request.Headers.Add("X-Canban-Signature-256", signature);
            var response = await _clients.CreateClient("outbox").SendAsync(request, ct);
            var delivery = new WebhookDelivery { Id = Guid.NewGuid(), WebhookId = hook.Id, OutboxMessageId = message.Id, Attempts = message.Attempts, NextAttemptAt = message.AvailableAt, LastStatusCode = (int)response.StatusCode };
            delivery.Status = response.IsSuccessStatusCode ? WebhookDeliveryStatus.Succeeded : message.Attempts >= 8 ? WebhookDeliveryStatus.DeadLetter : WebhookDeliveryStatus.Pending;
            if (!response.IsSuccessStatusCode) { delivery.LastError = $"HTTP {(int)response.StatusCode}"; db.WebhookDeliveries.Add(delivery); throw new HttpRequestException(delivery.LastError); }
            db.WebhookDeliveries.Add(delivery);
        }
    }
}
