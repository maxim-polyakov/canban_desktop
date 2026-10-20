using System.Text.Json;
using System.Text.Json.Serialization;
using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public record IssueLayoutRequest(Guid TeamId, string? Name, string? Description, JsonElement? Data);
public record BoardIssueLayoutRequest(Guid? FieldConfigurationSchemeId, Guid? IssueTypeScreenSchemeId);

public sealed class ScreenTab
{
    public string Name { get; set; } = "";
    public List<string> Fields { get; set; } = new();
}

public sealed class ScreenData
{
    public List<ScreenTab> Tabs { get; set; } = new();
}

public sealed class ScreenSchemeData
{
    public Guid? Default { get; set; }
    public Guid? Create { get; set; }
    public Guid? Edit { get; set; }
    public Guid? View { get; set; }
}

/// <summary>Issue type → object mapping used by issue type screen schemes and field configuration schemes.</summary>
public sealed class TypeMappingData
{
    public Guid? Default { get; set; }
    public Dictionary<string, Guid> Types { get; set; } = new();
}

public sealed class FieldRule
{
    public bool Required { get; set; }
    public bool Hidden { get; set; }
    public string? Description { get; set; }
}

public sealed class FieldConfigData
{
    public Dictionary<string, FieldRule> Items { get; set; } = new();
}

public sealed class OperationScreens
{
    public List<ScreenTab> Create { get; set; } = new();
    public List<ScreenTab> Edit { get; set; } = new();
    public List<ScreenTab> View { get; set; } = new();
}

/// <summary>Field rules and screens a space uses, keyed by issue type token or "default".</summary>
public sealed class BoardLayout
{
    public const string DefaultKey = "default";
    public Dictionary<string, Dictionary<string, FieldRule>> FieldConfigs { get; set; } = new();
    public Dictionary<string, OperationScreens> Screens { get; set; } = new();

    public FieldRule Rule(string token, string key)
    {
        var items = FieldConfigs.TryGetValue(token, out var own) ? own : FieldConfigs.GetValueOrDefault(DefaultKey);
        return items != null && items.TryGetValue(key, out var rule) ? rule : new FieldRule();
    }

    /// <summary>Tabs of the screen for an operation; null when the space uses no screens (every field is shown).</summary>
    public List<ScreenTab>? Tabs(string token, string operation)
    {
        var screens = Screens.TryGetValue(token, out var own) ? own : Screens.GetValueOrDefault(DefaultKey);
        if (screens == null) return null;
        return operation switch { "create" => screens.Create, "edit" => screens.Edit, _ => screens.View };
    }

    public bool OnScreen(string token, string operation, string key) =>
        Tabs(token, operation) is not { } tabs || tabs.Any(t => t.Fields.Contains(key, StringComparer.OrdinalIgnoreCase));
}

public class IssueLayoutService
{
    public const string Screen = "screen";
    public const string ScreenScheme = "screenscheme";
    public const string TypeScreenScheme = "typescreenscheme";
    public const string FieldConfig = "fieldconfig";
    public const string FieldConfigScheme = "fieldconfigscheme";
    public static readonly string[] Kinds = { Screen, ScreenScheme, TypeScreenScheme, FieldConfig, FieldConfigScheme };
    /// <summary>Built-in fields that screens and field configurations can arrange; custom fields are "cf:{id}".</summary>
    public static readonly string[] SystemFields =
    {
        "summary", "description", "assignee", "priority", "duedate", "labels", "components", "fixversions", "storypoints", "originalestimate", "sprint",
    };
    private const int MaxObjectsPerKind = 200;
    private const int MaxTabs = 20;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    private readonly CanbanDbContext _db;
    private readonly IProjectAccessService _access;
    private readonly CacheService _cache;
    private readonly IBoardHub _boardHub;

    public IssueLayoutService(CanbanDbContext db, IProjectAccessService access, CacheService cache, IBoardHub boardHub)
    {
        _db = db;
        _access = access;
        _cache = cache;
        _boardHub = boardHub;
    }

    public static string FieldKey(Guid fieldId) => "cf:" + fieldId;

    public static string TypeToken(IssueType baseType, Guid? typeId) => typeId?.ToString() ?? ((int)baseType).ToString();

    public async Task<object> CatalogAsync(Guid userId, Guid teamId, CancellationToken ct)
    {
        var canManage = await TeamAccessAsync(teamId, userId, ct);
        var objects = await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.TeamId == teamId).OrderBy(o => o.Name).ToListAsync(ct);
        var all = objects;
        objects = objects.Where(o => Kinds.Contains(o.Kind)).ToList();
        var boards = await _db.Boards.AsNoTracking().Where(b => b.TeamId == teamId).OrderBy(b => b.Name)
            .Select(b => new { b.Id, b.Name, b.KeyPrefix }).ToListAsync(ct);
        var boardIds = boards.Select(b => b.Id).ToList();
        var assignments = await _db.BoardIssueLayouts.AsNoTracking().Where(a => boardIds.Contains(a.BoardId)).ToDictionaryAsync(a => a.BoardId, ct);
        return new
        {
            teamId,
            canManage,
            systemFields = SystemFields,
            objects = objects.Select(o => Dto(o, UsedBy(o, all, assignments.Values))),
            boards = boards.Select(b => new
            {
                id = b.Id,
                name = b.Name,
                key = b.KeyPrefix,
                fieldConfigurationSchemeId = assignments.GetValueOrDefault(b.Id)?.FieldConfigurationSchemeId,
                issueTypeScreenSchemeId = assignments.GetValueOrDefault(b.Id)?.IssueTypeScreenSchemeId,
            }),
        };
    }

    public async Task<object> CreateAsync(Guid userId, string kind, IssueLayoutRequest request, CancellationToken ct)
    {
        EnsureKind(kind);
        await EnsureAdminAsync(request.TeamId, userId, ct);
        if (await _db.IssueLayoutObjects.CountAsync(o => o.TeamId == request.TeamId && o.Kind == kind, ct) >= MaxObjectsPerKind)
            throw new InvalidOperationException("Достигнут предел объектов этого вида в команде");
        var now = DateTime.UtcNow;
        var item = new IssueLayoutObject { Id = Guid.NewGuid(), TeamId = request.TeamId, Kind = kind, CreatedAt = now, UpdatedAt = now };
        await ApplyAsync(item, request, isNew: true, ct);
        _db.IssueLayoutObjects.Add(item);
        await _db.SaveChangesAsync(ct);
        return Dto(item, Array.Empty<object>());
    }

    public async Task<object> UpdateAsync(Guid id, Guid userId, IssueLayoutRequest request, CancellationToken ct)
    {
        var item = await FindAsync(id, ct);
        await EnsureAdminAsync(item.TeamId, userId, ct);
        await ApplyAsync(item, request with { TeamId = item.TeamId }, isNew: false, ct);
        item.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await InvalidateTeamAsync(item.TeamId, ct);
        return Dto(item, Array.Empty<object>());
    }

    public async Task DeleteAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var item = await FindAsync(id, ct);
        await EnsureAdminAsync(item.TeamId, userId, ct);
        var objects = await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.TeamId == item.TeamId).ToListAsync(ct);
        var assignments = await _db.BoardIssueLayouts.AsNoTracking()
            .Where(a => a.FieldConfigurationSchemeId == id || a.IssueTypeScreenSchemeId == id).ToListAsync(ct);
        if (UsedBy(item, objects, assignments).Count > 0)
            throw new InvalidOperationException("Объект используется — сначала уберите его из схем и пространств");
        _db.IssueLayoutObjects.Remove(item);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<object> AssignAsync(Guid boardId, Guid userId, BoardIssueLayoutRequest request, CancellationToken ct)
    {
        await _access.EnsureBoardPermissionAsync(boardId, userId, BoardPermission.Admin, ct);
        var teamId = await _db.Boards.Where(b => b.Id == boardId).Select(b => b.TeamId).FirstAsync(ct);
        await RequireAsync(teamId, FieldConfigScheme, request.FieldConfigurationSchemeId, ct);
        await RequireAsync(teamId, TypeScreenScheme, request.IssueTypeScreenSchemeId, ct);
        var row = await _db.BoardIssueLayouts.FirstOrDefaultAsync(a => a.BoardId == boardId, ct);
        if (row == null) _db.BoardIssueLayouts.Add(row = new BoardIssueLayout { BoardId = boardId });
        row.FieldConfigurationSchemeId = request.FieldConfigurationSchemeId;
        row.IssueTypeScreenSchemeId = request.IssueTypeScreenSchemeId;
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + boardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(boardId, ct);
        return new { boardId, row.FieldConfigurationSchemeId, row.IssueTypeScreenSchemeId };
    }

    public async Task<BoardLayout> ResolveAsync(Guid boardId, CancellationToken ct)
    {
        var layout = new BoardLayout();
        var row = await _db.BoardIssueLayouts.AsNoTracking().FirstOrDefaultAsync(a => a.BoardId == boardId, ct);
        if (row == null || (row.FieldConfigurationSchemeId == null && row.IssueTypeScreenSchemeId == null)) return layout;
        var teamId = await _db.Boards.Where(b => b.Id == boardId).Select(b => b.TeamId).FirstAsync(ct);
        var objects = await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.TeamId == teamId).ToDictionaryAsync(o => o.Id, ct);
        T? Data<T>(Guid? id, string kind) where T : class =>
            id is Guid key && objects.TryGetValue(key, out var o) && o.Kind == kind ? Parse<T>(o.DataJson) : null;

        if (Data<TypeMappingData>(row.FieldConfigurationSchemeId, FieldConfigScheme) is { } configScheme)
        {
            foreach (var (token, configId) in Mappings(configScheme))
            {
                if (Data<FieldConfigData>(configId, FieldConfig) is { } config) layout.FieldConfigs[token] = config.Items;
            }
        }
        if (Data<TypeMappingData>(row.IssueTypeScreenSchemeId, TypeScreenScheme) is { } typeScheme)
        {
            foreach (var (token, schemeId) in Mappings(typeScheme))
            {
                if (Data<ScreenSchemeData>(schemeId, ScreenScheme) is not { } scheme) continue;
                List<ScreenTab> Tabs(Guid? screenId) => Data<ScreenData>(screenId ?? scheme.Default, Screen)?.Tabs ?? new();
                layout.Screens[token] = new OperationScreens { Create = Tabs(scheme.Create), Edit = Tabs(scheme.Edit), View = Tabs(scheme.View) };
            }
        }
        return layout;
    }

    /// <summary>System fields the field configuration makes required but the new issue leaves empty.</summary>
    public static List<string> MissingRequiredSystemFields(BoardLayout layout, string token, Func<string, bool> present) =>
        SystemFields.Where(key => key != "summary" && layout.Rule(token, key).Required && !layout.Rule(token, key).Hidden && !present(key)).ToList();

    private static IEnumerable<(string Token, Guid Id)> Mappings(TypeMappingData data)
    {
        if (data.Default is Guid def) yield return (BoardLayout.DefaultKey, def);
        foreach (var (token, id) in data.Types) yield return (token, id);
    }

    private async Task ApplyAsync(IssueLayoutObject item, IssueLayoutRequest request, bool isNew, CancellationToken ct)
    {
        if (request.Name != null)
        {
            var name = request.Name.Trim();
            if (name.Length == 0) throw new ArgumentException("Введите название");
            if (name.Length > 100) throw new ArgumentException("Название — не больше 100 символов");
            var taken = await _db.IssueLayoutObjects.Where(o => o.TeamId == item.TeamId && o.Kind == item.Kind && o.Id != item.Id).Select(o => o.Name).ToListAsync(ct);
            if (taken.Contains(name, StringComparer.OrdinalIgnoreCase)) throw new ArgumentException($"«{name}» уже есть");
            item.Name = name;
        }
        else if (item.Name.Length == 0) throw new ArgumentException("Введите название");
        if (request.Description != null)
        {
            var description = request.Description.Trim();
            item.Description = description.Length == 0 ? null : description.Length > 500 ? description[..500] : description;
        }
        if (request.Data is JsonElement data && data.ValueKind == JsonValueKind.Object)
            item.DataJson = await ValidateAsync(item, data, ct);
        else if (isNew)
            item.DataJson = await ValidateAsync(item, JsonSerializer.SerializeToElement(new { }), ct);
    }

    private async Task<string> ValidateAsync(IssueLayoutObject item, JsonElement data, CancellationToken ct)
    {
        switch (item.Kind)
        {
            case Screen:
            {
                var screen = Read<ScreenData>(data);
                if (screen.Tabs.Count == 0) screen.Tabs.Add(new ScreenTab { Name = "Поля", Fields = { "summary" } });
                if (screen.Tabs.Count > MaxTabs) throw new ArgumentException($"Не больше {MaxTabs} вкладок на экране");
                var keys = await FieldKeysAsync(item.TeamId, ct);
                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var tab in screen.Tabs)
                {
                    tab.Name = (tab.Name ?? "").Trim();
                    if (tab.Name.Length == 0) throw new ArgumentException("Введите название вкладки");
                    if (tab.Name.Length > 60) throw new ArgumentException("Название вкладки — не больше 60 символов");
                    tab.Fields = (tab.Fields ?? new()).Select(f => (f ?? "").Trim().ToLowerInvariant()).Where(f => f.Length > 0).ToList();
                    foreach (var key in tab.Fields)
                    {
                        if (!keys.Contains(key)) throw new ArgumentException($"Неизвестное поле «{key}»");
                        if (!seen.Add(key)) throw new ArgumentException("Поле может быть на экране только один раз");
                    }
                }
                return JsonSerializer.Serialize(screen, Json);
            }
            case ScreenScheme:
            {
                var scheme = Read<ScreenSchemeData>(data);
                if (scheme.Default == null) throw new ArgumentException("Выберите экран по умолчанию");
                foreach (var id in new[] { scheme.Default, scheme.Create, scheme.Edit, scheme.View })
                    await RequireAsync(item.TeamId, Screen, id, ct);
                return JsonSerializer.Serialize(scheme, Json);
            }
            case TypeScreenScheme:
            case FieldConfigScheme:
            {
                var mapping = Read<TypeMappingData>(data);
                var target = item.Kind == TypeScreenScheme ? ScreenScheme : FieldConfig;
                if (item.Kind == TypeScreenScheme && mapping.Default == null) throw new ArgumentException("Выберите схему экранов по умолчанию");
                await RequireAsync(item.TeamId, target, mapping.Default, ct);
                await ValidateTokensAsync(item.TeamId, mapping.Types.Keys, ct);
                foreach (var id in mapping.Types.Values) await RequireAsync(item.TeamId, target, id, ct);
                return JsonSerializer.Serialize(mapping, Json);
            }
            case FieldConfig:
            {
                var config = Read<FieldConfigData>(data);
                var keys = await FieldKeysAsync(item.TeamId, ct);
                var items = new Dictionary<string, FieldRule>();
                foreach (var (rawKey, rule) in config.Items)
                {
                    var key = rawKey.Trim().ToLowerInvariant();
                    if (!keys.Contains(key)) throw new ArgumentException($"Неизвестное поле «{rawKey}»");
                    if (key == "summary" && rule.Hidden) throw new ArgumentException("Сводку нельзя скрыть");
                    if (rule.Hidden && rule.Required) throw new ArgumentException("Скрытое поле не может быть обязательным");
                    if (key == "sprint" && rule.Required) throw new ArgumentException("Спринт нельзя сделать обязательным: задачи создаются в бэклоге");
                    rule.Description = string.IsNullOrWhiteSpace(rule.Description) ? null : rule.Description.Trim()[..Math.Min(rule.Description.Trim().Length, 500)];
                    if (rule.Required || rule.Hidden || rule.Description != null) items[key] = rule;
                }
                config.Items = items;
                return JsonSerializer.Serialize(config, Json);
            }
            default:
                throw new ArgumentException("Неизвестный вид объекта");
        }
    }

    private async Task<HashSet<string>> FieldKeysAsync(Guid teamId, CancellationToken ct)
    {
        var custom = await _db.CustomFieldDefinitions.Where(f => f.TeamId == teamId).Select(f => f.Id).ToListAsync(ct);
        return SystemFields.Concat(custom.Select(FieldKey)).ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private async Task ValidateTokensAsync(Guid teamId, IEnumerable<string> tokens, CancellationToken ct)
    {
        var customIds = new List<Guid>();
        foreach (var token in tokens)
        {
            if (Guid.TryParse(token, out var id)) customIds.Add(id);
            else if (!int.TryParse(token, out var n) || !Enum.IsDefined(typeof(IssueType), n)) throw new ArgumentException("Неверный тип задачи");
        }
        if (customIds.Count > 0 && await _db.IssueTypeDefinitions.CountAsync(t => customIds.Contains(t.Id) && t.TeamId == teamId, ct) != customIds.Distinct().Count())
            throw new ArgumentException("Тип задачи не найден в этой команде");
    }

    private async Task RequireAsync(Guid teamId, string kind, Guid? id, CancellationToken ct)
    {
        if (id is not Guid value) return;
        if (!await _db.IssueLayoutObjects.AnyAsync(o => o.Id == value && o.TeamId == teamId && o.Kind == kind, ct))
            throw new ArgumentException(kind switch
            {
                Screen => "Экран не найден в этой команде",
                ScreenScheme => "Схема экранов не найдена в этой команде",
                TypeScreenScheme => "Схема экранов типов задач не найдена в этой команде",
                FieldConfig => "Конфигурация полей не найдена в этой команде",
                _ => "Схема конфигураций полей не найдена в этой команде",
            });
    }

    /// <summary>Names of schemes and spaces that refer to the object.</summary>
    private static List<object> UsedBy(IssueLayoutObject item, IEnumerable<IssueLayoutObject> objects, IEnumerable<BoardIssueLayout> assignments)
    {
        var result = new List<object>();
        foreach (var other in objects.Where(o => o.Id != item.Id))
        {
            var refs = other.Kind switch
            {
                ScreenScheme when item.Kind == Screen => Parse<ScreenSchemeData>(other.DataJson) is { } s
                    && new[] { s.Default, s.Create, s.Edit, s.View }.Contains(item.Id),
                TypeScreenScheme when item.Kind == ScreenScheme => Parse<TypeMappingData>(other.DataJson) is { } m
                    && (m.Default == item.Id || m.Types.ContainsValue(item.Id)),
                FieldConfigScheme when item.Kind == FieldConfig => Parse<TypeMappingData>(other.DataJson) is { } m
                    && (m.Default == item.Id || m.Types.ContainsValue(item.Id)),
                WorkflowSchemeService.Workflow when item.Kind == Screen => WorkflowSchemeService.UsesScreen(other, item.Id),
                _ => false,
            };
            if (refs) result.Add(new { kind = other.Kind, id = other.Id, name = other.Name });
        }
        foreach (var a in assignments.Where(a => a.FieldConfigurationSchemeId == item.Id || a.IssueTypeScreenSchemeId == item.Id))
            result.Add(new { kind = "board", id = a.BoardId, name = (string?)null });
        return result;
    }

    private static T Read<T>(JsonElement data) where T : new()
    {
        try { return data.Deserialize<T>(Json) ?? new T(); }
        catch (JsonException) { throw new ArgumentException("Неверный формат настроек"); }
    }

    private static T? Parse<T>(string json) where T : class
    {
        try { return JsonSerializer.Deserialize<T>(json, Json); }
        catch (JsonException) { return null; }
    }

    private static object Dto(IssueLayoutObject o, IReadOnlyCollection<object> usedBy) => new
    {
        id = o.Id,
        teamId = o.TeamId,
        kind = o.Kind,
        name = o.Name,
        description = o.Description,
        data = JsonSerializer.Deserialize<JsonElement>(o.DataJson),
        usedBy,
        updatedAt = o.UpdatedAt,
    };

    private static void EnsureKind(string kind)
    {
        if (!Kinds.Contains(kind)) throw new ArgumentException("Неизвестный вид объекта");
    }

    private async Task<IssueLayoutObject> FindAsync(Guid id, CancellationToken ct) =>
        await _db.IssueLayoutObjects.FirstOrDefaultAsync(o => o.Id == id && Kinds.Contains(o.Kind), ct) ?? throw new KeyNotFoundException("Not found");

    private async Task<bool> TeamAccessAsync(Guid teamId, Guid userId, CancellationToken ct)
    {
        var (status, permission) = await _access.GetTeamAccessAsync(teamId, userId, ct);
        if (status == ProjectAccessStatus.NotFound) throw new KeyNotFoundException("Team not found");
        if (status != ProjectAccessStatus.Success) throw new UnauthorizedAccessException("Нет доступа к команде");
        return permission == BoardPermission.Admin;
    }

    private async Task EnsureAdminAsync(Guid teamId, Guid userId, CancellationToken ct)
    {
        if (!await TeamAccessAsync(teamId, userId, ct))
            throw new UnauthorizedAccessException("Настраивать экраны и поля может только владелец или администратор команды");
    }

    private async Task InvalidateTeamAsync(Guid teamId, CancellationToken ct)
    {
        var boardIds = await _db.Boards.Where(b => b.TeamId == teamId).Select(b => b.Id).ToListAsync(ct);
        foreach (var boardId in boardIds)
        {
            await _cache.InvalidateAsync("board:detail:" + boardId, ct);
            await _boardHub.NotifyBoardUpdatedAsync(boardId, ct);
        }
    }
}
