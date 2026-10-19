using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public sealed record CreateDashboardRequest(string Name, string? Description, string? Template, List<string>? Categories,
    List<Guid>? BoardIds, string? Viewers, string? Editors);

public sealed record UpdateDashboardRequest(string? Name, string? Description, string? Viewers, string? Editors,
    JsonElement? Filters, JsonElement? Layout);

public sealed class DashboardFilters
{
    public List<Guid> BoardIds { get; set; } = new();
    public List<string> IssueTypes { get; set; } = new();
    public List<string> Priorities { get; set; } = new();
    public List<string> StatusCategories { get; set; } = new();
    public int? CreatedDays { get; set; }
    /// <summary>"me" or user ids.</summary>
    public List<string> Assignees { get; set; } = new();
}

/// <summary>Jira-style dashboards: templates, sharing with colleagues, stars, trash and server-side widget aggregates.</summary>
public class DashboardService
{
    public const string Private = "private";
    public const string Org = "org";
    public static readonly TimeSpan TrashRetention = TimeSpan.FromDays(30);
    public const int MaxIssues = 5000;
    public const int MaxRows = 30;
    public const int MaxWidgetsPerRow = 3;
    public static readonly string[] Templates = { "blank", "space-team", "devops", "my-work" };
    /// <summary>Every user gets one undeletable dashboard with this template; it can't be chosen when creating.</summary>
    public const string DefaultTemplate = "default";
    public const string DefaultName = "Дашборд по умолчанию";
    public static readonly string[] Categories = { "jira", "devops", "goals", "service" };
    public static readonly string[] WidgetTypes =
    {
        "count_by", "created_trend", "created_vs_resolved", "completion_trend", "cycle_time", "status_priority",
        "issue_table", "dev_count_by", "dev_trend", "goals_by_status", "goals_list",
    };

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly CanbanDbContext _db;
    private readonly HomeService _home;

    public DashboardService(CanbanDbContext db, HomeService home)
    {
        _db = db;
        _home = home;
    }

    // ---------- access ----------

    private async Task<HashSet<Guid>> ColleaguesAsync(Guid userId, CancellationToken ct)
    {
        var teamIds = await _db.Teams.AsNoTracking()
            .Where(t => t.OwnerId == userId || t.Members.Any(m => m.UserId == userId)).Select(t => t.Id).ToListAsync(ct);
        var members = await _db.TeamMembers.AsNoTracking().Where(m => teamIds.Contains(m.TeamId)).Select(m => m.UserId).ToListAsync(ct);
        var owners = await _db.Teams.AsNoTracking().Where(t => teamIds.Contains(t.Id) && t.OwnerId != null).Select(t => t.OwnerId!.Value).ToListAsync(ct);
        return members.Concat(owners).Append(userId).ToHashSet();
    }

    public static bool CanView(Dashboard d, Guid userId, ISet<Guid> colleagues) =>
        d.OwnerUserId == userId || (d.Viewers == Org && colleagues.Contains(d.OwnerUserId));

    public static bool CanEdit(Dashboard d, Guid userId, ISet<Guid> colleagues) =>
        d.OwnerUserId == userId || (d.Editors == Org && colleagues.Contains(d.OwnerUserId));

    private async Task<(Dashboard Dashboard, HashSet<Guid> Colleagues)> RequireAsync(Guid id, Guid userId, bool edit, CancellationToken ct)
    {
        var dashboard = await _db.Dashboards.FirstOrDefaultAsync(d => d.Id == id, ct) ?? throw new KeyNotFoundException("Dashboard not found");
        var colleagues = await ColleaguesAsync(userId, ct);
        if (!CanView(dashboard, userId, colleagues)) throw new KeyNotFoundException("Dashboard not found");
        if (dashboard.DeletedAt != null && dashboard.OwnerUserId != userId) throw new KeyNotFoundException("Dashboard not found");
        if (edit && !CanEdit(dashboard, userId, colleagues)) throw new UnauthorizedAccessException("You can't edit this dashboard");
        return (dashboard, colleagues);
    }

    private static string NormalizeAudience(string? value, string fallback) => value?.Trim().ToLowerInvariant() switch
    {
        null or "" => fallback,
        Private => Private,
        Org => Org,
        _ => throw new ArgumentException("Audience must be 'private' or 'org'")
    };

    // ---------- list / get ----------

    public async Task<List<object>> ListAsync(Guid userId, bool trash, CancellationToken ct)
    {
        var expired = DateTime.UtcNow - TrashRetention;
        var stale = await _db.Dashboards.Where(d => d.OwnerUserId == userId && d.DeletedAt != null && d.DeletedAt < expired).ToListAsync(ct);
        if (stale.Count > 0)
        {
            _db.Dashboards.RemoveRange(stale);
            await _db.SaveChangesAsync(ct);
        }
        if (!trash) await EnsureDefaultAsync(userId, ct);

        var colleagues = await ColleaguesAsync(userId, ct);
        var colleagueIds = colleagues.ToList();
        var query = _db.Dashboards.AsNoTracking();
        query = trash
            ? query.Where(d => d.OwnerUserId == userId && d.DeletedAt != null)
            : query.Where(d => d.DeletedAt == null && (d.OwnerUserId == userId || (d.Viewers == Org && colleagueIds.Contains(d.OwnerUserId))));
        var items = await query.OrderBy(d => d.Name).Take(1000).ToListAsync(ct);
        return await SummariesAsync(items, userId, colleagues, ct);
    }

    private async Task EnsureDefaultAsync(Guid userId, CancellationToken ct)
    {
        if (await _db.Dashboards.AnyAsync(d => d.OwnerUserId == userId && d.Template == DefaultTemplate, ct)) return;
        var now = DateTime.UtcNow;
        var dashboard = new Dashboard
        {
            Id = Guid.NewGuid(),
            OwnerUserId = userId,
            Name = DefaultName,
            Template = DefaultTemplate,
            FiltersJson = JsonSerializer.Serialize(new DashboardFilters(), Json),
            LayoutJson = BuildTemplateLayout(DefaultTemplate, Array.Empty<string>()).ToJsonString(),
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Dashboards.Add(dashboard);
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // A concurrent request created it first (unique index on the default template).
            _db.Entry(dashboard).State = EntityState.Detached;
        }
    }

    private async Task<List<object>> SummariesAsync(List<Dashboard> items, Guid userId, ISet<Guid> colleagues, CancellationToken ct)
    {
        var ids = items.Select(d => d.Id).ToList();
        var ownerIds = items.Select(d => d.OwnerUserId).Distinct().ToList();
        var owners = await _db.Users.AsNoTracking().Where(u => ownerIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.AvatarUrl }).ToDictionaryAsync(u => u.Id, ct);
        var stars = await _db.DashboardStars.AsNoTracking().Where(s => ids.Contains(s.DashboardId))
            .GroupBy(s => s.DashboardId).Select(g => new { g.Key, Count = g.Count(), Mine = g.Any(s => s.UserId == userId) })
            .ToDictionaryAsync(x => x.Key, ct);
        return items.Select(d =>
        {
            owners.TryGetValue(d.OwnerUserId, out var owner);
            stars.TryGetValue(d.Id, out var star);
            return (object)new
            {
                id = d.Id,
                name = d.Name,
                description = d.Description,
                template = d.Template,
                ownerUserId = d.OwnerUserId,
                ownerName = owner?.DisplayName,
                ownerAvatarUrl = owner?.AvatarUrl,
                viewers = d.Viewers,
                editors = d.Editors,
                starCount = star?.Count ?? 0,
                starred = star?.Mine ?? false,
                isOwner = d.OwnerUserId == userId,
                isDefault = d.Template == DefaultTemplate,
                canEdit = CanEdit(d, userId, colleagues),
                boardIds = ParseFilters(d.FiltersJson).BoardIds,
                createdAt = d.CreatedAt,
                updatedAt = d.UpdatedAt,
                deletedAt = d.DeletedAt,
            };
        }).ToList();
    }

    public async Task<object> GetAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var (dashboard, colleagues) = await RequireAsync(id, userId, false, ct);
        return await DetailAsync(dashboard, userId, colleagues, ct);
    }

    private async Task<object> DetailAsync(Dashboard d, Guid userId, ISet<Guid> colleagues, CancellationToken ct)
    {
        var summary = (await SummariesAsync(new List<Dashboard> { d }, userId, colleagues, ct))[0];
        return new
        {
            dashboard = summary,
            filters = ParseFilters(d.FiltersJson),
            layout = ParseLayout(d.LayoutJson),
        };
    }

    // ---------- create / update ----------

    public async Task<object> CreateAsync(Guid userId, CreateDashboardRequest request, CancellationToken ct)
    {
        var name = (request.Name ?? "").Trim();
        if (name.Length == 0) throw new ArgumentException("Name is required");
        if (name.Length > 200) throw new ArgumentException("Name is too long");
        var template = string.IsNullOrWhiteSpace(request.Template) ? "blank" : request.Template.Trim().ToLowerInvariant();
        if (!Templates.Contains(template)) throw new ArgumentException("Unknown template");
        var categories = (request.Categories ?? new()).Select(c => c.Trim().ToLowerInvariant()).Distinct().ToList();
        if (categories.Any(c => !Categories.Contains(c))) throw new ArgumentException("Unknown category");

        var boardIds = await AccessibleBoardIdsAsync(userId, request.BoardIds ?? new(), ct);
        var filters = new DashboardFilters { BoardIds = boardIds };
        if (template is "space-team" or "devops") filters.CreatedDays = 90;
        if (template == "my-work") filters.Assignees = new() { "me" };

        var now = DateTime.UtcNow;
        var viewers = NormalizeAudience(request.Viewers, Private);
        var dashboard = new Dashboard
        {
            Id = Guid.NewGuid(),
            OwnerUserId = userId,
            Name = name,
            Description = Truncate(request.Description, 2000),
            Template = template,
            Viewers = viewers,
            Shared = viewers == Org,
            Editors = NormalizeAudience(request.Editors, Private),
            FiltersJson = JsonSerializer.Serialize(filters, Json),
            LayoutJson = BuildTemplateLayout(template, categories).ToJsonString(),
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Dashboards.Add(dashboard);
        await _db.SaveChangesAsync(ct);
        return await DetailAsync(dashboard, userId, await ColleaguesAsync(userId, ct), ct);
    }

    private async Task<List<Guid>> AccessibleBoardIdsAsync(Guid userId, List<Guid> requested, CancellationToken ct)
    {
        if (requested.Count == 0) return new();
        var ids = requested.Distinct().Take(50).ToList();
        var allowed = await _db.Boards.AsNoTracking()
            .Where(b => ids.Contains(b.Id) && (b.Team.OwnerId == userId || b.Team.Members.Any(m => m.UserId == userId) || b.Access != "private"))
            .Select(b => b.Id).ToListAsync(ct);
        return ids.Where(allowed.Contains).ToList();
    }

    public async Task<object> UpdateAsync(Guid id, Guid userId, UpdateDashboardRequest request, CancellationToken ct)
    {
        var (dashboard, colleagues) = await RequireAsync(id, userId, true, ct);
        if (dashboard.DeletedAt != null) throw new InvalidOperationException("Restore the dashboard before editing it");
        if (request.Name != null)
        {
            var name = request.Name.Trim();
            if (name.Length == 0) throw new ArgumentException("Name is required");
            if (name.Length > 200) throw new ArgumentException("Name is too long");
            dashboard.Name = name;
        }
        if (request.Description != null) dashboard.Description = Truncate(request.Description, 2000);
        if (request.Viewers != null || request.Editors != null)
        {
            if (dashboard.OwnerUserId != userId) throw new UnauthorizedAccessException("Only the owner can change access");
            dashboard.Viewers = NormalizeAudience(request.Viewers, dashboard.Viewers);
            dashboard.Editors = NormalizeAudience(request.Editors, dashboard.Editors);
            if (dashboard.Viewers == Private) dashboard.Editors = Private;
            dashboard.Shared = dashboard.Viewers == Org;
        }
        if (request.Filters is { ValueKind: JsonValueKind.Object } filtersJson)
        {
            var filters = JsonSerializer.Deserialize<DashboardFilters>(filtersJson.GetRawText(), Json) ?? new DashboardFilters();
            filters.BoardIds = await AccessibleBoardIdsAsync(userId, filters.BoardIds, ct);
            dashboard.FiltersJson = JsonSerializer.Serialize(NormalizeFilters(filters), Json);
        }
        if (request.Layout is { ValueKind: JsonValueKind.Object } layoutJson)
            dashboard.LayoutJson = ValidateLayout(JsonNode.Parse(layoutJson.GetRawText())!.AsObject()).ToJsonString();
        dashboard.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return await DetailAsync(dashboard, userId, colleagues, ct);
    }

    public async Task<object> CopyAsync(Guid id, Guid userId, string? name, CancellationToken ct)
    {
        var (source, colleagues) = await RequireAsync(id, userId, false, ct);
        var now = DateTime.UtcNow;
        var copy = new Dashboard
        {
            Id = Guid.NewGuid(),
            OwnerUserId = userId,
            Name = Truncate(string.IsNullOrWhiteSpace(name) ? $"Копия: {source.Name}" : name.Trim(), 200)!,
            Description = source.Description,
            Template = source.Template == DefaultTemplate ? "blank" : source.Template,
            FiltersJson = source.FiltersJson,
            LayoutJson = source.LayoutJson,
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Dashboards.Add(copy);
        await _db.SaveChangesAsync(ct);
        return await DetailAsync(copy, userId, colleagues, ct);
    }

    public async Task TrashAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var (dashboard, _) = await RequireAsync(id, userId, false, ct);
        if (dashboard.OwnerUserId != userId) throw new UnauthorizedAccessException("Only the owner can move a dashboard to trash");
        if (dashboard.Template == DefaultTemplate) throw new InvalidOperationException("The default dashboard can't be deleted");
        dashboard.DeletedAt ??= DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    public async Task RestoreAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var dashboard = await _db.Dashboards.FirstOrDefaultAsync(d => d.Id == id && d.OwnerUserId == userId, ct) ?? throw new KeyNotFoundException("Dashboard not found");
        dashboard.DeletedAt = null;
        dashboard.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    public async Task PurgeAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var dashboard = await _db.Dashboards.FirstOrDefaultAsync(d => d.Id == id && d.OwnerUserId == userId, ct) ?? throw new KeyNotFoundException("Dashboard not found");
        if (dashboard.DeletedAt == null) throw new InvalidOperationException("Move the dashboard to trash first");
        _db.Dashboards.Remove(dashboard);
        await _db.SaveChangesAsync(ct);
    }

    public async Task StarAsync(Guid id, Guid userId, bool starred, CancellationToken ct)
    {
        await RequireAsync(id, userId, false, ct);
        var existing = await _db.DashboardStars.FirstOrDefaultAsync(s => s.DashboardId == id && s.UserId == userId, ct);
        if (starred && existing == null) _db.DashboardStars.Add(new DashboardStar { DashboardId = id, UserId = userId, CreatedAt = DateTime.UtcNow });
        if (!starred && existing != null) _db.DashboardStars.Remove(existing);
        await _db.SaveChangesAsync(ct);
    }

    private static string? Truncate(string? value, int max)
    {
        var text = value?.Trim();
        if (string.IsNullOrEmpty(text)) return null;
        return text.Length > max ? text[..max] : text;
    }

    // ---------- filters & layout ----------

    public static DashboardFilters ParseFilters(string? json)
    {
        try { return NormalizeFilters(JsonSerializer.Deserialize<DashboardFilters>(string.IsNullOrWhiteSpace(json) ? "{}" : json, Json) ?? new()); }
        catch (JsonException) { return new DashboardFilters(); }
    }

    public static DashboardFilters NormalizeFilters(DashboardFilters f)
    {
        f.BoardIds = (f.BoardIds ?? new()).Distinct().Take(50).ToList();
        f.IssueTypes = (f.IssueTypes ?? new()).Where(x => Enum.TryParse<IssueType>(x, true, out _)).Select(x => Enum.Parse<IssueType>(x, true).ToString()).Distinct().ToList();
        f.Priorities = (f.Priorities ?? new()).Where(x => Enum.TryParse<IssuePriority>(x, true, out _)).Select(x => Enum.Parse<IssuePriority>(x, true).ToString()).Distinct().ToList();
        f.StatusCategories = (f.StatusCategories ?? new()).Select(x => x.ToLowerInvariant()).Where(x => x is "new" or "indeterminate" or "done").Distinct().ToList();
        f.CreatedDays = f.CreatedDays is > 0 ? Math.Min(f.CreatedDays.Value, 3650) : null;
        f.Assignees = (f.Assignees ?? new()).Where(x => x == "me" || x == "none" || Guid.TryParse(x, out _)).Distinct().Take(50).ToList();
        return f;
    }

    public static JsonObject ParseLayout(string? json)
    {
        JsonNode? node;
        try { node = JsonNode.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json); }
        catch (JsonException) { node = null; }
        if (node is JsonArray legacy)
        {
            var widgets = new JsonArray();
            foreach (var gadget in legacy.OfType<JsonObject>().Take(MaxWidgetsPerRow))
                widgets.Add(Widget(gadget["id"]?.GetValue<string>() ?? NewId("w"), "issue_table", gadget["title"]?.GetValue<string>() ?? "Сведения о задачах", 1, new JsonObject()));
            return new JsonObject { ["rows"] = new JsonArray(new JsonObject { ["id"] = NewId("r"), ["widgets"] = widgets }) };
        }
        if (node is JsonObject obj)
        {
            try { return ValidateLayout(obj); }
            catch (ArgumentException) { }
        }
        return EmptyLayout();
    }

    public static JsonObject ValidateLayout(JsonObject layout)
    {
        var rows = layout["rows"] as JsonArray ?? throw new ArgumentException("Layout must have rows");
        if (rows.Count > MaxRows) throw new ArgumentException($"A dashboard can have at most {MaxRows} rows");
        var result = new JsonArray();
        var seen = new HashSet<string>();
        foreach (var rowNode in rows)
        {
            if (rowNode is not JsonObject row) throw new ArgumentException("Invalid row");
            var widgets = row["widgets"] as JsonArray ?? new JsonArray();
            if (widgets.Count > MaxWidgetsPerRow) throw new ArgumentException($"A row can have at most {MaxWidgetsPerRow} widgets");
            var cleanWidgets = new JsonArray();
            var width = 0;
            foreach (var widgetNode in widgets)
            {
                if (widgetNode is not JsonObject widget) throw new ArgumentException("Invalid widget");
                var type = widget["type"]?.GetValue<string>() ?? "";
                if (!WidgetTypes.Contains(type)) throw new ArgumentException($"Unknown widget type '{type}'");
                var id = SafeId(widget["id"]?.GetValue<string>(), "w");
                if (!seen.Add(id)) id = NewId("w");
                var size = Math.Clamp(widget["size"]?.GetValue<int>() ?? 1, 1, MaxWidgetsPerRow);
                width += size;
                var title = widget["title"]?.GetValue<string>()?.Trim();
                if (title?.Length > 200) title = title[..200];
                var config = widget["config"] as JsonObject ?? new JsonObject();
                if (config.ToJsonString().Length > 4000) throw new ArgumentException("Widget settings are too large");
                cleanWidgets.Add(Widget(id, type, title ?? "", size, JsonNode.Parse(config.ToJsonString())!.AsObject()));
            }
            if (width > MaxWidgetsPerRow) throw new ArgumentException("Widgets in a row don't fit");
            result.Add(new JsonObject { ["id"] = SafeId(row["id"]?.GetValue<string>(), "r"), ["widgets"] = cleanWidgets });
        }
        if (result.Count == 0) result.Add(new JsonObject { ["id"] = NewId("r"), ["widgets"] = new JsonArray() });
        return new JsonObject { ["rows"] = result };
    }

    private static string SafeId(string? id, string prefix) =>
        !string.IsNullOrWhiteSpace(id) && id.Length <= 64 && id.All(c => char.IsLetterOrDigit(c) || c is '-' or '_') ? id : NewId(prefix);

    private static string NewId(string prefix) => $"{prefix}-{Guid.NewGuid():N}"[..(prefix.Length + 13)];

    private static JsonObject EmptyLayout() => new() { ["rows"] = new JsonArray(new JsonObject { ["id"] = NewId("r"), ["widgets"] = new JsonArray() }) };

    private static JsonObject Widget(string id, string type, string title, int size, JsonObject config) =>
        new() { ["id"] = id, ["type"] = type, ["title"] = title, ["size"] = size, ["config"] = config };

    private static JsonObject W(string type, string title, object? config = null, int size = 1) =>
        Widget(NewId("w"), type, title, size, config == null ? new JsonObject() : JsonSerializer.SerializeToNode(config, Json)!.AsObject());

    private static JsonObject Row(params JsonObject[] widgets) => new() { ["id"] = NewId("r"), ["widgets"] = new JsonArray(widgets) };

    public static JsonObject BuildTemplateLayout(string template, IReadOnlyCollection<string> categories)
    {
        var rows = new JsonArray();
        switch (template)
        {
            case "space-team":
                rows.Add(Row(
                    W("count_by", "Количество задач (по статусам)", new { groupBy = "status", measure = "count", chart = "donut" }),
                    W("count_by", "Количество задач (по типам)", new { groupBy = "type", measure = "count", chart = "donut" }),
                    W("count_by", "Количество задач (по исполнителям)", new { groupBy = "assignee", measure = "count", chart = "donut" })));
                rows.Add(Row(
                    W("created_trend", "Тенденция создания задач", new { split = "type", chart = "stacked" }),
                    W("created_vs_resolved", "Задачи: созданные и выполненные", new { chart = "line" }),
                    W("count_by", "Story points (по статусам)", new { groupBy = "status", measure = "storyPoints", chart = "hbar" })));
                rows.Add(Row(
                    W("cycle_time", "Время выполнения (по типам задач)", new { chart = "line" }),
                    W("created_trend", "Тенденция создания задач (по приоритетам)", new { split = "priority", chart = "stacked" }),
                    W("issue_table", "Сведения о задачах", new { limit = 10 })));
                break;
            case "devops":
                rows.Add(Row(
                    W("dev_count_by", "Количество коммитов (по авторам)", new { kind = "commit", groupBy = "author", chart = "donut" }),
                    W("dev_count_by", "Сборки (по результату)", new { kind = "check_run", groupBy = "status", chart = "donut" }),
                    W("dev_count_by", "Запросы pull (по статусам)", new { kind = "pull_request", groupBy = "status", chart = "donut" })));
                rows.Add(Row(
                    W("dev_trend", "Количество сборок с течением времени", new { kind = "check_run", chart = "line" }),
                    W("dev_trend", "Количество коммитов с течением времени", new { kind = "commit", chart = "bar" }, 2)));
                rows.Add(Row(W("issue_table", "Сведения о задачах", new { limit = 10 }, 3)));
                break;
            case DefaultTemplate:
                rows.Add(Row(
                    W("count_by", "Количество задач (по статусам)", new { groupBy = "status", measure = "count", chart = "donut" }),
                    W("created_vs_resolved", "Задачи: созданные и выполненные", new { chart = "line" }),
                    W("count_by", "Количество задач (по исполнителям)", new { groupBy = "assignee", measure = "count", chart = "donut" })));
                rows.Add(Row(W("issue_table", "Последние задачи", new { limit = 10, sort = "created" }, 3)));
                break;
            case "my-work":
                rows.Add(Row(
                    W("status_priority", "Статусы и приоритеты задач", new { chart = "stacked" }),
                    W("completion_trend", "Тенденция выполнения задач", new { chart = "bar" }),
                    W("count_by", "Количество задач (по статусам)", new { groupBy = "status", measure = "count", chart = "donut" })));
                rows.Add(Row(
                    W("count_by", "Оценка сложности (по приоритетам)", new { groupBy = "priority", measure = "storyPoints", chart = "donut" }),
                    W("dev_trend", "Запросы pull с течением времени", new { kind = "pull_request", chart = "bar" }),
                    W("issue_table", "Сведения о задачах", new { limit = 10 })));
                break;
            default:
                if (categories.Contains("jira"))
                    rows.Add(Row(
                        W("count_by", "Количество задач (по статусам)", new { groupBy = "status", measure = "count", chart = "donut" }),
                        W("created_vs_resolved", "Задачи: созданные и выполненные", new { chart = "line" }),
                        W("issue_table", "Сведения о задачах", new { limit = 10 })));
                if (categories.Contains("devops"))
                    rows.Add(Row(
                        W("dev_count_by", "Количество коммитов (по авторам)", new { kind = "commit", groupBy = "author", chart = "donut" }),
                        W("dev_count_by", "Запросы pull (по статусам)", new { kind = "pull_request", groupBy = "status", chart = "donut" }),
                        W("dev_trend", "Количество коммитов с течением времени", new { kind = "commit", chart = "bar" })));
                if (categories.Contains("goals"))
                    rows.Add(Row(
                        W("goals_by_status", "Цели (по статусам)", new { chart = "donut" }),
                        W("goals_list", "Цели", new { limit = 10 }, 2)));
                if (categories.Contains("service"))
                    rows.Add(Row(
                        W("count_by", "Запросы (по приоритетам)", new { groupBy = "priority", measure = "count", chart = "bar" }),
                        W("created_trend", "Тенденция создания запросов", new { split = "none", chart = "bar" }),
                        W("count_by", "Запросы (по исполнителям)", new { groupBy = "assignee", measure = "count", chart = "hbar" })));
                break;
        }
        if (rows.Count == 0) rows.Add(new JsonObject { ["id"] = NewId("r"), ["widgets"] = new JsonArray() });
        return new JsonObject { ["rows"] = rows };
    }

    // ---------- data ----------

    public sealed record IssueRow(Guid Id, Guid BoardId, string BoardName, string IssueKey, string Title, IssueType Type, IssuePriority Priority,
        int? StoryPoints, DateTime CreatedAt, DateTime? CompletedAt, string Status, ColumnKind StatusKind, Guid? AssigneeId);

    public sealed record DevRow(string Kind, string? Status, string Author, DateTime At);

    public async Task<object> DataAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var (dashboard, _) = await RequireAsync(id, userId, false, ct);
        var filters = ParseFilters(dashboard.FiltersJson);
        var layout = ParseLayout(dashboard.LayoutJson);
        var widgets = layout["rows"]!.AsArray().OfType<JsonObject>()
            .SelectMany(r => (r["widgets"] as JsonArray ?? new JsonArray()).OfType<JsonObject>()).ToList();
        var types = widgets.Select(w => w["type"]!.GetValue<string>()).ToHashSet();
        var now = DateTime.UtcNow;

        var (issues, truncated) = await LoadIssuesAsync(userId, filters, now, ct);
        var assigneeIds = issues.Where(i => i.AssigneeId.HasValue).Select(i => i.AssigneeId!.Value).Distinct().ToList();
        var users = assigneeIds.Count == 0 ? new Dictionary<Guid, (string Name, string? Avatar)>() : (await _db.Users.AsNoTracking()
            .Where(u => assigneeIds.Contains(u.Id)).Select(u => new { u.Id, u.DisplayName, u.AvatarUrl }).ToListAsync(ct))
            .ToDictionary(u => u.Id, u => (Name: u.DisplayName, Avatar: u.AvatarUrl));

        List<DevRow> dev = new();
        if (types.Contains("dev_count_by") || types.Contains("dev_trend"))
        {
            var questIds = issues.Select(i => i.Id).ToList();
            var links = await _db.DevelopmentLinks.AsNoTracking().Where(l => questIds.Contains(l.QuestId))
                .Select(l => new { l.Kind, l.ExternalId, l.Status, l.PayloadJson, l.UpdatedAt }).Take(20000).ToListAsync(ct);
            dev = links.GroupBy(l => (l.Kind, l.ExternalId)).Select(g => g.First())
                .Select(l => new DevRow(l.Kind, l.Status, ExtractAuthor(l.PayloadJson, l.Kind), l.UpdatedAt)).ToList();
        }

        List<HomeItem> goals = new();
        if (types.Contains("goals_by_status") || types.Contains("goals_list"))
            goals = await _home.VisibleItemsAsync(userId, HomeService.Goal, 500, ct);

        var result = new Dictionary<string, object>();
        foreach (var widget in widgets)
        {
            var wid = widget["id"]!.GetValue<string>();
            var config = widget["config"] as JsonObject ?? new JsonObject();
            try { result[wid] = Compute(widget["type"]!.GetValue<string>(), config, issues, users, dev, goals, filters, now); }
            catch (ArgumentException e) { result[wid] = new { kind = "error", message = e.Message }; }
        }
        return new { generatedAt = now, truncated, issueCount = issues.Count, widgets = result };
    }

    private async Task<(List<IssueRow> Issues, bool Truncated)> LoadIssuesAsync(Guid userId, DashboardFilters f, DateTime now, CancellationToken ct)
    {
        var q = _db.Quests.AsNoTracking()
            .Where(x => x.Board.Team.OwnerId == userId || x.Board.Team.Members.Any(m => m.UserId == userId) || x.Board.Access != "private");
        if (f.BoardIds.Count > 0) q = q.Where(x => f.BoardIds.Contains(x.BoardId));
        if (f.IssueTypes.Count > 0)
        {
            var typesFilter = f.IssueTypes.Select(Enum.Parse<IssueType>).ToList();
            q = q.Where(x => typesFilter.Contains(x.IssueType));
        }
        if (f.Priorities.Count > 0)
        {
            var priorities = f.Priorities.Select(Enum.Parse<IssuePriority>).ToList();
            q = q.Where(x => priorities.Contains(x.Priority));
        }
        if (f.StatusCategories.Count > 0)
        {
            var kinds = f.StatusCategories.SelectMany(KindsOf).ToList();
            q = q.Where(x => kinds.Contains(x.Column.Kind));
        }
        if (f.CreatedDays.HasValue)
        {
            var since = now.AddDays(-f.CreatedDays.Value);
            q = q.Where(x => x.CreatedAt >= since);
        }
        if (f.Assignees.Count > 0)
        {
            var ids = f.Assignees.Select(a => a == "me" ? userId : Guid.TryParse(a, out var g) ? g : Guid.Empty).Where(g => g != Guid.Empty).ToList();
            var includeNone = f.Assignees.Contains("none");
            q = q.Where(x => (x.AssigneeId != null && ids.Contains(x.AssigneeId.Value)) || x.Assignees.Any(a => ids.Contains(a.UserId))
                || (includeNone && x.AssigneeId == null && !x.Assignees.Any()));
        }
        var rows = await q.OrderByDescending(x => x.CreatedAt).Take(MaxIssues + 1)
            .Select(x => new IssueRow(x.Id, x.BoardId, x.Board.Name, x.IssueKey, x.Title, x.IssueType, x.Priority, x.StoryPoints, x.CreatedAt, x.CompletedAt,
                x.Column.Title, x.Column.Kind, x.Assignees.OrderBy(a => a.Order).Select(a => (Guid?)a.UserId).FirstOrDefault() ?? x.AssigneeId))
            .ToListAsync(ct);
        var truncated = rows.Count > MaxIssues;
        return (truncated ? rows.Take(MaxIssues).ToList() : rows, truncated);
    }

    private static IEnumerable<ColumnKind> KindsOf(string category) => category switch
    {
        "done" => new[] { ColumnKind.Done, ColumnKind.Archive },
        "indeterminate" => new[] { ColumnKind.InProgress, ColumnKind.Review },
        _ => new[] { ColumnKind.Backlog, ColumnKind.Custom },
    };

    public static string ExtractAuthor(string? payload, string kind)
    {
        if (string.IsNullOrWhiteSpace(payload) || payload == "{}") return "Неизвестно";
        try
        {
            using var doc = JsonDocument.Parse(payload);
            var root = doc.RootElement;
            string? Path(params string[] path)
            {
                var el = root;
                foreach (var p in path)
                {
                    if (el.ValueKind != JsonValueKind.Object || !el.TryGetProperty(p, out el)) return null;
                }
                return el.ValueKind == JsonValueKind.String ? el.GetString() : null;
            }
            var author = kind switch
            {
                GitHubEventParser.PullRequestKind => Path("pull_request", "user", "login"),
                GitHubEventParser.CommitKind => Path("head_commit", "author", "username") ?? Path("head_commit", "author", "name") ?? Path("pusher", "name"),
                _ => null,
            } ?? Path("sender", "login");
            return string.IsNullOrWhiteSpace(author) ? "Неизвестно" : author;
        }
        catch (JsonException) { return "Неизвестно"; }
    }

    private static string Str(JsonObject config, string key, string fallback)
    {
        try { return config[key]?.GetValue<string>() ?? fallback; }
        catch (InvalidOperationException) { return fallback; }
    }

    private static int Int(JsonObject config, string key, int fallback, int min, int max)
    {
        try { return Math.Clamp(config[key]?.GetValue<int>() ?? fallback, min, max); }
        catch (Exception e) when (e is InvalidOperationException or FormatException) { return fallback; }
    }

    public static readonly Dictionary<IssueType, string> TypeLabels = new()
    {
        [IssueType.Epic] = "Эпик", [IssueType.Story] = "История", [IssueType.Task] = "Задача", [IssueType.Bug] = "Ошибка", [IssueType.Subtask] = "Подзадача",
    };

    public static readonly Dictionary<IssuePriority, string> PriorityLabels = new()
    {
        [IssuePriority.Highest] = "Высший", [IssuePriority.High] = "Высокий", [IssuePriority.Medium] = "Средний", [IssuePriority.Low] = "Низкий", [IssuePriority.Lowest] = "Низший",
    };

    private static readonly Dictionary<string, string> CategoryLabels = new() { ["new"] = "К выполнению", ["indeterminate"] = "В работе", ["done"] = "Готово" };

    private static readonly Dictionary<string, string> GoalStatusLabels = new()
    {
        ["pending"] = "Ожидание", ["on_track"] = "По графику", ["at_risk"] = "Под угрозой", ["off_track"] = "Отстает",
        ["paused"] = "Приостановлено", ["done"] = "Выполнено", ["cancelled"] = "Отменено",
    };

    private static string Category(ColumnKind kind) => JqlService.StatusCategory(kind);

    public static DateTime StartOfWeek(DateTime date) => date.Date.AddDays(-(((int)date.DayOfWeek + 6) % 7));

    private sealed record Bucket(string Key, string Label, string? Category = null, int Order = 0);

    private static Bucket Group(IssueRow i, string groupBy, IReadOnlyDictionary<Guid, (string Name, string? Avatar)> users) => groupBy switch
    {
        "status" => new Bucket(i.Status, i.Status, Category(i.StatusKind), (int)i.StatusKind),
        "statusCategory" => new Bucket(Category(i.StatusKind), CategoryLabels[Category(i.StatusKind)], Category(i.StatusKind)),
        "type" => new Bucket(i.Type.ToString(), TypeLabels[i.Type], null, (int)i.Type),
        "priority" => new Bucket(i.Priority.ToString(), PriorityLabels[i.Priority], null, -(int)i.Priority),
        "assignee" => i.AssigneeId.HasValue
            ? new Bucket(i.AssigneeId.Value.ToString(), users.TryGetValue(i.AssigneeId.Value, out var u) ? u.Name : "Пользователь")
            : new Bucket("none", "Не назначено", null, int.MaxValue),
        "space" => new Bucket(i.BoardId.ToString(), i.BoardName),
        _ => throw new ArgumentException($"Unknown grouping '{groupBy}'"),
    };

    private static object Compute(string type, JsonObject config, List<IssueRow> issues, IReadOnlyDictionary<Guid, (string Name, string? Avatar)> users,
        List<DevRow> dev, List<HomeItem> goals, DashboardFilters filters, DateTime now)
    {
        var days = filters.CreatedDays ?? Int(config, "days", 90, 7, 730);
        var start = StartOfWeek(now.AddDays(-days));
        var weeks = new List<DateTime>();
        for (var w = start; w <= now; w = w.AddDays(7)) weeks.Add(w);
        int WeekIndex(DateTime at) => at < start ? -1 : Math.Min(weeks.Count - 1, (int)((at - start).TotalDays / 7));
        var x = weeks.Select(w => w.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)).ToList();

        object Categorical(IEnumerable<(Bucket Bucket, double Value)> values)
        {
            var items = values.GroupBy(v => v.Bucket.Key)
                .Select(g => new { key = g.Key, label = g.First().Bucket.Label, category = g.First().Bucket.Category, order = g.First().Bucket.Order, value = Math.Round(g.Sum(v => v.Value), 2) })
                .OrderBy(i => i.order).ThenByDescending(i => i.value).ToList();
            return new { kind = "categorical", items = items.Select(i => new { i.key, i.label, i.category, i.value }), total = Math.Round(items.Sum(i => i.value), 2) };
        }

        object Series(IEnumerable<(Bucket Bucket, int Week, double Value)> points, bool average = false)
        {
            var list = points.Where(p => p.Week >= 0).ToList();
            var series = list.GroupBy(p => p.Bucket.Key).OrderBy(g => g.First().Bucket.Order).Select(g => new
            {
                key = g.Key,
                label = g.First().Bucket.Label,
                category = g.First().Bucket.Category,
                values = Enumerable.Range(0, weeks.Count).Select(w =>
                {
                    var bucket = g.Where(p => p.Week == w).Select(p => p.Value).ToList();
                    if (bucket.Count == 0) return average ? (double?)null : 0;
                    return (double?)Math.Round(average ? bucket.Average() : bucket.Sum(), 1);
                }).ToList(),
            }).ToList();
            return new { kind = "series", axis = "week", x, series, total = list.Count };
        }

        Bucket Split(IssueRow i, string split) => split == "none" ? new Bucket("all", "Задачи") : Group(i, split, users);

        switch (type)
        {
            case "count_by":
            {
                var groupBy = Str(config, "groupBy", "status");
                var storyPoints = Str(config, "measure", "count") == "storyPoints";
                return Categorical(issues.Select(i => (Group(i, groupBy, users), storyPoints ? (double)(i.StoryPoints ?? 0) : 1d)));
            }
            case "created_trend":
            {
                var split = Str(config, "split", "type");
                return Series(issues.Select(i => (Split(i, split), WeekIndex(i.CreatedAt), 1d)));
            }
            case "completion_trend":
            {
                var split = Str(config, "split", "none");
                return Series(issues.Where(i => i.CompletedAt.HasValue).Select(i => (split == "none" ? new Bucket("resolved", "Выполнено") : Split(i, split), WeekIndex(i.CompletedAt!.Value), 1d)));
            }
            case "created_vs_resolved":
            {
                var created = issues.Select(i => (new Bucket("created", "Создано", null, 0), WeekIndex(i.CreatedAt), 1d));
                var resolved = issues.Where(i => i.CompletedAt.HasValue).Select(i => (new Bucket("resolved", "Выполнено", "done", 1), WeekIndex(i.CompletedAt!.Value), 1d));
                return Series(created.Concat(resolved));
            }
            case "cycle_time":
                return Series(issues.Where(i => i.CompletedAt.HasValue && i.CompletedAt >= i.CreatedAt)
                    .Select(i => (Group(i, "type", users), WeekIndex(i.CompletedAt!.Value), (i.CompletedAt!.Value - i.CreatedAt).TotalDays)), average: true);
            case "status_priority":
            {
                var statuses = issues.Select(i => Group(i, "status", users)).GroupBy(b => b.Key).Select(g => g.First()).OrderBy(b => b.Order).ThenBy(b => b.Label).ToList();
                var series = Enum.GetValues<IssuePriority>().OrderByDescending(p => (int)p).Select(p => new
                {
                    key = p.ToString(),
                    label = PriorityLabels[p],
                    category = (string?)null,
                    values = statuses.Select(s => (double?)issues.Count(i => i.Priority == p && i.Status == s.Key)).ToList(),
                }).Where(s => s.values.Any(v => v > 0)).ToList();
                return new { kind = "series", axis = "category", x = statuses.Select(s => s.Label).ToList(), categories = statuses.Select(s => s.Category).ToList(), series, total = issues.Count };
            }
            case "issue_table":
            {
                var limit = Int(config, "limit", 10, 1, 50);
                var sort = Str(config, "sort", "created");
                IEnumerable<IssueRow> ordered = sort switch
                {
                    "priority" => issues.OrderByDescending(i => i.Priority).ThenByDescending(i => i.CreatedAt),
                    "resolved" => issues.Where(i => i.CompletedAt.HasValue).OrderByDescending(i => i.CompletedAt),
                    _ => issues.OrderByDescending(i => i.CreatedAt),
                };
                return new
                {
                    kind = "table",
                    total = issues.Count,
                    rows = ordered.Take(limit).Select(i => new
                    {
                        id = i.Id, boardId = i.BoardId, key = i.IssueKey, title = i.Title, type = (int)i.Type, priority = (int)i.Priority,
                        status = i.Status, statusCategory = Category(i.StatusKind), storyPoints = i.StoryPoints,
                        assigneeName = i.AssigneeId.HasValue && users.TryGetValue(i.AssigneeId.Value, out var u) ? u.Name : null,
                        assigneeAvatarUrl = i.AssigneeId.HasValue && users.TryGetValue(i.AssigneeId.Value, out var a) ? a.Avatar : null,
                        createdAt = i.CreatedAt, completedAt = i.CompletedAt,
                    }),
                };
            }
            case "dev_count_by":
            {
                var kind = Str(config, "kind", "commit");
                var groupBy = Str(config, "groupBy", "author");
                return Categorical(dev.Where(d => d.Kind == kind).Select(d => (groupBy == "status"
                    ? new Bucket(d.Status ?? "unknown", string.IsNullOrWhiteSpace(d.Status) ? "Без статуса" : d.Status!, d.Status is "merged" or "success" ? "done" : d.Status is "failure" or "closed" ? "danger" : null)
                    : new Bucket(d.Author, d.Author), 1d)));
            }
            case "dev_trend":
            {
                var kind = Str(config, "kind", "commit");
                return Series(dev.Where(d => d.Kind == kind).Select(d => (new Bucket(kind, kind switch
                {
                    "pull_request" => "Запросы pull", "check_run" => "Сборки", "branch" => "Ветки", _ => "Коммиты",
                }), WeekIndex(d.At), 1d)));
            }
            case "goals_by_status":
                return Categorical(goals.Select(g => (new Bucket(g.Status, GoalStatusLabels.GetValueOrDefault(g.Status, g.Status), g.Status,
                    Array.IndexOf(HomeService.Statuses, g.Status)), 1d)));
            case "goals_list":
            {
                var limit = Int(config, "limit", 10, 1, 50);
                return new
                {
                    kind = "goals",
                    total = goals.Count,
                    rows = goals.OrderBy(g => g.TargetDate ?? DateTime.MaxValue).Take(limit).Select(g => new
                    {
                        id = g.Id, name = g.Name, status = g.Status, statusLabel = GoalStatusLabels.GetValueOrDefault(g.Status, g.Status),
                        score = g.Score, targetDate = g.TargetDate, lastUpdateAt = g.LastUpdateAt,
                    }),
                };
            }
            default:
                throw new ArgumentException($"Unknown widget type '{type}'");
        }
    }
}
