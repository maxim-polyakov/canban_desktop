using System.Globalization;
using CanbanServer.Application.Contracts;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Flattened asset object: every searchable field maps to one or more string values.</summary>
public sealed class AssetObjectView
{
    public Guid Id { get; init; }
    public Dictionary<string, List<string>> Fields { get; } = new(StringComparer.OrdinalIgnoreCase);

    public AssetObjectView Add(string field, string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return this;
        if (!Fields.TryGetValue(field, out var list)) Fields[field] = list = new List<string>();
        list.Add(value);
        return this;
    }

    public IReadOnlyList<string> Get(string field) =>
        Fields.TryGetValue(Normalize(field), out var list) ? list : Array.Empty<string>();

    private static string Normalize(string field) => field.ToLowerInvariant() switch
    {
        "name" => "label",
        "type" => "objectType",
        "objectschema" => "schema",
        _ => field,
    };
}

/// <summary>Assets Query Language: JQL grammar evaluated against <see cref="AssetObjectView"/>.</summary>
public static class AqlEvaluator
{
    public static JqlQuery Parse(string aql) => new JqlParser(aql).Parse();

    /// <summary>Plain words without an operator become a label/key search, like the Assets search box.</summary>
    public static JqlQuery ParseOrText(string text)
    {
        var trimmed = text.Trim();
        if (trimmed.Length == 0) return new JqlQuery(null, Array.Empty<JqlOrder>());
        try { return Parse(trimmed); }
        catch (FormatException) when (!trimmed.Any(c => "=!<>~()".Contains(c)))
        {
            var value = new[] { new JqlValue(trimmed) };
            return new JqlQuery(new JqlBinary("OR", new JqlPredicate("label", "~", value), new JqlPredicate("key", "~", value)), Array.Empty<JqlOrder>());
        }
    }

    public static bool Matches(JqlNode? node, AssetObjectView view, string currentUserId) => node switch
    {
        null => true,
        JqlBinary { Operator: "AND" } b => Matches(b.Left, view, currentUserId) && Matches(b.Right, view, currentUserId),
        JqlBinary b => Matches(b.Left, view, currentUserId) || Matches(b.Right, view, currentUserId),
        JqlNot n => !Matches(n.Operand, view, currentUserId),
        JqlPredicate p => MatchesPredicate(p, view, currentUserId),
        _ => false,
    };

    public static IEnumerable<AssetObjectView> Order(IEnumerable<AssetObjectView> views, IReadOnlyList<JqlOrder> order)
    {
        if (order.Count == 0) return views.OrderBy(v => First(v, "label"), StringComparer.CurrentCultureIgnoreCase);
        IOrderedEnumerable<AssetObjectView>? sorted = null;
        foreach (var o in order)
        {
            Func<AssetObjectView, string> key = v => First(v, o.Field);
            var comparer = new ValueComparer();
            sorted = sorted == null
                ? (o.Descending ? views.OrderByDescending(key, comparer) : views.OrderBy(key, comparer))
                : (o.Descending ? sorted.ThenByDescending(key, comparer) : sorted.ThenBy(key, comparer));
        }
        return sorted!;
    }

    private static string First(AssetObjectView view, string field) => view.Get(field).FirstOrDefault() ?? "";

    private static bool MatchesPredicate(JqlPredicate p, AssetObjectView view, string currentUserId)
    {
        var actual = view.Get(p.Field);
        var expected = p.Values.SelectMany(v => Resolve(v, currentUserId)).ToList();
        return p.Operator switch
        {
            "IS EMPTY" => actual.Count == 0,
            "IS NOT EMPTY" => actual.Count > 0,
            "=" or "IN" => actual.Any(a => expected.Any(e => Equal(a, e))),
            "!=" or "NOT IN" => !actual.Any(a => expected.Any(e => Equal(a, e))),
            "~" => actual.Any(a => expected.Any(e => a.Contains(e, StringComparison.CurrentCultureIgnoreCase))),
            "!~" => !actual.Any(a => expected.Any(e => a.Contains(e, StringComparison.CurrentCultureIgnoreCase))),
            ">" => actual.Any(a => expected.Any(e => Compare(a, e) > 0)),
            ">=" => actual.Any(a => expected.Any(e => Compare(a, e) >= 0)),
            "<" => actual.Any(a => expected.Any(e => Compare(a, e) < 0)),
            "<=" => actual.Any(a => expected.Any(e => Compare(a, e) <= 0)),
            _ => throw new FormatException($"Unsupported operator {p.Operator}"),
        };
    }

    private static IEnumerable<string> Resolve(JqlValue value, string currentUserId)
    {
        if (!value.IsFunction) return new[] { value.Value };
        return value.Value.ToLowerInvariant() switch
        {
            "currentuser" => new[] { currentUserId },
            "now" => new[] { DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture) },
            _ => throw new FormatException($"Unknown function {value.Value}()"),
        };
    }

    private static bool Equal(string a, string b) =>
        string.Equals(a, b, StringComparison.CurrentCultureIgnoreCase)
        || (TryNumber(a, out var x) && TryNumber(b, out var y) && x == y)
        || (TryDate(a, out var d1) && TryDate(b, out var d2) && b.Length <= 10 && d1.Date == d2.Date);

    internal static int Compare(string a, string b)
    {
        if (TryNumber(a, out var x) && TryNumber(b, out var y)) return x.CompareTo(y);
        if (TryDate(a, out var d1) && TryDate(b, out var d2)) return d1.CompareTo(d2);
        return string.Compare(a, b, StringComparison.CurrentCultureIgnoreCase);
    }

    private static bool TryNumber(string s, out decimal value) =>
        decimal.TryParse(s.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out value);

    private static bool TryDate(string s, out DateTime value) =>
        DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out value)
        && s.Length >= 8 && s.Contains('-');

    private sealed class ValueComparer : IComparer<string>
    {
        public int Compare(string? x, string? y) => AqlEvaluator.Compare(x ?? "", y ?? "");
    }
}
