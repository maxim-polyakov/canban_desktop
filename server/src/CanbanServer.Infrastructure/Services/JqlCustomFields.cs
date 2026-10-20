using System.Globalization;
using System.Text.Json;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Team-defined fields and issue types visible to a JQL search.</summary>
public sealed class JqlCustomFields
{
    private readonly ILookup<string, CustomFieldDefinition> _byName;
    private readonly Dictionary<Guid, CustomFieldDefinition> _byId;
    private readonly IReadOnlyDictionary<Guid, string> _typeNames;
    private readonly IReadOnlyDictionary<Guid, string> _referenceNames;
    private readonly Dictionary<Guid, Dictionary<string, JsonElement>> _values = new();

    public JqlCustomFields(
        IEnumerable<CustomFieldDefinition> fields, IReadOnlyDictionary<Guid, string> typeNames, IReadOnlyDictionary<Guid, string>? referenceNames = null)
    {
        var list = fields.ToList();
        _byName = list.ToLookup(f => f.Name.ToLowerInvariant());
        _byId = list.ToDictionary(f => f.Id);
        _typeNames = typeNames;
        _referenceNames = referenceNames ?? new Dictionary<Guid, string>();
    }

    public string? TypeName(Guid typeId) => _typeNames.TryGetValue(typeId, out var name) ? name : null;

    /// <summary>Resolves a field by name or cf[id] for the issue's team; false when no such field exists anywhere.</summary>
    public bool TryGetValue(Quest q, string field, out object? value)
    {
        value = null;
        var candidates = Candidates(field);
        if (candidates.Count == 0) return false;
        var teamId = q.Board?.TeamId;
        var definition = candidates.FirstOrDefault(f => f.TeamId == teamId);
        if (definition == null) return true;
        if (!_values.TryGetValue(q.Id, out var values))
            _values[q.Id] = values = IssueFieldService.ReadValues(q.CustomFieldsJson);
        if (!values.TryGetValue(definition.Id.ToString(), out var raw)) return true;
        value = definition.FieldType switch
        {
            "number" when raw.ValueKind == JsonValueKind.Number => raw.GetDecimal(),
            "date" when DateTime.TryParse(raw.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var date) => date,
            "user" when Guid.TryParse(raw.GetString(), out var user) => user,
            "version" or "versions" or "group" or "groups" => References(raw),
            _ => IssueFieldService.Display(raw),
        };
        return true;
    }

    /// <summary>Names and ids of referenced versions or groups, so JQL can match either.</summary>
    private string References(JsonElement raw)
    {
        var ids = raw.ValueKind == JsonValueKind.Array ? raw.EnumerateArray().Select(x => x.GetString()) : new[] { raw.GetString() };
        return string.Join(",", ids.Where(x => x != null).Select(x =>
            Guid.TryParse(x, out var id) && _referenceNames.TryGetValue(id, out var name) ? $"{name},{x}" : x));
    }

    private List<CustomFieldDefinition> Candidates(string field)
    {
        if (field.StartsWith("cf[", StringComparison.OrdinalIgnoreCase) && field.EndsWith(']')
            && Guid.TryParse(field[3..^1], out var id))
            return _byId.TryGetValue(id, out var byId) ? new() { byId } : new();
        return _byName[field.ToLowerInvariant()].ToList();
    }
}
