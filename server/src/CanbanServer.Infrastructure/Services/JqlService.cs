using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public sealed class JqlService : IJqlQueryService
{
    private readonly CanbanDbContext _db;
    public JqlService(CanbanDbContext db) => _db = db;
    public JqlQuery Parse(string text) => new JqlParser(text).Parse();

    public async Task<JqlSearchResult> SearchAsync(string text, Guid userId, int page, int pageSize, Guid? boardId, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var offset = (page - 1) * pageSize;
        var ast = Parse(text);
        var query = _db.Quests.AsNoTracking()
            .Include(q => q.Column).Include(q => q.Sprint).Include(q => q.Assignee)
            .Include(q => q.Assignees).ThenInclude(a => a.User)
            .Include(q => q.NotificationRecipients).Include(q => q.ExternalNotificationRecipients)
            .Where(q => q.Board.Team.OwnerId == userId || q.Board.Team.Members.Any(m => m.UserId == userId));
        if (boardId.HasValue) query = query.Where(q => q.BoardId == boardId);
        var values = await query.ToListAsync(ct);
        var filtered = ast.Where == null ? values : values.Where(q => Match(ast.Where, q, userId)).ToList();
        IOrderedEnumerable<Quest>? ordered = null;
        foreach (var item in ast.OrderBy)
        {
            Func<Quest, object?> key = q => Field(q, item.Field, userId);
            ordered = ordered == null
                ? (item.Descending ? filtered.OrderByDescending(key) : filtered.OrderBy(key))
                : (item.Descending ? ordered.ThenByDescending(key) : ordered.ThenBy(key));
        }
        var result = (ordered ?? filtered.OrderByDescending(q => q.CreatedAt)).ToList();
        return new JqlSearchResult(result.Skip(offset).Take(pageSize).Select(BoardService.MapQuest).ToList(), result.Count, page, pageSize);
    }

    private static bool Match(JqlNode node, Quest q, Guid userId) => node switch
    {
        JqlBinary b when b.Operator == "AND" => Match(b.Left, q, userId) && Match(b.Right, q, userId),
        JqlBinary b => Match(b.Left, q, userId) || Match(b.Right, q, userId),
        JqlNot n => !Match(n.Operand, q, userId),
        JqlPredicate p => MatchPredicate(p, q, userId),
        _ => false
    };

    private static bool MatchPredicate(JqlPredicate p, Quest q, Guid userId)
    {
        var actual = Field(q, p.Field, userId);
        if (p.Operator == "IS EMPTY") return actual == null || actual.ToString() == "";
        if (p.Operator == "IS NOT EMPTY") return actual != null && actual.ToString() != "";
        var expected = p.Values.Select(v => Resolve(v, userId, q)).ToList();
        var comparisons = expected.Select(e => Compare(actual, e, p.Operator)).ToList();
        return p.Operator == "NOT IN" ? comparisons.All(x => !x) : comparisons.Any(x => x);
    }

    private static object? Resolve(JqlValue value, Guid userId, Quest q) =>
        value.IsFunction && value.Value.Equals("currentUser", StringComparison.OrdinalIgnoreCase) ? userId :
        value.IsFunction && value.Value.Equals("openSprints", StringComparison.OrdinalIgnoreCase) ? q.Sprint?.Status == SprintStatus.Active ? q.SprintId : null :
        value.Value;

    private static object? Field(Quest q, string field, Guid userId) => field.ToLowerInvariant() switch
    {
        "key" or "issuekey" => q.IssueKey,
        "summary" or "title" => q.Title,
        "description" => q.Description,
        "status" or "column" => q.Column.Title,
        "statusid" or "columnid" => q.ColumnId,
        "type" or "issuetype" => q.IssueType.ToString(),
        "priority" => q.Priority.ToString(),
        "assignee" => q.Assignees.Count > 0 ? string.Join(",", q.Assignees.OrderBy(a => a.Order).Select(a => a.UserId)) : q.AssigneeId,
        "reporter" => null,
        "sprint" => q.SprintId,
        "labels" or "label" => q.Labels,
        "component" => q.Component,
        "fixversion" or "version" => q.FixVersion,
        "storypoints" => q.StoryPoints,
        "created" => q.CreatedAt,
        "updated" => q.CreatedAt,
        "duedate" => q.DueDate,
        "resolution" => q.CompletedAt,
        "board" or "boardid" => q.BoardId,
        _ => throw new ArgumentException($"Unsupported JQL field '{field}'")
    };

    private static bool Compare(object? actual, object? expected, string op)
    {
        if (actual is null || expected is null) return op == "!=" && actual != expected;
        if (actual is Guid guid && Guid.TryParse(expected.ToString(), out var otherGuid))
            return op == "!=" ? guid != otherGuid : guid == otherGuid;
        if (decimal.TryParse(actual.ToString(), out var number) && decimal.TryParse(expected.ToString(), out var other))
            return op switch { ">" => number > other, ">=" => number >= other, "<" => number < other, "<=" => number <= other, "!=" => number != other, _ => number == other };
        var left = actual.ToString() ?? "";
        var right = expected.ToString() ?? "";
        var cmp = string.Compare(left, right, StringComparison.OrdinalIgnoreCase);
        return op switch
        {
            "=" or "IN" or "NOT IN" => left.Split(',', StringSplitOptions.TrimEntries).Contains(right, StringComparer.OrdinalIgnoreCase),
            "!=" => cmp != 0,
            "~" => left.Contains(right, StringComparison.OrdinalIgnoreCase),
            "!~" => !left.Contains(right, StringComparison.OrdinalIgnoreCase),
            ">" => cmp > 0, ">=" => cmp >= 0, "<" => cmp < 0, "<=" => cmp <= 0,
            _ => false
        };
    }
}
