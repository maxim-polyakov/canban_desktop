using System.Text.Json;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

internal static class AutomationActions
{
    public static async Task ApplyAsync(CanbanDbContext db, AutomationRule rule, Quest quest, CancellationToken ct)
    {
        using var actions = JsonDocument.Parse(string.IsNullOrWhiteSpace(rule.ActionsJson) ? "[]" : rule.ActionsJson);
        if (actions.RootElement.ValueKind != JsonValueKind.Array) return;
        foreach (var action in actions.RootElement.EnumerateArray())
        {
            var type = action.TryGetProperty("type", out var t) ? t.GetString() : null;
            if (type == "setPriority" && action.TryGetProperty("value", out var p) && Enum.TryParse<IssuePriority>(p.ToString(), true, out var priority))
                quest.Priority = priority;
            if (type == "addLabel" && action.TryGetProperty("value", out var l) && !string.IsNullOrWhiteSpace(l.GetString()))
            {
                var labels = quest.Labels.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
                if (!labels.Contains(l.GetString()!, StringComparer.OrdinalIgnoreCase)) labels.Add(l.GetString()!);
                quest.Labels = string.Join(',', labels);
            }
            if (type == "move" && action.TryGetProperty("columnId", out var c) && Guid.TryParse(c.ToString(), out var columnId)
                && await db.Columns.AnyAsync(x => x.Id == columnId && x.BoardId == quest.BoardId, ct))
                quest.ColumnId = columnId;
        }
    }
}
