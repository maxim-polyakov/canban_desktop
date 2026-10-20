using System.Text.RegularExpressions;
using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CanbanServer.Infrastructure.Services;

/// <summary>
/// Jira-style @mentions. Text stores them as <c>@[Display Name](userId)</c>; a mentioned person gets an in-app
/// notification and an email, and on issues starts watching. Only people who can browse the space are notified.
/// </summary>
public class MentionService
{
    private static readonly Regex Token = new(@"@\[(?<name>[^\]\r\n]{1,120})\]\((?<id>[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)",
        RegexOptions.Compiled);

    private readonly CanbanDbContext _db;
    private readonly IEmailSender _email;
    private readonly PermissionSchemeService _permissions;
    private readonly string _siteUrl;
    private readonly string _logoUrl;

    public MentionService(CanbanDbContext db, IEmailSender email, PermissionSchemeService permissions, IConfiguration config)
    {
        _db = db;
        _email = email;
        _permissions = permissions;
        _siteUrl = EmailLayout.SiteUrl(config);
        _logoUrl = EmailLayout.LogoUrl(config);
    }

    public static HashSet<Guid> Parse(string? text) =>
        string.IsNullOrEmpty(text) ? new() : Token.Matches(text).Select(m => Guid.Parse(m.Groups["id"].Value)).ToHashSet();

    /// <summary>People mentioned in <paramref name="after"/> who were not already mentioned in <paramref name="before"/>.</summary>
    public static HashSet<Guid> Added(string? before, string? after)
    {
        var added = Parse(after);
        added.ExceptWith(Parse(before));
        return added;
    }

    public static string ToPlainText(string? text) => string.IsNullOrEmpty(text) ? "" : Token.Replace(text, "@${name}");

    public Task<List<Guid>> NotifyIssueAsync(Guid questId, Guid actorId, IEnumerable<Guid> userIds, string place, string? text, CancellationToken ct) =>
        NotifyAsync(questId, null, actorId, userIds, place, text, ct);

    public async Task<List<Guid>> NotifyDocumentAsync(Guid boardId, Guid documentId, string title, Guid actorId, IEnumerable<Guid> userIds, string? text, CancellationToken ct) =>
        await NotifyAsync(null, (boardId, documentId, title), actorId, userIds, "документе", text, ct);

    private async Task<List<Guid>> NotifyAsync(Guid? questId, (Guid BoardId, Guid Id, string Title)? document, Guid actorId,
        IEnumerable<Guid> userIds, string place, string? text, CancellationToken ct)
    {
        var ids = userIds.Where(id => id != actorId).Distinct().ToList();
        if (ids.Count == 0) return new();

        var issue = questId.HasValue
            ? await _db.Quests.AsNoTracking().Where(q => q.Id == questId).Select(q => new { q.BoardId, q.IssueKey, q.Title, BoardName = q.Board.Name }).FirstOrDefaultAsync(ct)
            : null;
        if (questId.HasValue && issue == null) return new();
        var boardId = issue?.BoardId ?? document!.Value.BoardId;
        var boardName = issue?.BoardName ?? await _db.Boards.AsNoTracking().Where(b => b.Id == boardId).Select(b => b.Name).FirstOrDefaultAsync(ct) ?? "";

        var users = await _db.Users.AsNoTracking().Where(u => ids.Contains(u.Id)).ToListAsync(ct);
        var allowed = new List<User>();
        foreach (var user in users)
            if (await _permissions.HasAsync(boardId, user.Id, JiraPermissions.Browse, ct)) allowed.Add(user);
        if (allowed.Count == 0) return new();

        var actorName = await _db.Users.AsNoTracking().Where(u => u.Id == actorId).Select(u => u.DisplayName).FirstOrDefaultAsync(ct) ?? "Пользователь";
        var subjectLabel = issue != null
            ? (string.IsNullOrEmpty(issue.IssueKey) ? issue.Title : $"{issue.IssueKey} {issue.Title}")
            : document!.Value.Title;
        var link = issue != null ? $"/board/{boardId}/issue/{questId}" : $"/board/{boardId}/docs/{document!.Value.Id}";
        var title = $"{actorName} упомянул(а) вас в {place}";
        var preview = ToPlainText(text).Trim();
        if (preview.Length > 500) preview = preview[..500] + "…";

        var watching = questId.HasValue
            ? await _db.QuestNotificationRecipients.Where(r => r.QuestId == questId).Select(r => r.UserId).ToListAsync(ct)
            : new List<Guid>();
        foreach (var user in allowed)
        {
            _db.AppNotifications.Add(new AppNotification
            {
                Id = Guid.NewGuid(), UserId = user.Id, QuestId = questId, Type = "Mention", Title = title,
                Body = issue == null ? $"{document!.Value.Title}: {preview}" : preview, Link = link, CreatedAt = DateTime.UtcNow,
            });
            if (questId.HasValue && !watching.Contains(user.Id))
                _db.QuestNotificationRecipients.Add(new QuestNotificationRecipient { Id = Guid.NewGuid(), QuestId = questId.Value, UserId = user.Id });
        }
        await _db.SaveChangesAsync(ct);

        foreach (var user in allowed.Where(u => u.EmailNotificationsEnabled && !string.IsNullOrWhiteSpace(u.Email)))
        {
            var content = $"""
                <p style="margin:0 0 12px">Здравствуйте, <strong>{EmailLayout.Encode(user.DisplayName)}</strong>.</p>
                <p style="margin:0 0 12px"><strong>{EmailLayout.Encode(actorName)}</strong> упомянул(а) вас в {EmailLayout.Encode(place)}
                «{EmailLayout.Encode(subjectLabel)}» в разделе «{EmailLayout.Encode(boardName)}».</p>
                <div style="margin:16px 0 0;padding:12px 16px;background:#f7f8f9;border-left:3px solid #0c66e4;border-radius:4px;white-space:pre-wrap">{EmailLayout.Encode(preview)}</div>
                """;
            var body = EmailLayout.Render(_siteUrl, _logoUrl, title, content, issue != null ? "Открыть задачу" : "Открыть документ", _siteUrl + link,
                "Вы получили это письмо, потому что вас упомянули. Настроить письма можно в разделе «Персональные настройки → Электронные письма и уведомления».");
            await _email.SendAsync(user.Email, user.DisplayName, $"{actorName} упомянул(а) вас: {subjectLabel}", body, ct,
                plainTextOnly: user.EmailFormat == "text");
        }
        return allowed.Select(u => u.Id).ToList();
    }
}
