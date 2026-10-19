using System.Text;

namespace CanbanServer.Infrastructure.Services;

/// <summary>RFC 4180 CSV: quoted fields may contain commas, quotes ("") and line breaks. Also accepts ';' separated files.</summary>
public static class AssetCsv
{
    public static List<List<string>> Read(string content)
    {
        var rows = new List<List<string>>();
        if (string.IsNullOrEmpty(content)) return rows;
        if (content[0] == '\uFEFF') content = content[1..];
        var firstLine = content.Split('\n', 2)[0];
        var separator = firstLine.Count(c => c == ';') > firstLine.Count(c => c == ',') ? ';' : ',';

        var row = new List<string>();
        var field = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < content.Length; i++)
        {
            var c = content[i];
            if (quoted)
            {
                if (c == '"' && i + 1 < content.Length && content[i + 1] == '"') { field.Append('"'); i++; }
                else if (c == '"') quoted = false;
                else field.Append(c);
            }
            else if (c == '"' && field.Length == 0) quoted = true;
            else if (c == separator) { row.Add(field.ToString()); field.Clear(); }
            else if (c == '\n' || c == '\r')
            {
                if (c == '\r' && i + 1 < content.Length && content[i + 1] == '\n') i++;
                row.Add(field.ToString()); field.Clear();
                if (row.Any(v => v.Length > 0)) rows.Add(row);
                row = new List<string>();
            }
            else field.Append(c);
        }
        if (quoted) throw new FormatException("CSV: незакрытая кавычка");
        row.Add(field.ToString());
        if (row.Any(v => v.Length > 0)) rows.Add(row);
        return rows;
    }

    public static string Write(IEnumerable<IEnumerable<string?>> rows)
    {
        var sb = new StringBuilder();
        foreach (var row in rows)
            sb.Append(string.Join(',', row.Select(Escape))).Append("\r\n");
        return sb.ToString();
    }

    private static string Escape(string? value)
    {
        value ??= "";
        return value.IndexOfAny(new[] { ',', '"', '\n', '\r', ';' }) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;
    }
}
