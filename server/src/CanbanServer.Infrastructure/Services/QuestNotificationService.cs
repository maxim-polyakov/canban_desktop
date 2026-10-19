using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public class QuestNotificationService : IQuestNotificationService
{
    private readonly CanbanDbContext _db;
    private readonly IEmailSender _emailSender;

    public QuestNotificationService(CanbanDbContext db, IEmailSender emailSender)
    {
        _db = db;
        _emailSender = emailSender;
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
                q.Title, q.IssueKey, q.ReporterId, BoardName = q.Board.Name,
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
            var body = BuildBody(eventTitle, recipient.DisplayName, issueLabel, context.BoardName, actorName, details);
            if (recipient.EmailFormat == "text") body = SmtpEmailSender.HtmlToText(body);
            await _emailSender.SendAsync(recipient.Email, recipient.DisplayName, subject, body, ct);
        }

        foreach (var recipient in externalRecipients)
        {
            if (!sentEmails.Add(recipient.Email)) continue;
            var displayName = string.IsNullOrWhiteSpace(recipient.DisplayName) ? recipient.Email : recipient.DisplayName;
            var body = BuildBody(eventTitle, displayName, issueLabel, context.BoardName, actorName, details);
            await _emailSender.SendAsync(recipient.Email, displayName, subject, body, ct);
        }
        await _db.SaveChangesAsync(ct);
    }

    private static string BuildBody(string eventTitle, string recipientName, string issue, string boardName, string actorName, string details)
    {
        static string Encode(string? value) => System.Net.WebUtility.HtmlEncode(value) ?? string.Empty;
        return $"""
            <!DOCTYPE html>
            <html><head><meta charset="utf-8"></head>
            <body style="font-family:sans-serif;line-height:1.5">
              <h2>{Encode(eventTitle)}</h2>
              <p>Здравствуйте, <strong>{Encode(recipientName)}</strong>.</p>
              <p>Задача: <strong>{Encode(issue)}</strong></p>
              <p>Доска: <strong>{Encode(boardName)}</strong></p>
              <p>Изменил: <strong>{Encode(actorName)}</strong></p>
              <p>{Encode(details)}</p>
              <p style="color:#6b7280;font-size:.9em">Это письмо отправлено автоматически. Настроить уведомления можно в разделе «Персональные настройки → Электронные письма и уведомления».</p>
            </body></html>
            """;
    }
}
