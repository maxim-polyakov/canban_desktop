using System.Text.Json;
using System.Text.Json.Serialization;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public sealed record JiraPermission(string Key, string Name, string Category, BoardPermission DefaultLevel, bool IssueScoped);

public static class JiraPermissions
{
    public const string Browse = "BROWSE_PROJECTS";
    public const string Administer = "ADMINISTER_PROJECTS";
    public const string ManageSprints = "MANAGE_SPRINTS";
    public const string Create = "CREATE_ISSUES";
    public const string Edit = "EDIT_ISSUES";
    public const string Transition = "TRANSITION_ISSUES";
    public const string Assign = "ASSIGN_ISSUES";
    public const string Assignable = "ASSIGNABLE_USER";
    public const string Link = "LINK_ISSUES";
    public const string Delete = "DELETE_ISSUES";
    public const string ManageWatchers = "MANAGE_WATCHERS";
    public const string ViewVoters = "VIEW_VOTERS_AND_WATCHERS";
    public const string AddComments = "ADD_COMMENTS";
    public const string DeleteAllComments = "DELETE_ALL_COMMENTS";
    public const string DeleteOwnComments = "DELETE_OWN_COMMENTS";
    public const string CreateAttachments = "CREATE_ATTACHMENTS";
    public const string DeleteAllAttachments = "DELETE_ALL_ATTACHMENTS";
    public const string DeleteOwnAttachments = "DELETE_OWN_ATTACHMENTS";
    public const string WorkOnIssues = "WORK_ON_ISSUES";
    public const string DeleteAllWorklogs = "DELETE_ALL_WORKLOGS";
    public const string DeleteOwnWorklogs = "DELETE_OWN_WORKLOGS";

    public static readonly JiraPermission[] All =
    {
        new(Browse, "Просмотр пространства", "Пространство", BoardPermission.View, false),
        new(Administer, "Администрирование пространства", "Пространство", BoardPermission.Manage, false),
        new(ManageSprints, "Управление спринтами", "Пространство", BoardPermission.Work, false),
        new(Create, "Создание задач", "Задачи", BoardPermission.Work, false),
        new(Edit, "Изменение задач", "Задачи", BoardPermission.Work, true),
        new(Transition, "Переходы задач", "Задачи", BoardPermission.Work, true),
        new(Assign, "Назначение задач", "Задачи", BoardPermission.Work, true),
        new(Assignable, "Может быть исполнителем", "Задачи", BoardPermission.Work, false),
        new(Link, "Связывание задач", "Задачи", BoardPermission.Work, true),
        new(Delete, "Удаление задач", "Задачи", BoardPermission.Manage, true),
        new(ManageWatchers, "Управление наблюдателями", "Наблюдатели и голоса", BoardPermission.Work, true),
        new(ViewVoters, "Просмотр голосовавших и наблюдателей", "Наблюдатели и голоса", BoardPermission.Work, true),
        new(AddComments, "Добавление комментариев", "Комментарии", BoardPermission.Work, true),
        new(DeleteAllComments, "Удаление любых комментариев", "Комментарии", BoardPermission.Manage, true),
        new(DeleteOwnComments, "Удаление своих комментариев", "Комментарии", BoardPermission.Work, true),
        new(CreateAttachments, "Добавление вложений", "Вложения", BoardPermission.Work, true),
        new(DeleteAllAttachments, "Удаление любых вложений", "Вложения", BoardPermission.Manage, true),
        new(DeleteOwnAttachments, "Удаление своих вложений", "Вложения", BoardPermission.Work, true),
        new(WorkOnIssues, "Учёт времени", "Учёт времени", BoardPermission.Work, true),
        new(DeleteAllWorklogs, "Удаление любого учёта времени", "Учёт времени", BoardPermission.Manage, true),
        new(DeleteOwnWorklogs, "Удаление своего учёта времени", "Учёт времени", BoardPermission.Work, true),
    };

    public static JiraPermission? Find(string key) => All.FirstOrDefault(p => p.Key == key);
}

public sealed class PermissionGrant
{
    public string Type { get; set; } = "";
    public string? Value { get; set; }
}

public sealed class PermissionSchemeData
{
    public Dictionary<string, List<PermissionGrant>> Grants { get; set; } = new();
}

/// <summary>What a user may do in a space: their role there, their groups and the space's permission scheme.</summary>
public sealed class PermissionScope
{
    public Guid BoardId { get; init; }
    public Guid TeamId { get; init; }
    public Guid UserId { get; init; }
    /// <summary>viewer, member, lead or admin; outsiders get member in open spaces and viewer in limited ones; null without access.</summary>
    public string? Role { get; init; }
    public PermissionSchemeData Scheme { get; init; } = new();
    public HashSet<Guid> Groups { get; init; } = new();

    public bool Has(string key, Guid? reporterId = null, IReadOnlyCollection<Guid>? assigneeIds = null) =>
        PermissionSchemeService.Grants(Scheme, key, Role, Groups, UserId, reporterId, assigneeIds);

    public bool Has(string key, Quest quest) =>
        Has(key, quest.ReporterId, quest.Assignees.Select(a => a.UserId).Append(quest.AssigneeId ?? Guid.Empty).Where(id => id != Guid.Empty).ToList());

    /// <summary>The coarse level existing checks use: Admin for team admins, then Administer, Edit and Browse.</summary>
    public BoardPermission? Level => Role == null || !Has(JiraPermissions.Browse) ? null
        : Role == PermissionSchemeService.AdminRole ? BoardPermission.Admin
        : Has(JiraPermissions.Administer) ? BoardPermission.Manage
        : Has(JiraPermissions.Edit) ? BoardPermission.Work
        : Has(JiraPermissions.Browse) ? BoardPermission.View
        : null;
}

public class PermissionSchemeService
{
    public const string Kind = "permissionscheme";
    public const string AdminRole = "admin";
    public static readonly string[] RoleOrder = { "viewer", "member", "lead", AdminRole };
    public static readonly string[] GrantTypes = { "role", "group", "user", "reporter", "assignee", "anyone" };
    private const int MaxGrantsPerPermission = 50;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    private readonly CanbanDbContext _db;
    private readonly Dictionary<(Guid, Guid), PermissionScope?> _scopes = new();
    private readonly Dictionary<Guid, Quest?> _quests = new();

    public PermissionSchemeService(CanbanDbContext db) => _db = db;

    public static string RoleName(TeamRole? role, bool isOwner) => isOwner ? AdminRole : role switch
    {
        TeamRole.Admin => AdminRole,
        TeamRole.Lead => "lead",
        TeamRole.Viewer => "viewer",
        TeamRole.Member => "member",
        _ => "viewer",
    };

    public static PermissionSchemeData Default()
    {
        var data = new PermissionSchemeData();
        foreach (var permission in JiraPermissions.All)
        {
            var from = permission.DefaultLevel switch { BoardPermission.View => 0, BoardPermission.Work => 1, BoardPermission.Manage => 2, _ => 3 };
            data.Grants[permission.Key] = RoleOrder.Skip(from).Select(r => new PermissionGrant { Type = "role", Value = r }).ToList();
        }
        data.Grants[JiraPermissions.Delete].Add(new PermissionGrant { Type = "reporter" });
        return data;
    }

    public static bool Grants(PermissionSchemeData scheme, string key, string? role, ISet<Guid> groups, Guid userId, Guid? reporterId, IReadOnlyCollection<Guid>? assigneeIds)
    {
        if (role == null) return false;
        if (role == AdminRole && key is JiraPermissions.Browse or JiraPermissions.Administer) return true;
        if (!scheme.Grants.TryGetValue(key, out var grants)) return false;
        foreach (var g in grants)
        {
            var granted = g.Type switch
            {
                "anyone" => true,
                "role" => g.Value == role,
                "group" => Guid.TryParse(g.Value, out var groupId) && groups.Contains(groupId),
                "user" => Guid.TryParse(g.Value, out var id) && id == userId,
                "reporter" => reporterId == userId,
                "assignee" => assigneeIds?.Contains(userId) == true,
                _ => false,
            };
            if (granted) return true;
        }
        return false;
    }

    /// <summary>Cached for the request; null when the space does not exist.</summary>
    public async Task<PermissionScope?> ScopeAsync(Guid boardId, Guid userId, CancellationToken ct)
    {
        if (_scopes.TryGetValue((boardId, userId), out var cached)) return cached;
        var board = await _db.Boards.AsNoTracking().Where(b => b.Id == boardId)
            .Select(b => new { b.TeamId, b.Access, OwnerId = b.Team.OwnerId }).FirstOrDefaultAsync(ct);
        PermissionScope? scope = null;
        if (board != null)
        {
            var member = await _db.TeamMembers.AsNoTracking().Where(m => m.TeamId == board.TeamId && m.UserId == userId).Select(m => (TeamRole?)m.Role).FirstOrDefaultAsync(ct);
            var isOwner = board.OwnerId == userId;
            var role = isOwner || member != null ? RoleName(member, isOwner)
                : ProjectAccessService.OutsiderPermission(board.Access) switch { BoardPermission.Work => "member", BoardPermission.View => "viewer", _ => null };
            var schemeId = await _db.BoardIssueLayouts.AsNoTracking().Where(a => a.BoardId == boardId).Select(a => a.PermissionSchemeId).FirstOrDefaultAsync(ct);
            var scheme = schemeId is Guid id
                ? Parse(await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.Id == id && o.Kind == Kind).Select(o => o.DataJson).FirstOrDefaultAsync(ct)) ?? Default()
                : Default();
            var groups = role == null || !scheme.Grants.Values.Any(list => list.Any(g => g.Type == "group")) ? new HashSet<Guid>()
                : (await _db.UserGroupMembers.AsNoTracking().Where(m => m.UserId == userId && _db.UserGroups.Any(g => g.Id == m.GroupId && g.TeamId == board.TeamId))
                    .Select(m => m.GroupId).ToListAsync(ct)).ToHashSet();
            scope = new PermissionScope { BoardId = boardId, TeamId = board.TeamId, UserId = userId, Role = role, Scheme = scheme, Groups = groups };
        }
        _scopes[(boardId, userId)] = scope;
        return scope;
    }

    public async Task<bool> HasAsync(Guid boardId, Guid userId, string key, CancellationToken ct, Quest? quest = null)
    {
        var scope = await ScopeAsync(boardId, userId, ct);
        return scope != null && scope.Has(JiraPermissions.Browse) && (quest == null ? scope.Has(key) : scope.Has(key, quest));
    }

    public Task<Guid?> BoardOfColumnAsync(Guid columnId, CancellationToken ct) =>
        _db.Columns.AsNoTracking().Where(c => c.Id == columnId).Select(c => (Guid?)c.BoardId).FirstOrDefaultAsync(ct);

    public Task<Quest?> FindQuestAsync(Guid questId, CancellationToken ct) => QuestAsync(questId, ct);

    private async Task<Quest?> QuestAsync(Guid questId, CancellationToken ct)
    {
        if (_quests.TryGetValue(questId, out var cached)) return cached;
        var quest = await _db.Quests.AsNoTracking().Include(q => q.Assignees).FirstOrDefaultAsync(q => q.Id == questId, ct);
        _quests[questId] = quest;
        return quest;
    }

    /// <summary>Browse plus the permission on the issue, counting reporter and assignee grants.</summary>
    public async Task<bool> HasOnQuestAsync(Guid questId, Guid userId, string key, CancellationToken ct)
    {
        var quest = await QuestAsync(questId, ct);
        if (quest == null) return false;
        var scope = await ScopeAsync(quest.BoardId, userId, ct);
        return scope?.Role != null && scope.Has(JiraPermissions.Browse) && scope.Has(key, quest);
    }

    /// <summary>Throws 404 for a missing issue and 403 without the permission; checks reporter and assignee grants.</summary>
    public async Task<Quest> EnsureQuestAsync(Guid questId, Guid userId, string key, CancellationToken ct)
    {
        var quest = await QuestAsync(questId, ct) ?? throw new KeyNotFoundException("Quest not found");
        await EnsureAsync(quest.BoardId, userId, key, ct, quest);
        return quest;
    }

    public async Task EnsureAsync(Guid boardId, Guid userId, string key, CancellationToken ct, Quest? quest = null)
    {
        var scope = await ScopeAsync(boardId, userId, ct) ?? throw new KeyNotFoundException("Board not found");
        if (scope.Role == null || !scope.Has(JiraPermissions.Browse)) throw new UnauthorizedAccessException("Нет доступа к пространству");
        if (!(quest == null ? scope.Has(key) : scope.Has(key, quest)))
            throw new UnauthorizedAccessException($"Недостаточно прав: {JiraPermissions.Find(key)?.Name ?? key}");
    }

    /// <summary>Users who hold the permission in the space without issue-specific grants (used for Assignable user).</summary>
    public async Task<HashSet<Guid>> HoldersAsync(Guid boardId, IReadOnlyCollection<Guid> userIds, string key, CancellationToken ct)
    {
        var result = new HashSet<Guid>();
        foreach (var id in userIds.Distinct())
            if (await HasAsync(boardId, id, key, ct)) result.Add(id);
        return result;
    }

    public static PermissionSchemeData? Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize<PermissionSchemeData>(json, Json); }
        catch (JsonException) { return null; }
    }

    /// <summary>Checks grants against the team; team admins keep browsing and administering so nobody locks the space.</summary>
    public static string Normalize(PermissionSchemeData data, ISet<Guid> groups, ISet<Guid> users)
    {
        var result = new PermissionSchemeData();
        foreach (var permission in JiraPermissions.All)
        {
            var list = new List<PermissionGrant>();
            var seen = new HashSet<string>();
            foreach (var g in data.Grants.GetValueOrDefault(permission.Key) ?? new())
            {
                var type = (g.Type ?? "").Trim().ToLowerInvariant();
                var value = string.IsNullOrWhiteSpace(g.Value) ? null : g.Value.Trim().ToLowerInvariant();
                if (!GrantTypes.Contains(type)) throw new ArgumentException("Неизвестный тип получателя права");
                switch (type)
                {
                    case "role" when !RoleOrder.Contains(value):
                        throw new ArgumentException("Неизвестная роль");
                    case "group" when !(Guid.TryParse(value, out var gid) && groups.Contains(gid)):
                        throw new ArgumentException("Группа не найдена в этой команде");
                    case "user" when !(Guid.TryParse(value, out var uid) && users.Contains(uid)):
                        throw new ArgumentException("Пользователь не состоит в команде");
                    case "reporter" or "assignee" when !permission.IssueScoped:
                        throw new ArgumentException($"«{permission.Name}» нельзя выдать автору или исполнителю задачи");
                }
                if (type is "reporter" or "assignee" or "anyone") value = null;
                if (seen.Add($"{type}:{value}")) list.Add(new PermissionGrant { Type = type, Value = value });
            }
            if (list.Count > MaxGrantsPerPermission) throw new ArgumentException($"Не больше {MaxGrantsPerPermission} получателей одного права");
            result.Grants[permission.Key] = list;
        }
        return JsonSerializer.Serialize(result, Json);
    }

    public static object Permissions() => JiraPermissions.All.Select(p => new { key = p.Key, name = p.Name, category = p.Category, issueScoped = p.IssueScoped });

    public async Task<object> CatalogAsync(Guid userId, Guid teamId, CancellationToken ct)
    {
        var canManage = await TeamAdminAsync(teamId, userId, ct);
        var objects = await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.TeamId == teamId && o.Kind == Kind).OrderBy(o => o.Name).ToListAsync(ct);
        var groups = await _db.UserGroups.AsNoTracking().Where(g => g.TeamId == teamId).OrderBy(g => g.Name).Select(g => new { id = g.Id, name = g.Name }).ToListAsync(ct);
        var users = await TeamUsersAsync(teamId, ct);
        var boards = await _db.Boards.AsNoTracking().Where(b => b.TeamId == teamId).OrderBy(b => b.Name).Select(b => new { b.Id, b.Name, b.KeyPrefix }).ToListAsync(ct);
        var boardIds = boards.Select(b => b.Id).ToList();
        var assigned = await _db.BoardIssueLayouts.AsNoTracking().Where(a => boardIds.Contains(a.BoardId) && a.PermissionSchemeId != null)
            .ToDictionaryAsync(a => a.BoardId, a => a.PermissionSchemeId, ct);
        return new
        {
            teamId,
            canManage,
            permissions = Permissions(),
            roles = RoleOrder,
            defaultData = Default(),
            objects = objects.Select(o => Dto(o, assigned.Where(a => a.Value == o.Id).Select(a => a.Key).ToList())),
            groups,
            users = users.Select(u => new { id = u.Id, displayName = u.DisplayName, email = u.Email }),
            boards = boards.Select(b => new { id = b.Id, name = b.Name, key = b.KeyPrefix, permissionSchemeId = assigned.GetValueOrDefault(b.Id) }),
        };
    }

    public async Task<object> CreateAsync(Guid userId, IssueLayoutRequest request, CancellationToken ct)
    {
        await EnsureTeamAdminAsync(request.TeamId, userId, ct);
        if (await _db.IssueLayoutObjects.CountAsync(o => o.TeamId == request.TeamId && o.Kind == Kind, ct) >= 100)
            throw new InvalidOperationException("Достигнут предел схем прав в команде");
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
        _scopes.Clear();
        var boards = await _db.BoardIssueLayouts.AsNoTracking().Where(a => a.PermissionSchemeId == id).Select(a => a.BoardId).ToListAsync(ct);
        return Dto(item, boards);
    }

    public async Task DeleteAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var item = await FindAsync(id, ct);
        await EnsureTeamAdminAsync(item.TeamId, userId, ct);
        if (await _db.BoardIssueLayouts.AnyAsync(a => a.PermissionSchemeId == id, ct))
            throw new InvalidOperationException("Схема используется — сначала назначьте пространствам другую");
        _db.IssueLayoutObjects.Remove(item);
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>Null returns the space to the default scheme.</summary>
    public async Task<object> AssignAsync(Guid boardId, Guid userId, Guid? schemeId, CancellationToken ct)
    {
        var teamId = await _db.Boards.Where(b => b.Id == boardId).Select(b => (Guid?)b.TeamId).FirstOrDefaultAsync(ct) ?? throw new KeyNotFoundException("Board not found");
        if (!await TeamAdminAsync(teamId, userId, ct))
        {
            var scope = await ScopeAsync(boardId, userId, ct);
            throw scope?.Role == null ? new KeyNotFoundException("Board not found") : new UnauthorizedAccessException("Менять схему прав может только владелец или администратор команды");
        }
        if (schemeId is Guid id && !await _db.IssueLayoutObjects.AnyAsync(o => o.Id == id && o.Kind == Kind && o.TeamId == teamId, ct))
            throw new ArgumentException("Схема прав не найдена в этой команде");
        var row = await _db.BoardIssueLayouts.FirstOrDefaultAsync(a => a.BoardId == boardId, ct);
        if (row == null) _db.BoardIssueLayouts.Add(row = new BoardIssueLayout { BoardId = boardId });
        row.PermissionSchemeId = schemeId;
        await _db.SaveChangesAsync(ct);
        _scopes.Clear();
        return new { boardId, permissionSchemeId = schemeId };
    }

    /// <summary>The scheme a space uses and what the caller holds there.</summary>
    public async Task<object> BoardAsync(Guid boardId, Guid userId, CancellationToken ct)
    {
        var scope = await ScopeAsync(boardId, userId, ct);
        if (scope == null || scope.Role == null || !scope.Has(JiraPermissions.Browse)) throw new KeyNotFoundException("Board not found");
        var schemeId = await _db.BoardIssueLayouts.AsNoTracking().Where(a => a.BoardId == boardId).Select(a => a.PermissionSchemeId).FirstOrDefaultAsync(ct);
        var name = schemeId is Guid id ? await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.Id == id).Select(o => o.Name).FirstOrDefaultAsync(ct) : null;
        return new
        {
            boardId,
            permissionSchemeId = schemeId,
            schemeName = name,
            canManage = await TeamAdminAsync(scope.TeamId, userId, ct),
            granted = JiraPermissions.All.Where(p => scope.Has(p.Key)).Select(p => p.Key),
            issueGrants = JiraPermissions.All.Where(p => p.IssueScoped && !scope.Has(p.Key)
                    && scope.Scheme.Grants.GetValueOrDefault(p.Key)?.Any(g => g.Type is "reporter" or "assignee") == true)
                .ToDictionary(p => p.Key, p => scope.Scheme.Grants[p.Key].Where(g => g.Type is "reporter" or "assignee").Select(g => g.Type).ToList()),
        };
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
        PermissionSchemeData? data = null;
        if (request.Data is JsonElement json && json.ValueKind == JsonValueKind.Object)
        {
            try { data = json.Deserialize<PermissionSchemeData>(Json) ?? new(); }
            catch (JsonException) { throw new ArgumentException("Неверный формат схемы прав"); }
        }
        else if (isNew) data = Default();
        if (data != null)
        {
            var groups = (await _db.UserGroups.Where(g => g.TeamId == item.TeamId).Select(g => g.Id).ToListAsync(ct)).ToHashSet();
            var users = (await TeamUsersAsync(item.TeamId, ct)).Select(u => u.Id).ToHashSet();
            item.DataJson = Normalize(data, groups, users);
        }
    }

    private async Task<List<(Guid Id, string? DisplayName, string? Email)>> TeamUsersAsync(Guid teamId, CancellationToken ct)
    {
        var ownerId = await _db.Teams.Where(t => t.Id == teamId).Select(t => t.OwnerId).FirstOrDefaultAsync(ct);
        var ids = await _db.TeamMembers.Where(m => m.TeamId == teamId).Select(m => m.UserId).ToListAsync(ct);
        if (ownerId is Guid owner) ids.Add(owner);
        var users = await _db.Users.AsNoTracking().Where(u => ids.Contains(u.Id)).OrderBy(u => u.DisplayName)
            .Select(u => new { u.Id, u.DisplayName, u.Email }).ToListAsync(ct);
        return users.Select(u => (u.Id, (string?)u.DisplayName, (string?)u.Email)).ToList();
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
        var ownerId = await _db.Teams.Where(t => t.Id == teamId).Select(t => (Guid?)t.OwnerId).FirstOrDefaultAsync(ct);
        var role = await _db.TeamMembers.Where(m => m.TeamId == teamId && m.UserId == userId).Select(m => (TeamRole?)m.Role).FirstOrDefaultAsync(ct);
        if (ownerId == null && role == null && !await _db.Teams.AnyAsync(t => t.Id == teamId, ct)) throw new KeyNotFoundException("Team not found");
        if (ownerId != userId && role == null) throw new UnauthorizedAccessException("Нет доступа к команде");
        return ownerId == userId || role == TeamRole.Admin;
    }

    private async Task EnsureTeamAdminAsync(Guid teamId, Guid userId, CancellationToken ct)
    {
        if (!await TeamAdminAsync(teamId, userId, ct))
            throw new UnauthorizedAccessException("Настраивать схемы прав может только владелец или администратор команды");
    }
}
