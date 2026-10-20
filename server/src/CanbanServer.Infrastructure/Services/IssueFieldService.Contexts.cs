using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public sealed record FieldContextRequest(
    string? Id, string? Name, List<Guid>? Boards, List<string>? IssueTypes, List<string>? Options,
    Dictionary<string, List<string>>? Children, JsonElement? DefaultValue);

/// <summary>Where a field is used and which options and default value it has there.</summary>
public sealed class FieldContext
{
    public const string DefaultId = "default";
    public string Id { get; set; } = DefaultId;
    public string Name { get; set; } = "";
    public List<Guid> Boards { get; set; } = new();
    public List<string> IssueTypes { get; set; } = new();
    public List<string> Options { get; set; } = new();
    public Dictionary<string, List<string>> Children { get; set; } = new();
    public JsonElement? DefaultValue { get; set; }
    [JsonIgnore] public bool IsDefault => Id == DefaultId;
}

public partial class IssueFieldService
{
    public const int MaxContextsPerField = 50;
    public const string DefaultContextName = "Контекст по умолчанию";
    public static readonly string[] OptionFieldTypes = { "select", "multiselect", "cascading" };
    private static readonly string[] ReferenceFieldTypes = { "version", "versions", "group", "groups" };
    private static readonly JsonSerializerOptions ContextJson = new(JsonSerializerDefaults.Web);

    public static FieldContext DefaultContext(CustomFieldDefinition field) => new()
    {
        Id = FieldContext.DefaultId,
        Name = DefaultContextName,
        Boards = Split(field.Boards).Select(x => Guid.TryParse(x, out var id) ? id : Guid.Empty).Where(x => x != Guid.Empty).ToList(),
        IssueTypes = Split(field.IssueTypes).ToList(),
        Options = ParseOptions(field.OptionsJson),
        Children = ParseChildren(field.CascadeJson),
        DefaultValue = ParseDefault(field.DefaultValueJson),
    };

    /// <summary>Contexts other than the default one.</summary>
    public static List<FieldContext> ExtraContexts(CustomFieldDefinition field)
    {
        if (string.IsNullOrWhiteSpace(field.ContextsJson)) return new();
        try { return JsonSerializer.Deserialize<List<FieldContext>>(field.ContextsJson, ContextJson) ?? new(); }
        catch (JsonException) { return new(); }
    }

    public static List<FieldContext> AllContexts(CustomFieldDefinition field) =>
        new List<FieldContext> { DefaultContext(field) }.Concat(ExtraContexts(field)).ToList();

    /// <summary>The context used in a space: one that names the space, otherwise the default one when it covers the space.</summary>
    public static FieldContext? ResolveContext(CustomFieldDefinition field, Guid boardId)
    {
        var specific = ExtraContexts(field).FirstOrDefault(c => c.Boards.Contains(boardId));
        if (specific != null) return specific;
        var global = DefaultContext(field);
        return global.Boards.Count == 0 || global.Boards.Contains(boardId) ? global : null;
    }

    public static bool AppliesToBoard(CustomFieldDefinition field, Guid boardId) => ResolveContext(field, boardId) != null;

    public static bool Applies(CustomFieldDefinition field, Guid boardId, IssueType baseType, Guid? typeId)
    {
        var context = ResolveContext(field, boardId);
        return context != null && AppliesToType(context, baseType, typeId);
    }

    private static bool AppliesToType(FieldContext context, IssueType baseType, Guid? typeId)
    {
        if (context.IssueTypes.Count == 0) return true;
        var token = typeId?.ToString() ?? ((int)baseType).ToString(CultureInfo.InvariantCulture);
        return context.IssueTypes.Contains(token, StringComparer.OrdinalIgnoreCase);
    }

    public static Dictionary<string, List<string>> ParseChildren(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return JsonSerializer.Deserialize<Dictionary<string, List<string>>>(json) ?? new(); }
        catch (JsonException) { return new(); }
    }

    private static JsonElement? ParseDefault(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize<JsonElement>(json); }
        catch (JsonException) { return null; }
    }

    private static JsonElement NormalizeCascade(CustomFieldDefinition field, FieldContext context, JsonElement value)
    {
        string? parent, child = null;
        switch (value.ValueKind)
        {
            case JsonValueKind.Array:
            {
                var parts = value.EnumerateArray().Select(x => Text(x, field.Name).Trim()).ToList();
                if (parts.Count is 0 or > 2) throw new ArgumentException($"Поле «{field.Name}»: неверное значение");
                parent = parts[0];
                if (parts.Count == 2 && parts[1].Length > 0) child = parts[1];
                break;
            }
            case JsonValueKind.Object:
                parent = value.TryGetProperty("parent", out var p) ? Text(p, field.Name).Trim() : "";
                if (value.TryGetProperty("child", out var c) && c.ValueKind != JsonValueKind.Null) child = Text(c, field.Name).Trim();
                if (child?.Length == 0) child = null;
                break;
            default:
                parent = Text(value, field.Name).Trim();
                break;
        }
        var parentOption = MatchOption(field, context.Options, parent);
        if (child == null) return Json(new[] { parentOption });
        var children = context.Children.TryGetValue(parentOption, out var list) ? list : new List<string>();
        return Json(new[] { parentOption, MatchOption(field, children, child) });
    }

    private static string MatchOption(CustomFieldDefinition field, IEnumerable<string> options, string value) =>
        options.FirstOrDefault(o => o.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase))
            ?? throw new ArgumentException($"Поле «{field.Name}»: нет варианта «{value}»");

    private static List<string> Ids(CustomFieldDefinition field, JsonElement value, bool multiple)
    {
        var items = multiple ? Strings(value, field.Name) : new List<string> { Text(value, field.Name).Trim() };
        var ids = new List<string>();
        foreach (var item in items.Where(x => x.Length > 0))
        {
            if (!Guid.TryParse(item, out var id)) throw new ArgumentException($"Поле «{field.Name}»: неверное значение");
            if (!ids.Contains(id.ToString())) ids.Add(id.ToString());
        }
        return ids;
    }

    /// <summary>Checks that version and group values point at this space's versions and this team's groups.</summary>
    private async Task EnsureReferencesAsync(CustomFieldDefinition field, Guid teamId, Guid? boardId, JsonElement value, CancellationToken ct)
    {
        if (!ReferenceFieldTypes.Contains(field.FieldType)) return;
        var ids = (value.ValueKind == JsonValueKind.Array ? value.EnumerateArray().Select(x => x.GetString()) : new[] { value.GetString() })
            .Select(x => Guid.Parse(x!)).ToList();
        if (field.FieldType is "version" or "versions")
        {
            var found = await _db.BoardReleases.CountAsync(r => ids.Contains(r.Id) && r.BoardId == boardId, ct);
            if (found != ids.Count) throw new ArgumentException($"Поле «{field.Name}»: версия не найдена в этом пространстве");
        }
        else
        {
            var found = await _db.UserGroups.CountAsync(g => ids.Contains(g.Id) && g.TeamId == teamId, ct);
            if (found != ids.Count) throw new ArgumentException($"Поле «{field.Name}»: группа не найдена в команде");
        }
    }

    private async Task<FieldContext> ApplyContextAsync(
        CustomFieldDefinition field, FieldContextRequest request, FieldContext? existing, CancellationToken ct)
    {
        var context = existing ?? new FieldContext { Id = Guid.NewGuid().ToString("N")[..12] };
        if (request.Name != null)
        {
            var name = request.Name.Trim();
            if (name.Length == 0) throw new ArgumentException("Введите название контекста");
            if (name.Length > 100) throw new ArgumentException("Название контекста — не больше 100 символов");
            context.Name = name;
        }
        else if (context.Name.Length == 0) throw new ArgumentException("Введите название контекста");
        if (request.Boards != null) context.Boards = await ValidBoardsAsync(field.TeamId, request.Boards, ct);
        if (request.IssueTypes != null) context.IssueTypes = await ValidIssueTypesAsync(field.TeamId, request.IssueTypes, ct);
        ApplyOptions(field, context, request.Options, request.Children);
        if (request.DefaultValue.HasValue) context.DefaultValue = await DefaultValueAsync(field, context, request.DefaultValue, ct);
        return context;
    }

    private static void ApplyOptions(CustomFieldDefinition field, FieldContext context, List<string>? options, Dictionary<string, List<string>>? children)
    {
        if (options != null) context.Options = CleanOptions(options);
        if (children != null)
        {
            context.Children = children
                .Where(x => context.Options.Contains(x.Key, StringComparer.OrdinalIgnoreCase))
                .ToDictionary(x => context.Options.First(o => o.Equals(x.Key, StringComparison.OrdinalIgnoreCase)), x => CleanOptions(x.Value ?? new()));
        }
        else if (options != null)
            context.Children = context.Children.Where(x => context.Options.Contains(x.Key)).ToDictionary(x => x.Key, x => x.Value);
        if (field.FieldType is "select" or "multiselect" or "cascading" && context.Options.Count == 0)
            throw new ArgumentException(context.IsDefault ? "Добавьте хотя бы один вариант" : $"Контекст «{context.Name}»: добавьте хотя бы один вариант");
        if (context.DefaultValue is JsonElement current)
        {
            try { context.DefaultValue = Normalize(field, current, context); }
            catch (ArgumentException) { context.DefaultValue = null; }
        }
    }

    private static List<string> CleanOptions(IEnumerable<string?> options)
    {
        var list = options.Select(o => (o ?? "").Trim()).Where(o => o.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (list.Count > 100 || list.Any(o => o.Length > 100)) throw new ArgumentException("Слишком много или слишком длинные варианты");
        return list;
    }

    private async Task<JsonElement?> DefaultValueAsync(CustomFieldDefinition field, FieldContext context, JsonElement? raw, CancellationToken ct)
    {
        if (field.FieldType is "user" or "version" or "versions")
        {
            if (raw is JsonElement r && r.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined))
                throw new ArgumentException("У этого типа поля нет значения по умолчанию");
            return null;
        }
        var value = Normalize(field, raw, context);
        if (value is JsonElement element) await EnsureReferencesAsync(field, field.TeamId, null, element, ct);
        return value;
    }

    private async Task<List<Guid>> ValidBoardsAsync(Guid teamId, List<Guid> boards, CancellationToken ct)
    {
        var ids = boards.Distinct().ToList();
        var valid = await _db.Boards.CountAsync(b => ids.Contains(b.Id) && b.TeamId == teamId, ct);
        if (valid != ids.Count) throw new ArgumentException("Пространство не найдено в этой команде");
        return ids;
    }

    private async Task<List<string>> ValidIssueTypesAsync(Guid teamId, List<string> issueTypes, CancellationToken ct)
    {
        var tokens = issueTypes.Select(x => (x ?? "").Trim()).Where(x => x.Length > 0).Distinct().ToList();
        var customIds = new List<Guid>();
        foreach (var token in tokens)
        {
            if (Guid.TryParse(token, out var id)) customIds.Add(id);
            else if (!int.TryParse(token, out var n) || !Enum.IsDefined(typeof(IssueType), n)) throw new ArgumentException("Неверный тип задачи");
        }
        if (customIds.Count > 0 && await _db.IssueTypeDefinitions.CountAsync(x => customIds.Contains(x.Id) && x.TeamId == teamId, ct) != customIds.Count)
            throw new ArgumentException("Тип задачи не найден в этой команде");
        return tokens;
    }

    private async Task ApplyContextsAsync(CustomFieldDefinition field, List<FieldContextRequest> requests, CancellationToken ct)
    {
        if (requests.Count > MaxContextsPerField) throw new ArgumentException($"Не больше {MaxContextsPerField} контекстов у поля");
        var existing = ExtraContexts(field).ToDictionary(c => c.Id);
        var result = new List<FieldContext>();
        foreach (var request in requests)
        {
            var current = request.Id != null && existing.TryGetValue(request.Id, out var found) ? found : null;
            var context = await ApplyContextAsync(field, request, current, ct);
            if (context.Boards.Count == 0) throw new ArgumentException($"Контекст «{context.Name}»: выберите хотя бы одно пространство");
            result.Add(context);
        }
        var defaultBoards = DefaultContext(field).Boards;
        var seen = new HashSet<Guid>(defaultBoards);
        foreach (var board in result.SelectMany(c => c.Boards))
        {
            if (!seen.Add(board))
                throw new ArgumentException("Пространство может входить только в один контекст поля");
        }
        if (result.Select(c => c.Name).Append(DefaultContextName).GroupBy(n => n, StringComparer.OrdinalIgnoreCase).Any(g => g.Count() > 1))
            throw new ArgumentException("Названия контекстов должны различаться");
        field.ContextsJson = JsonSerializer.Serialize(result, ContextJson);
    }

    private static object ContextDto(FieldContext c) => new
    {
        id = c.Id,
        name = c.Name,
        isDefault = c.IsDefault,
        boards = c.Boards,
        issueTypes = c.IssueTypes,
        options = c.Options,
        children = c.Children,
        defaultValue = c.DefaultValue,
    };

    /// <summary>The field as a space sees it: options, issue types and default value come from the space's context.</summary>
    private static object BoardFieldDto(CustomFieldDefinition x, FieldContext context) => new
    {
        id = x.Id,
        teamId = x.TeamId,
        name = x.Name,
        description = x.Description,
        fieldType = x.FieldType,
        contextId = context.Id,
        options = context.Options,
        children = context.Children,
        defaultValue = context.DefaultValue,
        boards = Split(x.Boards).ToList(),
        issueTypes = context.IssueTypes,
        required = x.Required,
        order = x.Order,
    };
}
