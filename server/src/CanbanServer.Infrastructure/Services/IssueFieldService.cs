using System.Globalization;
using System.Text.Json;
using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public record IssueTypeRequest(Guid TeamId, string? Name, string? Description, IssueType? BaseType, string? Icon, string? Color);
public record CustomFieldRequest(
    Guid TeamId, string? Name, string? Description, string? FieldType, List<string>? Options,
    List<Guid>? Boards, List<string>? IssueTypes, bool? Required, int? Order,
    Dictionary<string, List<string>>? Children = null, JsonElement? DefaultValue = null, List<FieldContextRequest>? Contexts = null);
public record SetCustomFieldRequest(JsonElement? Value);

public partial class IssueFieldService
{
    public static readonly string[] FieldTypes =
    {
        "text", "paragraph", "number", "date", "select", "multiselect", "cascading", "checkbox", "url", "user", "labels",
        "version", "versions", "group", "groups",
    };
    private const int MaxTypesPerTeam = 100;
    private const int MaxFieldsPerTeam = 200;

    private readonly CanbanDbContext _db;
    private readonly IProjectAccessService _access;
    private readonly IJiraPlatformService _jira;
    private readonly IBoardHub _boardHub;
    private readonly CacheService _cache;
    private readonly IssueLayoutService _layouts;
    private readonly WorkflowSchemeService _workflows;

    public IssueFieldService(
        CanbanDbContext db, IProjectAccessService access, IJiraPlatformService jira, IBoardHub boardHub, CacheService cache, IssueLayoutService layouts,
        WorkflowSchemeService workflows)
    {
        _layouts = layouts;
        _workflows = workflows;
        _db = db;
        _access = access;
        _jira = jira;
        _boardHub = boardHub;
        _cache = cache;
    }

    public async Task<object> CatalogAsync(Guid userId, CancellationToken ct)
    {
        var teams = await _db.Teams.AsNoTracking()
            .Where(t => t.OwnerId == userId || t.Members.Any(m => m.UserId == userId))
            .Select(t => new
            {
                t.Id,
                t.Name,
                isOwner = t.OwnerId == userId,
                role = t.Members.Where(m => m.UserId == userId).Select(m => (TeamRole?)m.Role).FirstOrDefault(),
            })
            .OrderBy(t => t.Name)
            .ToListAsync(ct);
        var teamIds = teams.Select(t => t.Id).ToList();
        var types = await _db.IssueTypeDefinitions.AsNoTracking().Where(x => teamIds.Contains(x.TeamId)).OrderBy(x => x.Name).ToListAsync(ct);
        var fields = await _db.CustomFieldDefinitions.AsNoTracking().Where(x => teamIds.Contains(x.TeamId)).OrderBy(x => x.Order).ThenBy(x => x.Name).ToListAsync(ct);
        var typeCounts = await _db.Quests.AsNoTracking().Where(q => q.IssueTypeId != null && teamIds.Contains(q.Board.TeamId))
            .GroupBy(q => q.IssueTypeId!.Value).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        var boards = await _db.Boards.AsNoTracking().Where(b => teamIds.Contains(b.TeamId))
            .OrderBy(b => b.Name).Select(b => new { id = b.Id, teamId = b.TeamId, name = b.Name, key = b.KeyPrefix }).ToListAsync(ct);
        var groups = await _db.UserGroups.AsNoTracking().Where(g => teamIds.Contains(g.TeamId))
            .OrderBy(g => g.Name).Select(g => new { id = g.Id, teamId = g.TeamId, name = g.Name }).ToListAsync(ct);
        return new
        {
            teams = teams.Select(t => new
            {
                id = t.Id,
                name = t.Name,
                canManage = t.isOwner || t.role == TeamRole.Admin,
            }),
            boards,
            groups,
            types = types.Select(x => TypeDto(x, typeCounts.TryGetValue(x.Id, out var n) ? n : 0)),
            fields = fields.Select(FieldDto),
        };
    }

    public async Task<object> ForBoardAsync(Guid boardId, Guid userId, CancellationToken ct)
    {
        await _access.EnsureBoardPermissionAsync(boardId, userId, BoardPermission.View, ct);
        var teamId = await _db.Boards.Where(b => b.Id == boardId).Select(b => b.TeamId).FirstAsync(ct);
        var types = await _db.IssueTypeDefinitions.AsNoTracking().Where(x => x.TeamId == teamId).OrderBy(x => x.Name).ToListAsync(ct);
        var fields = await _db.CustomFieldDefinitions.AsNoTracking().Where(x => x.TeamId == teamId).OrderBy(x => x.Order).ThenBy(x => x.Name).ToListAsync(ct);
        var versions = await _db.BoardReleases.AsNoTracking().Where(r => r.BoardId == boardId)
            .OrderBy(r => r.ReleaseDate ?? DateTime.MaxValue).ThenBy(r => r.Name)
            .Select(r => new { id = r.Id, name = r.Name, status = r.Status }).ToListAsync(ct);
        var groups = await _db.UserGroups.AsNoTracking().Where(g => g.TeamId == teamId).OrderBy(g => g.Name)
            .Select(g => new { id = g.Id, name = g.Name }).ToListAsync(ct);
        return new
        {
            types = types.Select(x => TypeDto(x, null)),
            fields = fields.Select(f => (field: f, context: ResolveContext(f, boardId)))
                .Where(x => x.context != null).Select(x => BoardFieldDto(x.field, x.context!)),
            versions,
            groups,
            layout = await _layouts.ResolveAsync(boardId, ct),
            workflow = await _workflows.BoardConfigAsync(boardId, ct),
        };
    }

    public async Task<object> CreateTypeAsync(Guid userId, IssueTypeRequest request, CancellationToken ct)
    {
        await EnsureTeamAdminAsync(request.TeamId, userId, ct);
        if (await _db.IssueTypeDefinitions.CountAsync(x => x.TeamId == request.TeamId, ct) >= MaxTypesPerTeam)
            throw new InvalidOperationException("Достигнут предел типов задач в команде");
        var type = new IssueTypeDefinition { Id = Guid.NewGuid(), TeamId = request.TeamId, CreatedAt = DateTime.UtcNow };
        await ApplyTypeAsync(type, request, ct);
        _db.IssueTypeDefinitions.Add(type);
        await _db.SaveChangesAsync(ct);
        return TypeDto(type, 0);
    }

    public async Task<object> UpdateTypeAsync(Guid id, Guid userId, IssueTypeRequest request, CancellationToken ct)
    {
        var type = await _db.IssueTypeDefinitions.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new KeyNotFoundException("Issue type not found");
        await EnsureTeamAdminAsync(type.TeamId, userId, ct);
        var previousBase = type.BaseType;
        await ApplyTypeAsync(type, request with { TeamId = type.TeamId }, ct);
        await _db.SaveChangesAsync(ct);
        if (type.BaseType != previousBase)
        {
            var isEpic = type.BaseType == IssueType.Epic;
            await _db.Quests.Where(q => q.IssueTypeId == id)
                .ExecuteUpdateAsync(s => s.SetProperty(q => q.IssueType, type.BaseType).SetProperty(q => q.IsEpic, isEpic), ct);
        }
        await InvalidateTeamBoardsAsync(type.TeamId, ct);
        return TypeDto(type, await _db.Quests.CountAsync(q => q.IssueTypeId == id, ct));
    }

    public async Task DeleteTypeAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var type = await _db.IssueTypeDefinitions.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new KeyNotFoundException("Issue type not found");
        await EnsureTeamAdminAsync(type.TeamId, userId, ct);
        await _db.Quests.Where(q => q.IssueTypeId == id).ExecuteUpdateAsync(s => s.SetProperty(q => q.IssueTypeId, (Guid?)null), ct);
        _db.IssueTypeDefinitions.Remove(type);
        await _db.SaveChangesAsync(ct);
        await InvalidateTeamBoardsAsync(type.TeamId, ct);
    }

    public async Task<object> CreateFieldAsync(Guid userId, CustomFieldRequest request, CancellationToken ct)
    {
        await EnsureTeamAdminAsync(request.TeamId, userId, ct);
        if (await _db.CustomFieldDefinitions.CountAsync(x => x.TeamId == request.TeamId, ct) >= MaxFieldsPerTeam)
            throw new InvalidOperationException("Достигнут предел полей в команде");
        var field = new CustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TeamId = request.TeamId,
            CreatedAt = DateTime.UtcNow,
            Order = (await _db.CustomFieldDefinitions.Where(x => x.TeamId == request.TeamId).MaxAsync(x => (int?)x.Order, ct) ?? -1) + 1,
        };
        await ApplyFieldAsync(field, request, isNew: true, ct);
        _db.CustomFieldDefinitions.Add(field);
        await _db.SaveChangesAsync(ct);
        return FieldDto(field);
    }

    public async Task<object> UpdateFieldAsync(Guid id, Guid userId, CustomFieldRequest request, CancellationToken ct)
    {
        var field = await _db.CustomFieldDefinitions.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new KeyNotFoundException("Field not found");
        await EnsureTeamAdminAsync(field.TeamId, userId, ct);
        await ApplyFieldAsync(field, request with { TeamId = field.TeamId }, isNew: false, ct);
        await _db.SaveChangesAsync(ct);
        await InvalidateTeamBoardsAsync(field.TeamId, ct);
        return FieldDto(field);
    }

    public async Task DeleteFieldAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var field = await _db.CustomFieldDefinitions.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new KeyNotFoundException("Field not found");
        await EnsureTeamAdminAsync(field.TeamId, userId, ct);
        _db.CustomFieldDefinitions.Remove(field);
        await _db.SaveChangesAsync(ct);
        var key = id.ToString();
        await _db.Database.ExecuteSqlInterpolatedAsync(
            $"""
            UPDATE "Quests" q SET "CustomFieldsJson" = (q."CustomFieldsJson"::jsonb - {key})::text
            FROM "Boards" b WHERE b."Id" = q."BoardId" AND b."TeamId" = {field.TeamId} AND q."CustomFieldsJson"::jsonb ? {key}
            """, ct);
        await InvalidateTeamBoardsAsync(field.TeamId, ct);
    }

    public async Task<Dictionary<string, JsonElement>> SetValueAsync(Guid questId, Guid fieldId, JsonElement? value, Guid userId, CancellationToken ct)
    {
        await _access.EnsureQuestPermissionAsync(questId, userId, BoardPermission.Work, ct);
        var quest = await _db.Quests.Include(q => q.Board).FirstAsync(q => q.Id == questId, ct);
        var field = await _db.CustomFieldDefinitions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == fieldId && x.TeamId == quest.Board.TeamId, ct)
            ?? throw new KeyNotFoundException("Field not found");
        var context = ResolveContext(field, quest.BoardId);
        if (context == null || !AppliesToType(context, quest.IssueType, quest.IssueTypeId))
            throw new ArgumentException("Поле не используется в задачах этого типа");
        var layout = await _layouts.ResolveAsync(quest.BoardId, ct);
        var token = IssueLayoutService.TypeToken(quest.IssueType, quest.IssueTypeId);
        var fieldKey = IssueLayoutService.FieldKey(field.Id);
        var rule = layout.Rule(token, fieldKey);
        if (rule.Hidden) throw new ArgumentException($"Поле «{field.Name}» скрыто в конфигурации полей");
        if (!layout.OnScreen(token, "edit", fieldKey)) throw new ArgumentException($"Поля «{field.Name}» нет на экране редактирования");
        var normalized = Normalize(field, value, context);
        if (normalized is JsonElement user && field.FieldType == "user")
            await EnsureTeamUserAsync(quest.Board.TeamId, Guid.Parse(user.GetString()!), ct);
        if (normalized is JsonElement reference) await EnsureReferencesAsync(field, quest.Board.TeamId, quest.BoardId, reference, ct);
        if (normalized == null && (field.Required || rule.Required)) throw new ArgumentException($"Поле «{field.Name}» обязательно");
        var values = ReadValues(quest.CustomFieldsJson);
        var key = fieldId.ToString();
        var old = values.TryGetValue(key, out var previous) ? Display(previous) : null;
        if (normalized is JsonElement element) values[key] = element;
        else values.Remove(key);
        quest.CustomFieldsJson = JsonSerializer.Serialize(values);
        var updated = normalized is JsonElement e ? Display(e) : null;
        if (old != updated)
        {
            await _jira.AddChangeAsync(questId, userId, "updated", "customfield:" + field.Name, old, updated, ct);
            await _jira.EnqueueAsync("IssueUpdated", new { questId, boardId = quest.BoardId, userId }, ct);
        }
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + quest.BoardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(quest.BoardId, ct);
        return values;
    }

    /// <summary>Sets a custom field value from a transition screen on a tracked issue; the caller saves.</summary>
    public async Task ApplyTransitionValueAsync(Quest quest, Guid teamId, Guid fieldId, JsonElement value, Guid userId, CancellationToken ct)
    {
        var field = await _db.CustomFieldDefinitions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == fieldId && x.TeamId == teamId, ct)
            ?? throw new KeyNotFoundException("Field not found");
        var context = ResolveContext(field, quest.BoardId);
        if (context == null || !AppliesToType(context, quest.IssueType, quest.IssueTypeId))
            throw new ArgumentException("Поле не используется в задачах этого типа");
        var layout = await _layouts.ResolveAsync(quest.BoardId, ct);
        var rule = layout.Rule(IssueLayoutService.TypeToken(quest.IssueType, quest.IssueTypeId), IssueLayoutService.FieldKey(field.Id));
        if (rule.Hidden) throw new ArgumentException($"Поле «{field.Name}» скрыто в конфигурации полей");
        var normalized = Normalize(field, value, context);
        if (normalized is JsonElement user && field.FieldType == "user")
            await EnsureTeamUserAsync(teamId, Guid.Parse(user.GetString()!), ct);
        if (normalized is JsonElement reference) await EnsureReferencesAsync(field, teamId, quest.BoardId, reference, ct);
        if (normalized == null && (field.Required || rule.Required)) throw new ArgumentException($"Поле «{field.Name}» обязательно");
        var values = ReadValues(quest.CustomFieldsJson);
        var key = fieldId.ToString();
        var old = values.TryGetValue(key, out var previous) ? Display(previous) : null;
        if (normalized is JsonElement element) values[key] = element;
        else values.Remove(key);
        quest.CustomFieldsJson = JsonSerializer.Serialize(values);
        var updated = normalized is JsonElement e ? Display(e) : null;
        if (old != updated) await _jira.AddChangeAsync(quest.Id, userId, "updated", "customfield:" + field.Name, old, updated, ct);
    }

    /// <summary>Resolves a custom type and validates initial field values for a new issue on the board.</summary>
    public async Task<(Guid? TypeId, IssueType BaseType, string Json)> PrepareNewIssueAsync(
        Guid teamId, Guid boardId, Guid? typeId, IssueType baseType, Dictionary<string, JsonElement>? values, CancellationToken ct)
    {
        if (typeId.HasValue) baseType = (await RequireTypeAsync(teamId, typeId.Value, ct)).BaseType;
        // Quick create sends no field values: defaults still apply, required fields are filled in later.
        var checkRequired = values != null;
        values ??= new();
        var fields = await _db.CustomFieldDefinitions.AsNoTracking().Where(x => x.TeamId == teamId).ToListAsync(ct);
        var layout = await _layouts.ResolveAsync(boardId, ct);
        var token = IssueLayoutService.TypeToken(baseType, typeId);
        var result = new Dictionary<string, JsonElement>();
        foreach (var field in fields)
        {
            var context = ResolveContext(field, boardId);
            if (context == null || !AppliesToType(context, baseType, typeId)) continue;
            var fieldKey = IssueLayoutService.FieldKey(field.Id);
            var rule = layout.Rule(token, fieldKey);
            var fromDefault = !values.TryGetValue(field.Id.ToString(), out var raw);
            if (rule.Hidden)
            {
                if (!fromDefault && raw.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined))
                    throw new ArgumentException($"Поле «{field.Name}» скрыто в конфигурации полей");
                continue;
            }
            if (!fromDefault && raw.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined) && !layout.OnScreen(token, "create", fieldKey))
                throw new ArgumentException($"Поля «{field.Name}» нет на экране создания");
            var normalized = fromDefault ? context.DefaultValue : Normalize(field, raw, context);
            if (normalized is JsonElement user && field.FieldType == "user")
                await EnsureTeamUserAsync(teamId, Guid.Parse(user.GetString()!), ct);
            if (normalized is JsonElement reference)
            {
                try { await EnsureReferencesAsync(field, teamId, boardId, reference, ct); }
                catch (ArgumentException) when (fromDefault) { normalized = null; }
            }
            if (normalized is JsonElement element) result[field.Id.ToString()] = element;
            else if ((field.Required || rule.Required) && checkRequired) throw new ArgumentException($"Поле «{field.Name}» обязательно");
        }
        return (typeId, baseType, JsonSerializer.Serialize(result));
    }

    /// <summary>Rejects a new issue that leaves out system fields the space's field configuration requires.</summary>
    public async Task EnsureRequiredSystemFieldsAsync(Guid boardId, IssueType baseType, Guid? typeId, Func<string, bool> present, CancellationToken ct)
    {
        var layout = await _layouts.ResolveAsync(boardId, ct);
        var missing = IssueLayoutService.MissingRequiredSystemFields(layout, IssueLayoutService.TypeToken(baseType, typeId), present);
        if (missing.Count > 0) throw new ArgumentException($"Заполните обязательные поля: {string.Join(", ", missing.Select(SystemFieldName))}");
    }

    public static string SystemFieldName(string key) => key switch
    {
        "summary" => "Сводка",
        "description" => "Описание",
        "assignee" => "Исполнитель",
        "priority" => "Приоритет",
        "duedate" => "Срок",
        "labels" => "Метки",
        "components" => "Компоненты",
        "fixversions" => "Исправить в версиях",
        "storypoints" => "Story points",
        "originalestimate" => "Первоначальная оценка",
        "sprint" => "Спринт",
        _ => key,
    };

    public async Task<IssueTypeDefinition> RequireTypeAsync(Guid teamId, Guid typeId, CancellationToken ct) =>
        await _db.IssueTypeDefinitions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == typeId && x.TeamId == teamId, ct)
            ?? throw new ArgumentException("Тип задачи не найден в этой команде");

    public static Dictionary<string, JsonElement> ReadValues(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json) ?? new(); }
        catch (JsonException) { return new(); }
    }

    /// <summary>Validates a raw value against the field type and context options; null clears the field.</summary>
    public static JsonElement? Normalize(CustomFieldDefinition field, JsonElement? raw, FieldContext? context = null)
    {
        if (raw is not JsonElement value || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) return null;
        context ??= DefaultContext(field);
        switch (field.FieldType)
        {
            case "text":
            case "paragraph":
            {
                var text = Text(value, field.Name).Trim();
                if (text.Length == 0) return null;
                var max = field.FieldType == "text" ? 255 : 10000;
                if (text.Length > max) throw new ArgumentException($"Поле «{field.Name}»: не больше {max} символов");
                return Json(text);
            }
            case "number":
            {
                decimal number;
                if (value.ValueKind == JsonValueKind.Number) number = value.GetDecimal();
                else
                {
                    var text = Text(value, field.Name).Trim().Replace(',', '.');
                    if (text.Length == 0) return null;
                    if (!decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out number))
                        throw new ArgumentException($"Поле «{field.Name}»: введите число");
                }
                return Json(number);
            }
            case "date":
            {
                var text = Text(value, field.Name).Trim();
                if (text.Length == 0) return null;
                if (!DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var date))
                    throw new ArgumentException($"Поле «{field.Name}»: неверная дата");
                return Json(date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
            }
            case "select":
            {
                var text = Text(value, field.Name).Trim();
                if (text.Length == 0) return null;
                return Json(MatchOption(field, context.Options, text));
            }
            case "multiselect":
            {
                var items = Strings(value, field.Name).Select(x => MatchOption(field, context.Options, x)).Distinct().ToList();
                return items.Count == 0 ? null : Json(items);
            }
            case "cascading":
            {
                if (value.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(value.GetString())) return null;
                if (value.ValueKind == JsonValueKind.Array && value.GetArrayLength() == 0) return null;
                return NormalizeCascade(field, context, value);
            }
            case "version":
            case "group":
            {
                var ids = Ids(field, value, multiple: false);
                return ids.Count == 0 ? null : Json(ids[0]);
            }
            case "versions":
            case "groups":
            {
                var ids = Ids(field, value, multiple: true);
                return ids.Count == 0 ? null : Json(ids);
            }
            case "labels":
            {
                var items = Strings(value, field.Name)
                    .SelectMany(x => x.Split(new[] { ',', ' ' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                    .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                if (items.Any(x => x.Length > 50) || items.Count > 50) throw new ArgumentException($"Поле «{field.Name}»: слишком длинные метки");
                return items.Count == 0 ? null : Json(items);
            }
            case "checkbox":
            {
                var flag = value.ValueKind switch
                {
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    JsonValueKind.String => bool.TryParse(value.GetString(), out var b) ? b : throw new ArgumentException($"Поле «{field.Name}»: нужно да или нет"),
                    _ => throw new ArgumentException($"Поле «{field.Name}»: нужно да или нет"),
                };
                return flag ? Json(true) : null;
            }
            case "url":
            {
                var text = Text(value, field.Name).Trim();
                if (text.Length == 0) return null;
                try { return Json(HomeService.NormalizeUrl(text)); }
                catch (ArgumentException) { throw new ArgumentException($"Поле «{field.Name}»: введите ссылку http(s)"); }
            }
            case "user":
            {
                var text = Text(value, field.Name).Trim();
                if (text.Length == 0) return null;
                if (!Guid.TryParse(text, out var id)) throw new ArgumentException($"Поле «{field.Name}»: выберите пользователя");
                return Json(id.ToString());
            }
            default:
                throw new ArgumentException($"Unsupported field type '{field.FieldType}'");
        }
    }

    /// <summary>Text form of a stored value, used for history and JQL.</summary>
    public static string Display(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Array => string.Join(",", value.EnumerateArray().Select(Display)),
        JsonValueKind.String => value.GetString() ?? "",
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        JsonValueKind.Null => "",
        _ => value.GetRawText(),
    };

    public static List<string> ParseOptions(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new(); }
        catch (JsonException) { return new(); }
    }

    private static string Text(JsonElement value, string name) => value.ValueKind switch
    {
        JsonValueKind.String => value.GetString() ?? "",
        JsonValueKind.Number => value.GetRawText(),
        _ => throw new ArgumentException($"Поле «{name}»: неверное значение"),
    };

    private static List<string> Strings(JsonElement value, string name) => value.ValueKind switch
    {
        JsonValueKind.Array => value.EnumerateArray().Select(x => Text(x, name).Trim()).Where(x => x.Length > 0).ToList(),
        JsonValueKind.String => (value.GetString() ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList(),
        _ => throw new ArgumentException($"Поле «{name}»: неверное значение"),
    };

    private static JsonElement Json<T>(T value) => JsonSerializer.SerializeToElement(value);

    private static IEnumerable<string> Split(string value) => value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private async Task ApplyTypeAsync(IssueTypeDefinition type, IssueTypeRequest request, CancellationToken ct)
    {
        if (request.Name != null)
        {
            var name = request.Name.Trim();
            if (name.Length == 0) throw new ArgumentException("Введите название типа");
            if (name.Length > 60) throw new ArgumentException("Название типа — не больше 60 символов");
            if (Enum.GetNames<IssueType>().Contains(name, StringComparer.OrdinalIgnoreCase)
                || new[] { "Эпик", "История", "Задача", "Баг", "Ошибка", "Подзадача" }.Contains(name, StringComparer.OrdinalIgnoreCase))
                throw new ArgumentException("Такой стандартный тип уже есть");
            var taken = await _db.IssueTypeDefinitions.Where(x => x.TeamId == type.TeamId && x.Id != type.Id).Select(x => x.Name).ToListAsync(ct);
            if (taken.Contains(name, StringComparer.OrdinalIgnoreCase))
                throw new ArgumentException($"Тип «{name}» уже есть");
            type.Name = name;
        }
        else if (type.Name.Length == 0) throw new ArgumentException("Введите название типа");
        if (request.Description != null) type.Description = Limit(request.Description, 500);
        if (request.BaseType != null)
        {
            if (!Enum.IsDefined(request.BaseType.Value)) throw new ArgumentException("Неверный уровень иерархии");
            type.BaseType = request.BaseType.Value;
        }
        if (request.Icon != null)
        {
            var icon = request.Icon.Trim();
            if (icon.Length == 0 || icon.Length > 16) throw new ArgumentException("Выберите иконку");
            type.Icon = icon;
        }
        if (request.Color != null)
        {
            var color = request.Color.Trim();
            if (!System.Text.RegularExpressions.Regex.IsMatch(color, "^#[0-9a-fA-F]{6}$")) throw new ArgumentException("Неверный цвет");
            type.Color = color.ToLowerInvariant();
        }
    }

    private async Task ApplyFieldAsync(CustomFieldDefinition field, CustomFieldRequest request, bool isNew, CancellationToken ct)
    {
        if (request.Name != null)
        {
            var name = request.Name.Trim();
            if (name.Length == 0) throw new ArgumentException("Введите название поля");
            if (name.Length > 100) throw new ArgumentException("Название поля — не больше 100 символов");
            if (name.StartsWith("cf[", StringComparison.OrdinalIgnoreCase) || name.Any(c => c is '"' or '\''))
                throw new ArgumentException("Название поля не может содержать кавычки");
            var taken = await _db.CustomFieldDefinitions.Where(x => x.TeamId == field.TeamId && x.Id != field.Id).Select(x => x.Name).ToListAsync(ct);
            if (taken.Contains(name, StringComparer.OrdinalIgnoreCase))
                throw new ArgumentException($"Поле «{name}» уже есть");
            field.Name = name;
        }
        else if (field.Name.Length == 0) throw new ArgumentException("Введите название поля");
        if (request.Description != null) field.Description = Limit(request.Description, 500);
        if (request.FieldType != null)
        {
            if (!FieldTypes.Contains(request.FieldType)) throw new ArgumentException("Неверный тип поля");
            if (!isNew && request.FieldType != field.FieldType) throw new ArgumentException("Тип поля нельзя менять после создания");
            field.FieldType = request.FieldType;
        }
        var global = DefaultContext(field);
        ApplyOptions(field, global, request.Options, request.Children);
        if (request.DefaultValue.HasValue) global.DefaultValue = await DefaultValueAsync(field, global, request.DefaultValue, ct);
        field.OptionsJson = JsonSerializer.Serialize(global.Options);
        field.CascadeJson = JsonSerializer.Serialize(global.Children);
        field.DefaultValueJson = global.DefaultValue is JsonElement def ? def.GetRawText() : null;
        if (request.Boards != null) field.Boards = string.Join(",", await ValidBoardsAsync(field.TeamId, request.Boards, ct));
        if (request.IssueTypes != null) field.IssueTypes = string.Join(",", await ValidIssueTypesAsync(field.TeamId, request.IssueTypes, ct));
        var contexts = request.Contexts ?? ExtraContexts(field)
            .Select(c => new FieldContextRequest(c.Id, c.Name, c.Boards, c.IssueTypes, c.Options, c.Children, null)).ToList();
        await ApplyContextsAsync(field, contexts, ct);
        if (request.Required != null) field.Required = request.Required.Value;
        if (request.Order != null) field.Order = Math.Clamp(request.Order.Value, 0, 10000);
    }

    private async Task EnsureTeamAdminAsync(Guid teamId, Guid userId, CancellationToken ct)
    {
        var (status, permission) = await _access.GetTeamAccessAsync(teamId, userId, ct);
        if (status == ProjectAccessStatus.NotFound) throw new KeyNotFoundException("Team not found");
        if (status != ProjectAccessStatus.Success || permission != BoardPermission.Admin)
            throw new UnauthorizedAccessException("Настраивать типы и поля может только владелец или администратор команды");
    }

    private async Task EnsureTeamUserAsync(Guid teamId, Guid userId, CancellationToken ct)
    {
        var ok = await _db.Teams.AnyAsync(t => t.Id == teamId && (t.OwnerId == userId || t.Members.Any(m => m.UserId == userId)), ct);
        if (!ok) throw new ArgumentException("Пользователь не состоит в команде");
    }

    private async Task InvalidateTeamBoardsAsync(Guid teamId, CancellationToken ct)
    {
        var boardIds = await _db.Boards.Where(b => b.TeamId == teamId).Select(b => b.Id).ToListAsync(ct);
        foreach (var boardId in boardIds)
        {
            await _cache.InvalidateAsync("board:detail:" + boardId, ct);
            await _boardHub.NotifyBoardUpdatedAsync(boardId, ct);
        }
    }

    private static string? Limit(string value, int max)
    {
        var text = value.Trim();
        if (text.Length == 0) return null;
        return text.Length > max ? text[..max] : text;
    }

    private static object TypeDto(IssueTypeDefinition x, int? issueCount) => new
    {
        id = x.Id,
        teamId = x.TeamId,
        name = x.Name,
        description = x.Description,
        baseType = x.BaseType,
        icon = x.Icon,
        color = x.Color,
        issueCount,
    };

    private static object FieldDto(CustomFieldDefinition x) => new
    {
        id = x.Id,
        teamId = x.TeamId,
        name = x.Name,
        description = x.Description,
        fieldType = x.FieldType,
        options = ParseOptions(x.OptionsJson),
        children = ParseChildren(x.CascadeJson),
        defaultValue = ParseDefault(x.DefaultValueJson),
        boards = Split(x.Boards).ToList(),
        issueTypes = Split(x.IssueTypes).ToList(),
        contexts = ExtraContexts(x).Select(ContextDto),
        required = x.Required,
        order = x.Order,
    };
}
