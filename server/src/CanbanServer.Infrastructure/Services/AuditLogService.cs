using System.Text.Json;
using System.Text.Json.Nodes;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Which entity the route id of an audited action points to.</summary>
public enum AuditTarget
{
    Team,
    Board,
    Column,
    Quest,
    Sprint,
    Component,
    Release,
    IssueType,
    CustomField,
    AssetSchema,
    UserGroup,
    /// <summary>Team or board is taken from the request body (TeamId / BoardId property).</summary>
    Body,
    /// <summary>A personal action (sign-in, API tokens) recorded in every team the user belongs to.</summary>
    Actor,
}

public sealed record AuditScope(Guid TeamId, Guid? BoardId, string? BoardName, string? ObjectType, Guid? ObjectId, string? ObjectName);

public sealed record AuditEntry(
    Guid TeamId, Guid? BoardId, string? BoardName, Guid? ActorId, string Action,
    string? ObjectType, Guid? ObjectId, string? ObjectName, string? DetailsJson, string? IpAddress);

public sealed record AuditQuery(
    Guid? TeamId = null, string? Category = null, Guid? ActorId = null, string? Search = null,
    DateTime? From = null, DateTime? To = null, int Page = 1, int PageSize = 50);

public partial class AuditLogService
{
    public const int MaxDetailsLength = 16000;
    private static readonly string[] SecretMarkers = { "password", "secret", "token", "apikey", "privatekey", "credential" };

    private readonly CanbanDbContext _db;

    public AuditLogService(CanbanDbContext db) => _db = db;

    public async Task<AuditScope?> ResolveAsync(AuditTarget target, Guid id, CancellationToken ct)
    {
        switch (target)
        {
            case AuditTarget.Team:
                return await _db.Teams.AsNoTracking().Where(t => t.Id == id)
                    .Select(t => new AuditScope(t.Id, null, null, "team", t.Id, t.Name)).FirstOrDefaultAsync(ct);
            case AuditTarget.Board:
                return await _db.Boards.AsNoTracking().Where(b => b.Id == id)
                    .Select(b => new AuditScope(b.TeamId, b.Id, b.Name, "board", b.Id, b.Name)).FirstOrDefaultAsync(ct);
            case AuditTarget.Column:
                return await _db.Columns.AsNoTracking().Where(c => c.Id == id)
                    .Select(c => new AuditScope(c.Board.TeamId, c.BoardId, c.Board.Name, "status", c.Id, c.Title)).FirstOrDefaultAsync(ct);
            case AuditTarget.Quest:
                return await _db.Quests.AsNoTracking().Where(q => q.Id == id)
                    .Select(q => new AuditScope(q.Board.TeamId, q.BoardId, q.Board.Name, "issue", q.Id, q.IssueKey + " " + q.Title)).FirstOrDefaultAsync(ct);
            case AuditTarget.Sprint:
                return await (from s in _db.Sprints.AsNoTracking()
                              join b in _db.Boards on s.BoardId equals b.Id
                              where s.Id == id
                              select new AuditScope(b.TeamId, b.Id, b.Name, "sprint", s.Id, s.Name)).FirstOrDefaultAsync(ct);
            case AuditTarget.Component:
                return await (from c in _db.BoardComponents.AsNoTracking()
                              join b in _db.Boards on c.BoardId equals b.Id
                              where c.Id == id
                              select new AuditScope(b.TeamId, b.Id, b.Name, "component", c.Id, c.Name)).FirstOrDefaultAsync(ct);
            case AuditTarget.Release:
                return await (from r in _db.BoardReleases.AsNoTracking()
                              join b in _db.Boards on r.BoardId equals b.Id
                              where r.Id == id
                              select new AuditScope(b.TeamId, b.Id, b.Name, "release", r.Id, r.Name)).FirstOrDefaultAsync(ct);
            case AuditTarget.IssueType:
                return await _db.IssueTypeDefinitions.AsNoTracking().Where(t => t.Id == id)
                    .Select(t => new AuditScope(t.TeamId, null, null, "issuetype", t.Id, t.Name)).FirstOrDefaultAsync(ct);
            case AuditTarget.CustomField:
                return await _db.CustomFieldDefinitions.AsNoTracking().Where(f => f.Id == id)
                    .Select(f => new AuditScope(f.TeamId, null, null, "field", f.Id, f.Name)).FirstOrDefaultAsync(ct);
            case AuditTarget.AssetSchema:
                return await _db.AssetSchemas.AsNoTracking().Where(s => s.Id == id)
                    .Select(s => new AuditScope(s.TeamId, null, null, "assetschema", s.Id, s.Name)).FirstOrDefaultAsync(ct);
            case AuditTarget.UserGroup:
                return await _db.UserGroups.AsNoTracking().Where(g => g.Id == id)
                    .Select(g => new AuditScope(g.TeamId, null, null, "group", g.Id, g.Name)).FirstOrDefaultAsync(ct);
            default:
                return null;
        }
    }

    public Task<string?> UserNameAsync(Guid userId, CancellationToken ct) =>
        _db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.DisplayName).FirstOrDefaultAsync(ct);

    public async Task RecordAsync(AuditEntry entry, CancellationToken ct)
    {
        var actorName = entry.ActorId is { } actorId
            ? await _db.Users.AsNoTracking().Where(u => u.Id == actorId).Select(u => u.DisplayName).FirstOrDefaultAsync(ct) ?? ""
            : "";
        var action = Clip(entry.Action, 80)!;
        _db.AuditEvents.Add(new AuditEvent
        {
            Id = Guid.NewGuid(),
            TeamId = entry.TeamId,
            BoardId = entry.BoardId,
            BoardName = Clip(entry.BoardName, 200),
            ActorId = entry.ActorId,
            ActorName = Clip(actorName, 200)!,
            Action = action,
            Category = CategoryOf(action),
            ObjectType = Clip(entry.ObjectType, 40),
            ObjectId = entry.ObjectId,
            ObjectName = Clip(entry.ObjectName, 300),
            DetailsJson = Clip(entry.DetailsJson, MaxDetailsLength),
            IpAddress = Clip(entry.IpAddress, 64),
            CreatedAt = DateTime.UtcNow,
        });
        await _db.SaveChangesAsync(ct);
    }

    public async Task<object> ListAsync(Guid userId, AuditQuery query, CancellationToken ct)
    {
        var (teams, teamIds, events) = await FilterAsync(userId, query, ct);
        var pageSize = Math.Clamp(query.PageSize, 1, 200);
        var page = Math.Max(query.Page, 1);
        var total = await events.CountAsync(ct);
        var rows = await events.OrderByDescending(e => e.CreatedAt).ThenBy(e => e.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        var actorIds = rows.Where(r => r.ActorId.HasValue).Select(r => r.ActorId!.Value).Distinct().ToList();
        var avatars = await _db.Users.AsNoTracking().Where(u => actorIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.AvatarUrl }).ToDictionaryAsync(u => u.Id, ct);
        var teamNames = teams.ToDictionary(t => t.Id, t => t.Name);
        var actors = await _db.AuditEvents.AsNoTracking().Where(e => teamIds.Contains(e.TeamId) && e.ActorId != null)
            .GroupBy(e => e.ActorId).Select(g => new { id = g.Key, name = g.Max(e => e.ActorName) }).ToListAsync(ct);

        return new
        {
            total,
            page,
            pageSize,
            teams = teams.Select(t => new { id = t.Id, name = t.Name }),
            actors = actors.OrderBy(a => a.name),
            items = rows.Select(r => new
            {
                id = r.Id,
                teamId = r.TeamId,
                teamName = teamNames.GetValueOrDefault(r.TeamId),
                boardId = r.BoardId,
                boardName = r.BoardName,
                actor = r.ActorId is { } a
                    ? new { id = a, name = avatars.TryGetValue(a, out var u) ? u.DisplayName : r.ActorName, avatarUrl = avatars.TryGetValue(a, out var v) ? v.AvatarUrl : null }
                    : null,
                action = r.Action,
                category = r.Category,
                objectType = r.ObjectType,
                objectId = r.ObjectId,
                objectName = r.ObjectName,
                details = ParseDetails(r.DetailsJson),
                ipAddress = r.IpAddress,
                createdAt = r.CreatedAt,
            }),
        };
    }

    public const int MaxExportRows = 10000;

    public async Task<string> ExportCsvAsync(Guid userId, AuditQuery query, CancellationToken ct)
    {
        var (teams, _, events) = await FilterAsync(userId, query, ct);
        var teamNames = teams.ToDictionary(t => t.Id, t => t.Name);
        var rows = await events.OrderByDescending(e => e.CreatedAt).ThenBy(e => e.Id).Take(MaxExportRows).ToListAsync(ct);
        var csv = new System.Text.StringBuilder("Date (UTC),Team,Space,Author,Category,Action,Object type,Object,IP,Details\n");
        foreach (var r in rows)
        {
            csv.AppendJoin(',', new[]
            {
                r.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss"), teamNames.GetValueOrDefault(r.TeamId) ?? "", r.BoardName ?? "", r.ActorName,
                r.Category, r.Action, r.ObjectType ?? "", r.ObjectName ?? "", r.IpAddress ?? "", r.DetailsJson ?? "",
            }.Select(CsvCell)).Append('\n');
        }
        return csv.ToString();
    }

    public static string CsvCell(string value)
    {
        if (value.Length > 0 && "=+-@".Contains(value[0])) value = "'" + value;
        return value.IndexOfAny(new[] { ',', '"', '\n', '\r' }) < 0 ? value : "\"" + value.Replace("\"", "\"\"") + "\"";
    }

    private async Task<(List<(Guid Id, string Name)> Teams, List<Guid> TeamIds, IQueryable<AuditEvent> Events)> FilterAsync(
        Guid userId, AuditQuery query, CancellationToken ct)
    {
        var teams = await AdminTeamsAsync(userId, ct);
        if (query.TeamId is { } requested && teams.All(t => t.Id != requested))
            throw new UnauthorizedAccessException("Журнал аудита доступен только администраторам команды.");
        var teamIds = query.TeamId is { } only ? new List<Guid> { only } : teams.Select(t => t.Id).ToList();

        var events = _db.AuditEvents.AsNoTracking().Where(e => teamIds.Contains(e.TeamId));
        if (!string.IsNullOrWhiteSpace(query.Category)) events = events.Where(e => e.Category == query.Category);
        if (query.ActorId is { } actor) events = events.Where(e => e.ActorId == actor);
        if (query.From is { } from) events = events.Where(e => e.CreatedAt >= DateTime.SpecifyKind(from, DateTimeKind.Utc));
        if (query.To is { } to) events = events.Where(e => e.CreatedAt < DateTime.SpecifyKind(to, DateTimeKind.Utc));
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = "%" + query.Search.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            events = events.Where(e => EF.Functions.ILike(e.ObjectName ?? "", pattern) || EF.Functions.ILike(e.ActorName, pattern)
                || EF.Functions.ILike(e.BoardName ?? "", pattern) || EF.Functions.ILike(e.Action, pattern));
        }

        return (teams, teamIds, events);
    }

    private async Task<List<(Guid Id, string Name)>> AdminTeamsAsync(Guid userId, CancellationToken ct)
    {
        var rows = await _db.Teams.AsNoTracking()
            .Where(t => t.OwnerId == userId || t.Members.Any(m => m.UserId == userId && m.Role == TeamRole.Admin))
            .OrderBy(t => t.Name).Select(t => new { t.Id, t.Name }).ToListAsync(ct);
        return rows.Select(r => (r.Id, r.Name)).ToList();
    }

    public static string CategoryOf(string action)
    {
        var dot = action.IndexOf('.');
        return Clip(dot < 0 ? action : action[..dot], 40)!;
    }

    /// <summary>Serializes request arguments for the log, masking anything that looks like a credential.</summary>
    public static string? SerializeDetails(IReadOnlyDictionary<string, object?> values, IReadOnlyList<AuditChange>? changes = null)
    {
        var root = new JsonObject();
        foreach (var (name, value) in values)
        {
            try { root[name] = JsonSerializer.SerializeToNode(value, JsonOptions); }
            catch (Exception ex) when (ex is NotSupportedException or JsonException or InvalidOperationException) { }
        }
        Redact(root);
        var changesNode = changes is { Count: > 0 } ? JsonSerializer.SerializeToNode(changes, JsonOptions) : null;
        if (changesNode != null) root["changes"] = changesNode;
        if (root.Count == 0) return null;
        var json = root.ToJsonString();
        if (json.Length <= MaxDetailsLength) return json;
        if (changesNode == null) return null;
        json = new JsonObject { ["changes"] = JsonSerializer.SerializeToNode(changes, JsonOptions) }.ToJsonString();
        return json.Length <= MaxDetailsLength ? json : null;
    }

    public static JsonNode? Redact(JsonNode? node)
    {
        switch (node)
        {
            case JsonObject obj:
                foreach (var key in obj.Select(p => p.Key).ToList())
                {
                    var lowered = new string(key.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
                    if (SecretMarkers.Any(lowered.Contains)) obj[key] = obj[key] is null ? null : "***";
                    else Redact(obj[key]);
                }
                return obj;
            case JsonArray array:
                foreach (var item in array) Redact(item);
                return array;
            default:
                return node;
        }
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { MaxDepth = 8 };

    private static JsonElement? ParseDetails(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonDocument.Parse(json).RootElement.Clone(); }
        catch (JsonException) { return null; }
    }

    private static string? Clip(string? value, int max) =>
        value is null ? null : value.Length <= max ? value : value[..max];
}
