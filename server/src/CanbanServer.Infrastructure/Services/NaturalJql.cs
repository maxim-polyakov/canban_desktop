using System.Text.RegularExpressions;

namespace CanbanServer.Infrastructure.Services;

public sealed record NaturalJqlResult(string Jql, string Explanation, string Source);

/// <summary>
/// Rule-based translation of plain Russian/English requests into JQL. Used when no model is configured
/// and as a fallback when the model's answer doesn't parse.
/// </summary>
public static class NaturalJql
{
    private static readonly RegexOptions Opt = RegexOptions.IgnoreCase | RegexOptions.CultureInvariant;
    private static readonly Regex Quoted = new("[\"«“]([^\"»”]{1,200})[\"»”]", RegexOptions.Compiled);
    private static readonly Regex About = new(@"(?:\bпро\b|\bо\b|\bоб\b|содерж\w*|со словом|\babout\b|\bcontaining\b|\bwith text\b)\s+(.{2,100})$", Opt);
    private static readonly Regex Label = new(@"(?:метк\w*|label\w*|тег\w*)\s+([\p{L}\p{N}_\-]{1,50})", Opt);
    private static readonly Regex Days = new(@"(?:за|последни[ехй]|last|past)\s+(\d{1,3})\s*(дн\w*|день|дня|days?|d)\b", Opt);
    private static readonly Regex Weeks = new(@"(?:за|последни[ехй]|last|past)\s+(\d{1,2})\s*(недел\w*|weeks?|w)\b", Opt);

    public static NaturalJqlResult Translate(string text)
    {
        var source = (text ?? "").Trim();
        var s = source.ToLowerInvariant().Replace('ё', 'е');
        var clauses = new List<string>();
        var notes = new List<string>();
        void Add(string clause, string note) { if (!clauses.Contains(clause)) { clauses.Add(clause); notes.Add(note); } }
        bool Has(string pattern) => Regex.IsMatch(s, pattern, Opt);

        if (Has(@"без исполнител|не назначен|никому не назначен|unassigned"))
            Add("assignee IS EMPTY", "без исполнителя");
        else if (Has(@"\bмо[иея]\b|\bмоих\b|\bмне\b|на мне|назначенн\w* (на )?меня|\bmy\b|\bmine\b|assigned to me"))
            Add("assignee = currentUser()", "назначены на вас");
        if (Has(@"я созда|созданн\w* мной|я завел|мной созданн|reported by me|i created|i reported"))
            Add("reporter = currentUser()", "созданы вами");
        if (Has(@"я наблюда|наблюдаю|watching|i watch"))
            Add("watcher = currentUser()", "вы наблюдаете");

        var types = new List<string>();
        if (Has(@"\bбаг|ошибк|дефект|\bbugs?\b")) types.Add("Bug");
        if (Has(@"эпик|\bepics?\b")) types.Add("Epic");
        if (Has(@"истори[яийю]|\bstor(y|ies)\b")) types.Add("Story");
        if (Has(@"подзадач|sub-?tasks?")) types.Add("Subtask");
        if (types.Count == 1) Add($"type = {types[0]}", $"тип «{TypeRu(types[0])}»");
        else if (types.Count > 1) Add($"type IN ({string.Join(", ", types)})", "типы " + string.Join(", ", types.Select(t => $"«{TypeRu(t)}»")));

        if (Has(@"наивысш|высш\w* приоритет|критич|блокир\w* приоритет|highest|critical|blocker"))
            Add("priority = Highest", "высший приоритет");
        else if (Has(@"высок\w*|срочн\w*|важн\w*|\bhigh\b|urgent|important"))
            Add("priority IN (High, Highest)", "высокий приоритет");
        else if (Has(@"низш\w*|lowest"))
            Add("priority = Lowest", "низший приоритет");
        else if (Has(@"низк\w*|\blow\b|неважн|несрочн"))
            Add("priority IN (Low, Lowest)", "низкий приоритет");
        else if (Has(@"средн\w* приоритет|medium"))
            Add("priority = Medium", "средний приоритет");

        var overdue = Has(@"просроч|overdue|past due");
        if (overdue)
        {
            Add("duedate < now()", "срок прошёл");
            Add("resolution = Unresolved", "не решены");
        }
        else if (Has(@"в работе|в процессе|in progress|делаются|выполняются"))
            Add("statusCategory = \"In Progress\"", "в работе");
        else if (Has(@"к выполнению|не начат|\bto ?do\b|\bновы[ех] задач"))
            Add("statusCategory = \"To Do\"", "к выполнению");
        else if (Has(@"открыт|незаверш|не заверш|не готов|нерешен|не решен|\bunresolved\b|\bopen\b|активн\w* задач"))
            Add("resolution = Unresolved", "не решены");
        else if (Has(@"готов|заверш|закрыт|сделан|выполнен|решен|\bdone\b|closed|resolved|completed|finished"))
            Add("statusCategory = Done", "готовы");

        if (Has(@"(в )?(текущ|активн|открыт)\w* спринт|current sprint|active sprint|open sprint"))
            Add("sprint IN (openSprints())", "в активном спринте");
        else if (Has(@"в бэклоге|backlog|без спринта|not in sprint"))
            Add("sprint IS EMPTY", "в бэклоге");

        var dateField = Has(@"обновл|изменен|менял|updated|changed|modified") ? "updated"
            : Has(@"(закрыт|решен|заверш|сделан)\w* (за|сегодня|вчера|на этой)|resolved (today|this|in the last|last)") ? "resolved"
            : "created";
        var fieldRu = dateField switch { "updated" => "обновлены", "resolved" => "решены", _ => "созданы" };
        var days = Days.Match(s);
        var weeks = Weeks.Match(s);
        if (days.Success) Add($"{dateField} >= \"-{int.Parse(days.Groups[1].Value)}d\"", $"{fieldRu} за {days.Groups[1].Value} дн.");
        else if (weeks.Success) Add($"{dateField} >= \"-{int.Parse(weeks.Groups[1].Value)}w\"", $"{fieldRu} за {weeks.Groups[1].Value} нед.");
        else if (Has(@"сегодня|today")) Add($"{dateField} >= startOfDay()", $"{fieldRu} сегодня");
        else if (Has(@"вчера|yesterday")) Add($"{dateField} >= \"-1d\"", $"{fieldRu} со вчерашнего дня");
        else if (Has(@"на этой неделе|this week")) Add($"{dateField} >= startOfWeek()", $"{fieldRu} на этой неделе");
        else if (Has(@"за (последнюю )?неделю|за 7 дней|last week|past week")) Add($"{dateField} >= \"-1w\"", $"{fieldRu} за неделю");
        else if (Has(@"в этом месяце|this month")) Add($"{dateField} >= startOfMonth()", $"{fieldRu} в этом месяце");
        else if (Has(@"за (последний )?месяц|last month|past month")) Add($"{dateField} >= \"-1M\"", $"{fieldRu} за месяц");

        var label = Label.Match(source);
        if (label.Success) Add($"labels = \"{Escape(label.Groups[1].Value)}\"", $"метка «{label.Groups[1].Value}»");

        var quoted = Quoted.Match(source);
        var about = About.Match(source);
        if (quoted.Success) Add($"text ~ \"{Escape(quoted.Groups[1].Value.Trim())}\"", $"содержат «{quoted.Groups[1].Value.Trim()}»");
        else if (about.Success && !label.Success) Add($"text ~ \"{Escape(about.Groups[1].Value.Trim().TrimEnd('.', '?', '!'))}\"", $"содержат «{about.Groups[1].Value.Trim().TrimEnd('.', '?', '!')}»");

        if (clauses.Count == 0 && source.Length > 0)
            Add($"text ~ \"{Escape(source.Length > 100 ? source[..100] : source)}\"", $"содержат «{source}»");

        var order = clauses.Any(c => c.StartsWith("priority")) || Has(@"по приоритету|by priority") ? " ORDER BY priority DESC"
            : overdue ? " ORDER BY duedate ASC"
            : clauses.Any(c => c.StartsWith("updated")) ? " ORDER BY updated DESC"
            : " ORDER BY created DESC";
        var jql = clauses.Count == 0 ? "ORDER BY created DESC" : string.Join(" AND ", clauses) + order;
        var explanation = notes.Count == 0 ? "Все задачи" : "Задачи: " + string.Join(", ", notes);
        return new NaturalJqlResult(jql, explanation, "rules");
    }

    private static string Escape(string value) => value.Replace("\\", "\\\\").Replace("\"", "\\\"");

    private static string TypeRu(string type) => type switch
    {
        "Bug" => "Ошибка",
        "Epic" => "Эпик",
        "Story" => "История",
        "Subtask" => "Подзадача",
        _ => "Задача",
    };
}
