using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CanbanServer.Infrastructure.Services;

public class QuestNotificationService : IQuestNotificationService
{
    private readonly CanbanDbContext _db;
    private readonly IEmailSender _emailSender;
    private readonly string _siteUrl;
    private readonly string _logoUrl;

    public QuestNotificationService(CanbanDbContext db, IEmailSender emailSender, IConfiguration config)
    {
        _db = db;
        _emailSender = emailSender;
        _siteUrl = EmailLayout.SiteUrl(config);
        _logoUrl = EmailLayout.LogoUrl(config);
    }

    /// <summary>
    /// Mirrors Jira's personal email settings: assignees and reporters can opt out per role,
    /// plain watchers follow the master switch, and your own changes are skipped unless enabled.
    /// </summary>
    public static bool ShouldEmail(User recipient, Guid actorUserId, bool isAssignee, bool isReporter)
    {
        if (!recipient.EmailNotificationsEnabled || string.IsNullOrWhiteSpace(recipient.Email)) return false;
        if (recipient.Id == actorUserId && !recipient.EmailOwnChanges) return false;
        if (isAssignee || isReporter)
            return (isAssignee && recipient.EmailWhenAssignee) || (isReporter && recipient.EmailWhenReporter);
        return true;
    }

    public async Task NotifyAsync(Guid questId, Guid actorUserId, string eventTitle, string details, CancellationToken ct = default)
    {
        var context = await _db.Quests.AsNoTracking()
            .Where(q => q.Id == questId)
            .Select(q => new
            {
                q.Title, q.IssueKey, q.ReporterId, q.BoardId, BoardName = q.Board.Name,
                AssigneeIds = q.Assignees.Select(a => a.UserId).ToList(), q.AssigneeId
            })
            .FirstOrDefaultAsync(ct);
        if (context == null) return;

        var actor = await _db.Users.FirstOrDefaultAsync(u => u.Id == actorUserId, ct);
        var actorName = actor?.DisplayName ?? "Пользователь";
        var watcherIds = await _db.QuestNotificationRecipients
            .Where(r => r.QuestId == questId)
            .Select(r => r.UserId)
            .ToListAsync(ct);
        if (actor is { AutoWatch: true } && !watcherIds.Contains(actorUserId))
        {
            _db.QuestNotificationRecipients.Add(new QuestNotificationRecipient { Id = Guid.NewGuid(), QuestId = questId, UserId = actorUserId });
            watcherIds.Add(actorUserId);
        }

        var assigneeIds = context.AssigneeIds.ToHashSet();
        if (context.AssigneeId.HasValue) assigneeIds.Add(context.AssigneeId.Value);
        var recipientIds = watcherIds.ToHashSet();
        if (context.ReporterId.HasValue) recipientIds.Add(context.ReporterId.Value);
        var recipients = await _db.Users.AsNoTracking().Where(u => recipientIds.Contains(u.Id)).ToListAsync(ct);
        var externalRecipients = await _db.QuestExternalNotificationRecipients.AsNoTracking()
            .Where(r => r.QuestId == questId)
            .Select(r => new { r.Email, r.DisplayName })
            .ToListAsync(ct);

        var issueLabel = string.IsNullOrEmpty(context.IssueKey) ? context.Title : $"{context.IssueKey} {context.Title}";
        var subject = $"{eventTitle}: {issueLabel}";
        var issueUrl = $"{_siteUrl}/board/{context.BoardId}/issue/{questId}";
        var sentEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var recipient in recipients)
        {
            if (recipient.Id != actorUserId)
            {
                _db.AppNotifications.Add(new AppNotification
                {
                    Id = Guid.NewGuid(), UserId = recipient.Id, QuestId = questId, Type = "Quest",
                    Title = eventTitle, Body = details, CreatedAt = DateTime.UtcNow
                });
            }
            var isAssignee = assigneeIds.Contains(recipient.Id);
            var isReporter = context.ReporterId == recipient.Id;
            if (!ShouldEmail(recipient, actorUserId, isAssignee, isReporter) || !sentEmails.Add(recipient.Email)) continue;
            var body = BuildBody(eventTitle, recipient.DisplayName, issueLabel, context.BoardName, actorName, details, issueUrl, true);
            await _emailSender.SendAsync(recipient.Email, recipient.DisplayName, subject, body, ct, plainTextOnly: recipient.EmailFormat == "text");
        }

        foreach (var recipient in externalRecipients)
        {
            if (!sentEmails.Add(recipient.Email)) continue;
            var displayName = string.IsNullOrWhiteSpace(recipient.DisplayName) ? recipient.Email : recipient.DisplayName;
            var body = BuildBody(eventTitle, displayName, issueLabel, context.BoardName, actorName, details, issueUrl, false);
            await _emailSender.SendAsync(recipient.Email, displayName, subject, body, ct);
        }
        await _db.SaveChangesAsync(ct);
    }

    private string BuildBody(string eventTitle, string recipientName, string issue, string boardName, string actorName, string details,
        string issueUrl, bool isMember)
    {
        static string Encode(string? value) => EmailLayout.Encode(value);
        static string Row(string label, string value) =>
            $"""<tr><td style="padding:4px 16px 4px 0;color:#6b778c;white-space:nowrap;vertical-align:top">{Encode(label)}</td><td style="padding:4px 0;font-weight:600">{Encode(value)}</td></tr>""";
        var detailsHtml = string.IsNullOrWhiteSpace(details) ? "" : $"""
            <div style="margin:16px 0 0;padding:12px 16px;background:#f7f8f9;border-left:3px solid #0c66e4;border-radius:4px;white-space:pre-wrap">{Encode(details)}</div>
            """;
        var content = $"""
            <p style="margin:0 0 12px">Здравствуйте, <strong>{Encode(recipientName)}</strong>.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px">
              {Row("Задача", issue)}
              {Row("Раздел", boardName)}
              {Row("Изменил", actorName)}
            </table>
            {detailsHtml}
            """;
        var footer = isMember
            ? "Это письмо отправлено автоматически. Настроить уведомления можно в разделе «Персональные настройки → Электронные письма и уведомления»."
            : "Это письмо отправлено автоматически, потому что ваш адрес указан для уведомлений по этой задаче.";
        return EmailLayout.Render(_siteUrl, _logoUrl, eventTitle, content,
            isMember ? "Открыть задачу" : null, isMember ? issueUrl : null, footer);
    }
}
