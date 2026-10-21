using System.Globalization;
using System.Text.RegularExpressions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public sealed class JqlService : IJqlQueryService
{
    private readonly CanbanDbContext _db;
    private readonly PermissionSchemeService _permissions;

    public JqlService(CanbanDbContext db, PermissionSchemeService permissions)
    {
        _db = db;
        _permissions = permissions;
    }
    public JqlQuery Parse(string text) => new JqlParser(text).Parse();

    public async Task<JqlSearchResult> SearchAsync(string text, Guid userId, int page, int pageSize, Guid? boardId, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var offset = (page - 1) * pageSize;
        var ast = Parse(text);
        var query = _db.Quests.AsNoTracking()
            .Include(q => q.Column).Include(q => q.Sprint).Include(q => q.Assignee).Include(q => q.Board)
            .Include(q => q.Assignees).ThenInclude(a => a.User)
            .Include(q => q.NotificationRecipients).Include(q => q.ExternalNotificationRecipients).Include(q => q.Votes)
            .Where(q => q.Board.Team.OwnerId == userId || q.Board.Team.Members.Any(m => m.UserId == userId) || q.Board.Access != "private");
        if (boardId.HasValue) query = query.Where(q => q.BoardId == boardId);
        var values = await query.ToListAsync(ct);
        var browsable = new HashSet<Guid>();
        foreach (var id in values.Select(q => q.BoardId).Distinct())
            if (await _permissions.HasAsync(id, userId, JiraPermissions.Browse, ct)) browsable.Add(id);
        values = values.Where(q => browsable.Contains(q.BoardId)).ToList();
        var ids = values.Select(q => q.Id).ToList();
        var lastChanges = ids.Count == 0 ? new Dictionary<Guid, DateTime>() : await _db.QuestChanges.AsNoTracking()
            .Where(c => ids.Contains(c.QuestId))
            .GroupBy(c => c.QuestId)
            .Select(g => new { g.Key, At = g.Max(c => c.CreatedAt) })
            .ToDictionaryAsync(x => x.Key, x => x.At, ct);
        var teamIds = values.Select(q => q.Board.TeamId).Distinct().ToList();
        var customFields = await _db.CustomFieldDefinitions.AsNoTracking().Where(f => teamIds.Contains(f.TeamId)).ToListAsync(ct);
        var referenceNames = new Dictionary<Guid, string>();
        if (customFields.Any(f => f.FieldType is "version" or "versions"))
        {
            var boardIds = values.Select(q => q.BoardId).Distinct().ToList();
            foreach (var r in await _db.BoardReleases.AsNoTracking().Where(r => boardIds.Contains(r.BoardId)).Select(r => new { r.Id, r.Name }).ToListAsync(ct))
                referenceNames[r.Id] = r.Name;
        }
        if (customFields.Any(f => f.FieldType is "group" or "groups"))
        {
            foreach (var g in await _db.UserGroups.AsNoTracking().Where(g => teamIds.Contains(g.TeamId)).Select(g => new { g.Id, g.Name }).ToListAsync(ct))
                referenceNames[g.Id] = g.Name;
        }
        var custom = new JqlCustomFields(
            customFields,
            await _db.IssueTypeDefinitions.AsNoTracking().Where(t => teamIds.Contains(t.TeamId)).ToDictionaryAsync(t => t.Id, t => t.Name, ct),
            referenceNames);
        var context = new JqlContext(userId, DateTime.UtcNow, q => lastChanges.TryGetValue(q.Id, out var at) && at > q.CreatedAt ? at : q.CreatedAt, custom);
        var filtered = ast.Where == null ? values : values.Where(q => Match(ast.Where, q, context)).ToList();
        IOrderedEnumerable<Quest>? ordered = null;
        foreach (var item in ast.OrderBy)
        {
            Func<Quest, object?> key = q => SortKey(q, item.Field, context);
            ordered = ordered == null
                ? (item.Descending ? filtered.OrderByDescending(key) : filtered.OrderBy(key))
                : (item.Descending ? ordered.ThenByDescending(key) : ordered.ThenBy(key));
        }
        var result = (ordered ?? filtered.OrderByDescending(q => q.CreatedAt)).ToList();
        var pageItems = result.Skip(offset).Take(pageSize).ToList();
        var reporterIds = pageItems.Where(q => q.ReporterId.HasValue).Select(q => q.ReporterId!.Value).Distinct().ToList();
        var reporters = reporterIds.Count == 0 ? new Dictionary<Guid, (string Name, string? Avatar)>() : (await _db.Users.AsNoTracking()
            .Where(u => reporterIds.Contains(u.Id)).Select(u => new { u.Id, u.DisplayName, u.AvatarUrl }).ToListAsync(ct))
            .ToDictionary(u => u.Id, u => (Name: u.DisplayName, Avatar: u.AvatarUrl));
        var details = pageItems.Select(q =>
        {
            var reporter = q.ReporterId.HasValue && reporters.TryGetValue(q.ReporterId.Value, out var r) ? r : default;
            return new JqlIssueDetails(q.Id, q.Column?.Title ?? "", StatusCategory(q.Column?.Kind), q.ReporterId, reporter.Name, reporter.Avatar,
                q.Board?.Name ?? "", q.Board?.KeyPrefix ?? "", context.UpdatedAt(q), q.Votes.Count);
        }).ToList();
        return new JqlSearchResult(pageItems.Select(BoardService.MapQuest).ToList(), result.Count, page, pageSize, details);
    }

    public sealed record JqlContext(Guid UserId, DateTime Now, Func<Quest, DateTime> UpdatedAt, JqlCustomFields? Custom = null);

    public static bool Matches(JqlQuery query, Quest q, JqlContext context) => query.Where == null || Match(query.Where, q, context);

    public static string StatusCategory(ColumnKind? kind) => kind switch
    {
        ColumnKind.Done or ColumnKind.Archive => "done",
        ColumnKind.InProgress or ColumnKind.Review => "indeterminate",
        _ => "new"
    };

    private static bool Match(JqlNode node, Quest q, JqlContext context) => node switch
    {
        JqlBinary b when b.Operator == "AND" => Match(b.Left, q, context) && Match(b.Right, q, context),
        JqlBinary b => Match(b.Left, q, context) || Match(b.Right, q, context),
        JqlNot n => !Match(n.Operand, q, context),
        JqlPredicate p => MatchPredicate(p, q, context),
        _ => false
    };

    private static bool MatchPredicate(JqlPredicate p, Quest q, JqlContext context)
    {
        var field = p.Field.ToLowerInvariant();
        var actual = Field(q, field, context);
        if (p.Operator == "IS EMPTY") return actual == null || actual.ToString() == "";
        if (p.Operator == "IS NOT EMPTY") return actual != null && actual.ToString() != "";
        if (field == "resolution")
        {
            var resolved = actual != null;
            var matches = p.Values.Select(v => IsUnresolved(v.Value) ? !resolved : resolved).ToList();
            return p.Operator is "!=" or "NOT IN" ? matches.All(x => !x) : matches.Any(x => x);
        }
        if (field is "statuscategory" or "category")
        {
            var matches = p.Values.Select(v => NormalizeCategory(v.Value) == (string?)actual).ToList();
            return p.Operator is "!=" or "NOT IN" ? matches.All(x => !x) : matches.Any(x => x);
        }
        var expected = p.Values.Select(v => Resolve(v, q, context)).ToList();
        if (p.Operator is "!=" or "NOT IN") return expected.All(e => !Compare(actual, e, "="));
        return expected.Any(e => Compare(actual, e, p.Operator));
    }

    private static bool IsUnresolved(string value) =>
        value.Equals("unresolved", StringComparison.OrdinalIgnoreCase) || value.Equals("Нет решения", StringComparison.OrdinalIgnoreCase);

    private static string NormalizeCategory(string value) => value.Trim().ToLowerInvariant() switch
    {
        "done" or "готово" or "завершено" => "done",
        "in progress" or "indeterminate" or "в работе" => "indeterminate",
        _ => "new"
    };

    private static object? Resolve(JqlValue value, Quest q, JqlContext context)
    {
        if (!value.IsFunction) return value.Value;
        var name = value.Value.ToLowerInvariant();
        return name switch
        {
            "currentuser" => context.UserId,
            "opensprints" => q.Sprint?.Status == SprintStatus.Active ? q.SprintId : null,
            "now" => Shift(context.Now, value.Argument, 'd'),
            "startofday" => Shift(DayStart(context.Now), value.Argument, 'd'),
            "endofday" => Shift(DayStart(context.Now).AddDays(1).AddTicks(-1), value.Argument, 'd'),
            "startofweek" => Shift(WeekStart(context.Now), value.Argument, 'w'),
            "endofweek" => Shift(WeekStart(context.Now).AddDays(7).AddTicks(-1), value.Argument, 'w'),
            "startofmonth" => Shift(MonthStart(context.Now), value.Argument, 'M'),
            "endofmonth" => Shift(MonthStart(context.Now).AddMonths(1).AddTicks(-1), value.Argument, 'M'),
            "startofyear" => Shift(new DateTime(context.Now.Year, 1, 1, 0, 0, 0, DateTimeKind.Utc), value.Argument, 'y'),
            "endofyear" => Shift(new DateTime(context.Now.Year + 1, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddTicks(-1), value.Argument, 'y'),
            _ => throw new ArgumentException($"Unsupported JQL function '{value.Value}()'")
        };
    }

    private static DateTime DayStart(DateTime now) => DateTime.SpecifyKind(now.Date, DateTimeKind.Utc);
    private static DateTime WeekStart(DateTime now) => DayStart(now).AddDays(-(((int)now.DayOfWeek + 6) % 7));
    private static DateTime MonthStart(DateTime now) => new(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);

    /// <summary>Jira date function offsets: startOfWeek(-1) is last week, startOfDay(-7d) is a week ago; a bare number uses the function's unit.</summary>
    private static DateTime Shift(DateTime value, string? argument, char unit)
    {
        var text = argument?.Trim();
        if (string.IsNullOrEmpty(text)) return value;
        if (char.IsDigit(text[^1])) text += unit;
        if (!RelativeDate.IsMatch(text)) throw new ArgumentException($"Invalid JQL date offset '{argument}'");
        return ParseDate(text, value)!.Value;
    }

    private static object? Field(Quest q, string field, JqlContext context) => field switch
    {
        "key" or "issuekey" => q.IssueKey,
        "summary" or "title" => q.Title,
        "description" => q.Description,
        "text" => $"{q.IssueKey} {q.Title} {q.Description}",
        "status" or "column" => q.Column?.Title,
        "statuscategory" or "category" => StatusCategory(q.Column?.Kind),
        "statusid" or "columnid" => q.ColumnId,
        "type" or "issuetype" => q.IssueTypeId is Guid typeId && context.Custom?.TypeName(typeId) is string typeName ? typeName : q.IssueType.ToString(),
        "priority" => q.Priority.ToString(),
        "assignee" => q.Assignees.Count > 0 ? string.Join(",", q.Assignees.OrderBy(a => a.Order).Select(a => a.UserId)) : q.AssigneeId,
        "reporter" => q.ReporterId,
        "votes" => q.Votes.Count,
        "voter" => string.Join(",", q.Votes.Select(v => v.UserId)),
        "watchers" => q.NotificationRecipients.Count,
        "watcher" => string.Join(",", q.NotificationRecipients.Select(r => r.UserId)),
        "sprint" => q.SprintId,
        "labels" or "label" => q.Labels,
        "component" => q.Component,
        "fixversion" or "version" => q.FixVersion,
        "storypoints" => q.StoryPoints,
        "created" => q.CreatedAt,
        "updated" => context.UpdatedAt(q),
        "duedate" => q.DueDate,
        "startdate" => q.StartDate,
        "resolution" or "resolved" or "resolutiondate" => q.CompletedAt,
        "board" or "boardid" => q.BoardId,
        // Key prefixes aren't unique across spaces, so the id is matched too.
        "project" or "space" => $"{q.Board?.KeyPrefix},{q.BoardId}",
        _ => context.Custom != null && context.Custom.TryGetValue(q, field, out var value) ? value : throw new ArgumentException($"Unsupported JQL field '{field}'")
    };

    private static object? SortKey(Quest q, string field, JqlContext context) => field.ToLowerInvariant() switch
    {
        "priority" => (int)q.Priority,
        "key" or "issuekey" => q.IssueNumber,
        "assignee" => q.Assignee?.DisplayName ?? q.Assignees.OrderBy(a => a.Order).Select(a => a.User?.DisplayName).FirstOrDefault(),
        var other => Field(q, other, context)
    };

    private static readonly Regex RelativeDate = new(@"^([+-]?)(\d+)\s*([mhdwMy])$", RegexOptions.Compiled);

    public static DateTime? ParseDate(object? value, DateTime now)
    {
        if (value is DateTime dt) return dt;
        var text = value?.ToString()?.Trim();
        if (string.IsNullOrEmpty(text)) return null;
        var match = RelativeDate.Match(text);
        if (match.Success)
        {
            var amount = int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture) * (match.Groups[1].Value == "-" ? -1 : 1);
            return match.Groups[3].Value switch
            {
                "m" => now.AddMinutes(amount),
                "h" => now.AddHours(amount),
                "d" => now.AddDays(amount),
                "w" => now.AddDays(amount * 7),
                "M" => now.AddMonths(amount),
                _ => now.AddYears(amount)
            };
        }
        return DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var parsed) ? parsed : null;
    }

    private static bool Compare(object? actual, object? expected, string op)
    {
        if (actual is null || expected is null) return false;
        if (actual is DateTime date)
        {
            var other = ParseDate(expected, DateTime.UtcNow);
            if (other == null) throw new ArgumentException($"Invalid date '{expected}'");
            var isDateOnly = expected is string s && !s.Contains(':') && !RelativeDate.IsMatch(s.Trim());
            var left = isDateOnly ? date.Date : date;
            var right = isDateOnly ? other.Value.Date : other.Value;
            return op switch { ">" => left > right, ">=" => left >= right, "<" => left < right, "<=" => left <= right, _ => left == right };
        }
        if (actual is Guid guid && Guid.TryParse(expected.ToString(), out var otherGuid))
            return guid == otherGuid;
        if (actual is int or decimal or double && decimal.TryParse(expected.ToString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var otherNumber))
        {
            var number = Convert.ToDecimal(actual, CultureInfo.InvariantCulture);
            return op switch { ">" => number > otherNumber, ">=" => number >= otherNumber, "<" => number < otherNumber, "<=" => number <= otherNumber, _ => number == otherNumber };
        }
        var leftText = actual.ToString() ?? "";
        var rightText = expected.ToString() ?? "";
        var cmp = string.Compare(leftText, rightText, StringComparison.OrdinalIgnoreCase);
        return op switch
        {
            "=" or "IN" => leftText.Split(',', StringSplitOptions.TrimEntries).Contains(rightText, StringComparer.OrdinalIgnoreCase),
            "~" => leftText.Contains(rightText, StringComparison.OrdinalIgnoreCase),
            "!~" => !leftText.Contains(rightText, StringComparison.OrdinalIgnoreCase),
            ">" => cmp > 0, ">=" => cmp >= 0, "<" => cmp < 0, "<=" => cmp <= 0,
            _ => false
        };
    }
}
