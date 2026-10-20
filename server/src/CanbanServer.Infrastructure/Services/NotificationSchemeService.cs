using System.Text.Json;
using System.Text.Json.Serialization;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public sealed record NotificationEvent(string Key, string Name);

public static class NotificationEvents
{
    public const string Created = "ISSUE_CREATED";
    public const string Updated = "ISSUE_UPDATED";
    public const string Assigned = "ISSUE_ASSIGNED";
    public const string Transitioned = "ISSUE_TRANSITIONED";
    public const string Resolved = "ISSUE_RESOLVED";
    public const string Reopened = "ISSUE_REOPENED";
    public const string Archived = "ISSUE_ARCHIVED";
    public const string Commented = "ISSUE_COMMENTED";
    public const string CommentDeleted = "ISSUE_COMMENT_DELETED";

    public static readonly NotificationEvent[] All =
    {
        new(Created, "Задача создана"),
        new(Updated, "Задача изменена"),
        new(Assigned, "Задача назначена"),
        new(Transitioned, "Статус задачи изменён"),
        new(Resolved, "Задача решена"),
        new(Reopened, "Задача переоткрыта"),
        new(Archived, "Задача архивирована"),
        new(Commented, "Новый комментарий"),
        new(CommentDeleted, "Комментарий удалён"),
    };

    /// <summary>Resolved when moved into Done, reopened when moved out of it, otherwise a plain transition.</summary>
    public static string ForMove(ColumnKind from, ColumnKind to) =>
        to == ColumnKind.Done && from != ColumnKind.Done ? Resolved
        : from == ColumnKind.Done && to is not (ColumnKind.Done or ColumnKind.Archive) ? Reopened
        : Transitioned;
}

public sealed class NotificationSchemeData
{
    public Dictionary<string, List<PermissionGrant>> Events { get; set; } = new();
}

/// <summary>Who is told about each issue event in a space, like Jira notification schemes.</summary>
public class NotificationSchemeService
{
    public const string Kind = "notificationscheme";
    public static readonly string[] RecipientTypes = { "watchers", "reporter", "assignee", "role", "group", "user" };
    private const int MaxRecipientsPerEvent = 50;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    private readonly CanbanDbContext _db;
    private readonly PermissionSchemeService _permissions;

    public NotificationSchemeService(CanbanDbContext db, PermissionSchemeService permissions)
    {
        _db = db;
        _permissions = permissions;
    }

    public static NotificationSchemeData Default()
    {
        var data = new NotificationSchemeData();
        foreach (var e in NotificationEvents.All)
            data.Events[e.Key] = new() { new() { Type = "watchers" }, new() { Type = "reporter" }, new() { Type = "assignee" } };
        return data;
    }

    public static NotificationSchemeData? Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize<NotificationSchemeData>(json, Json); }
        catch (JsonException) { return null; }
    }

    public static string Normalize(NotificationSchemeData data, ISet<Guid> groups, ISet<Guid> users)
    {
        var result = new NotificationSchemeData();
        foreach (var e in NotificationEvents.All)
        {
            var list = new List<PermissionGrant>();
            var seen = new HashSet<string>();
            foreach (var r in data.Events.GetValueOrDefault(e.Key) ?? new())
            {
                var type = (r.Type ?? "").Trim().ToLowerInvariant();
                var value = string.IsNullOrWhiteSpace(r.Value) ? null : r.Value.Trim().ToLowerInvariant();
                switch (type)
                {
                    case "watchers" or "reporter" or "assignee":
                        value = null;
                        break;
                    case "role" when PermissionSchemeService.RoleOrder.Contains(value):
                        break;
                    case "role":
                        throw new ArgumentException("Неизвестная роль");
                    case "group" when !(Guid.TryParse(value, out var gid) && groups.Contains(gid)):
                        throw new ArgumentException("Группа не найдена в этой команде");
                    case "user" when !(Guid.TryParse(value, out var uid) && users.Contains(uid)):
                        throw new ArgumentException("Пользователь не состоит в команде");
                    case "group" or "user":
                        break;
                    default:
                        throw new ArgumentException("Неизвестный тип получателя уведомления");
                }
                if (seen.Add($"{type}:{value}")) list.Add(new PermissionGrant { Type = type, Value = value });
            }
            if (list.Count > MaxRecipientsPerEvent) throw new ArgumentException($"Не больше {MaxRecipientsPerEvent} получателей одного события");
            result.Events[e.Key] = list;
        }
        return JsonSerializer.Serialize(result, Json);
    }

    public async Task<NotificationSchemeData> ForBoardAsync(Guid boardId, CancellationToken ct)
    {
        var schemeId = await _db.BoardIssueLayouts.AsNoTracking().Where(a => a.BoardId == boardId).Select(a => a.NotificationSchemeId).FirstOrDefaultAsync(ct);
        if (schemeId is not Guid id) return Default();
        return Parse(await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.Id == id && o.Kind == Kind).Select(o => o.DataJson).FirstOrDefaultAsync(ct)) ?? Default();
    }

    /// <summary>
    /// Users to notify about the event (only those who can browse the space) and whether
    /// the issue's watchers, including external email addresses, are included.
    /// </summary>
    public async Task<(HashSet<Guid> Users, bool Watchers)> RecipientsAsync(Guid boardId, string eventKey, Guid? reporterId,
        ISet<Guid> assigneeIds, IReadOnlyCollection<Guid> watcherIds, CancellationToken ct)
    {
        var scheme = await ForBoardAsync(boardId, ct);
        var rules = scheme.Events.GetValueOrDefault(eventKey) ?? new();
        var users = new HashSet<Guid>();
        var watchers = false;
        var teamId = await _db.Boards.AsNoTracking().Where(b => b.Id == boardId).Select(b => b.TeamId).FirstAsync(ct);
        foreach (var rule in rules)
        {
            switch (rule.Type)
            {
                case "watchers":
                    watchers = true;
                    users.UnionWith(watcherIds);
                    break;
                case "reporter" when reporterId.HasValue:
                    users.Add(reporterId.Value);
                    break;
                case "assignee":
                    users.UnionWith(assigneeIds);
                    break;
                case "user" when Guid.TryParse(rule.Value, out var id):
                    users.Add(id);
                    break;
                case "group" when Guid.TryParse(rule.Value, out var groupId):
                    users.UnionWith(await _db.UserGroupMembers.AsNoTracking().Where(m => m.GroupId == groupId && _db.UserGroups.Any(g => g.Id == groupId && g.TeamId == teamId))
                        .Select(m => m.UserId).ToListAsync(ct));
                    break;
                case "role":
                    users.UnionWith(await RoleMembersAsync(teamId, rule.Value, ct));
                    break;
            }
        }
        var visible = new HashSet<Guid>();
        foreach (var id in users)
            if (await _permissions.HasAsync(boardId, id, JiraPermissions.Browse, ct)) visible.Add(id);
        return (visible, watchers);
    }

    private async Task<List<Guid>> RoleMembersAsync(Guid teamId, string? role, CancellationToken ct)
    {
        var members = await _db.TeamMembers.AsNoTracking().Where(m => m.TeamId == teamId).Select(m => new { m.UserId, m.Role }).ToListAsync(ct);
        var ownerId = await _db.Teams.AsNoTracking().Where(t => t.Id == teamId).Select(t => t.OwnerId).FirstOrDefaultAsync(ct);
        var result = members.Where(m => PermissionSchemeService.RoleName(m.Role, m.UserId == ownerId) == role).Select(m => m.UserId).ToList();
        if (role == PermissionSchemeService.AdminRole && ownerId is Guid owner && !result.Contains(owner)) result.Add(owner);
        return result;
    }

    public async Task<object> CatalogAsync(Guid userId, Guid teamId, CancellationToken ct)
    {
        var canManage = await TeamAdminAsync(teamId, userId, ct);
        var objects = await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.TeamId == teamId && o.Kind == Kind).OrderBy(o => o.Name).ToListAsync(ct);
        var groups = await _db.UserGroups.AsNoTracking().Where(g => g.TeamId == teamId).OrderBy(g => g.Name).Select(g => new { id = g.Id, name = g.Name }).ToListAsync(ct);
        var users = await TeamUsersAsync(teamId, ct);
        var boards = await _db.Boards.AsNoTracking().Where(b => b.TeamId == teamId).OrderBy(b => b.Name).Select(b => new { b.Id, b.Name, b.KeyPrefix }).ToListAsync(ct);
        var boardIds = boards.Select(b => b.Id).ToList();
        var assigned = await _db.BoardIssueLayouts.AsNoTracking().Where(a => boardIds.Contains(a.BoardId) && a.NotificationSchemeId != null)
            .ToDictionaryAsync(a => a.BoardId, a => a.NotificationSchemeId, ct);
        return new
        {
            teamId,
            canManage,
            events = NotificationEvents.All.Select(e => new { key = e.Key, name = e.Name }),
            roles = PermissionSchemeService.RoleOrder,
            defaultData = Default(),
            objects = objects.Select(o => Dto(o, assigned.Where(a => a.Value == o.Id).Select(a => a.Key).ToList())),
            groups,
            users = users.Select(u => new { id = u.Id, displayName = u.DisplayName, email = u.Email }),
            boards = boards.Select(b => new { id = b.Id, name = b.Name, key = b.KeyPrefix, notificationSchemeId = assigned.GetValueOrDefault(b.Id) }),
        };
    }

    public async Task<object> CreateAsync(Guid userId, IssueLayoutRequest request, CancellationToken ct)
    {
        await EnsureTeamAdminAsync(request.TeamId, userId, ct);
        if (await _db.IssueLayoutObjects.CountAsync(o => o.TeamId == request.TeamId && o.Kind == Kind, ct) >= 100)
            throw new InvalidOperationException("Достигнут предел схем уведомлений в команде");
        var now = DateTime.UtcNow;
        var item = new IssueLayoutObject { Id = Guid.NewGuid(), TeamId = request.TeamId, Kind = Kind, CreatedAt = now, UpdatedAt = now };
        await ApplyAsync(item, request, isNew: true, ct);
        _db.IssueLayoutObjects.Add(item);
        await _db.SaveChangesAsync(ct);
        return Dto(item, Array.Empty<Guid>());
    }

    public async Task<object> UpdateAsync(Guid id, Guid userId, IssueLayoutRequest request, CancellationToken ct)
    {
        var item = await FindAsync(id, ct);
        await EnsureTeamAdminAsync(item.TeamId, userId, ct);
        await ApplyAsync(item, request with { TeamId = item.TeamId }, isNew: false, ct);
        item.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        var boards = await _db.BoardIssueLayouts.AsNoTracking().Where(a => a.NotificationSchemeId == id).Select(a => a.BoardId).ToListAsync(ct);
        return Dto(item, boards);
    }

    public async Task DeleteAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var item = await FindAsync(id, ct);
        await EnsureTeamAdminAsync(item.TeamId, userId, ct);
        if (await _db.BoardIssueLayouts.AnyAsync(a => a.NotificationSchemeId == id, ct))
            throw new InvalidOperationException("Схема используется — сначала назначьте пространствам другую");
        _db.IssueLayoutObjects.Remove(item);
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>Null returns the space to the default scheme.</summary>
    public async Task<object> AssignAsync(Guid boardId, Guid userId, Guid? schemeId, CancellationToken ct)
    {
        var teamId = await _db.Boards.Where(b => b.Id == boardId).Select(b => (Guid?)b.TeamId).FirstOrDefaultAsync(ct) ?? throw new KeyNotFoundException("Board not found");
        if (!await TeamAdminAsync(teamId, userId, ct))
            throw new UnauthorizedAccessException("Менять схему уведомлений может только владелец или администратор команды");
        if (schemeId is Guid id && !await _db.IssueLayoutObjects.AnyAsync(o => o.Id == id && o.Kind == Kind && o.TeamId == teamId, ct))
            throw new ArgumentException("Схема уведомлений не найдена в этой команде");
        var row = await _db.BoardIssueLayouts.FirstOrDefaultAsync(a => a.BoardId == boardId, ct);
        if (row == null) _db.BoardIssueLayouts.Add(row = new BoardIssueLayout { BoardId = boardId });
        row.NotificationSchemeId = schemeId;
        await _db.SaveChangesAsync(ct);
        return new { boardId, notificationSchemeId = schemeId };
    }

    private async Task ApplyAsync(IssueLayoutObject item, IssueLayoutRequest request, bool isNew, CancellationToken ct)
    {
        if (request.Name != null)
        {
            var name = request.Name.Trim();
            if (name.Length == 0) throw new ArgumentException("Введите название");
            if (name.Length > 100) throw new ArgumentException("Название — не больше 100 символов");
            var taken = await _db.IssueLayoutObjects.Where(o => o.TeamId == item.TeamId && o.Kind == Kind && o.Id != item.Id).Select(o => o.Name).ToListAsync(ct);
            if (taken.Contains(name, StringComparer.OrdinalIgnoreCase)) throw new ArgumentException($"«{name}» уже есть");
            item.Name = name;
        }
        else if (item.Name.Length == 0) throw new ArgumentException("Введите название");
        if (request.Description != null)
        {
            var description = request.Description.Trim();
            item.Description = description.Length == 0 ? null : description.Length > 500 ? description[..500] : description;
        }
        NotificationSchemeData? data = null;
        if (request.Data is JsonElement json && json.ValueKind == JsonValueKind.Object)
        {
            try { data = json.Deserialize<NotificationSchemeData>(Json) ?? new(); }
            catch (JsonException) { throw new ArgumentException("Неверный формат схемы уведомлений"); }
        }
        else if (isNew) data = Default();
        if (data != null)
        {
            var groups = (await _db.UserGroups.Where(g => g.TeamId == item.TeamId).Select(g => g.Id).ToListAsync(ct)).ToHashSet();
            var users = (await TeamUsersAsync(item.TeamId, ct)).Select(u => u.Id).ToHashSet();
            item.DataJson = Normalize(data, groups, users);
        }
    }

    private async Task<List<(Guid Id, string DisplayName, string Email)>> TeamUsersAsync(Guid teamId, CancellationToken ct)
    {
        var ownerId = await _db.Teams.Where(t => t.Id == teamId).Select(t => t.OwnerId).FirstOrDefaultAsync(ct);
        var ids = await _db.TeamMembers.Where(m => m.TeamId == teamId).Select(m => m.UserId).ToListAsync(ct);
        if (ownerId is Guid owner) ids.Add(owner);
        var users = await _db.Users.AsNoTracking().Where(u => ids.Contains(u.Id)).OrderBy(u => u.DisplayName)
            .Select(u => new { u.Id, u.DisplayName, u.Email }).ToListAsync(ct);
        return users.Select(u => (u.Id, u.DisplayName, u.Email)).ToList();
    }

    private static object Dto(IssueLayoutObject o, IReadOnlyCollection<Guid> boards) => new
    {
        id = o.Id,
        teamId = o.TeamId,
        kind = o.Kind,
        name = o.Name,
        description = o.Description,
        data = JsonSerializer.Deserialize<JsonElement>(o.DataJson),
        usedBy = boards,
        updatedAt = o.UpdatedAt,
    };

    private async Task<IssueLayoutObject> FindAsync(Guid id, CancellationToken ct) =>
        await _db.IssueLayoutObjects.FirstOrDefaultAsync(o => o.Id == id && o.Kind == Kind, ct) ?? throw new KeyNotFoundException("Not found");

    private async Task<bool> TeamAdminAsync(Guid teamId, Guid userId, CancellationToken ct)
    {
        var team = await _db.Teams.AsNoTracking().Where(t => t.Id == teamId).Select(t => new { t.OwnerId }).FirstOrDefaultAsync(ct)
            ?? throw new KeyNotFoundException("Team not found");
        var role = await _db.TeamMembers.Where(m => m.TeamId == teamId && m.UserId == userId).Select(m => (TeamRole?)m.Role).FirstOrDefaultAsync(ct);
        if (team.OwnerId != userId && role == null) throw new UnauthorizedAccessException("Нет доступа к команде");
        return team.OwnerId == userId || role == TeamRole.Admin;
    }

    private async Task EnsureTeamAdminAsync(Guid teamId, Guid userId, CancellationToken ct)
    {
        if (!await TeamAdminAsync(teamId, userId, ct))
            throw new UnauthorizedAccessException("Настраивать схемы уведомлений может только владелец или администратор команды");
    }
}
