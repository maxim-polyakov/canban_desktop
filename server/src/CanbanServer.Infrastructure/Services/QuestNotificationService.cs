using CanbanServer.Application.Contracts;
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

    public async Task NotifyAsync(Guid questId, Guid actorUserId, string eventTitle, string details, CancellationToken ct = default)
    {
        var context = await _db.Quests.AsNoTracking()
            .Where(q => q.Id == questId)
            .Select(q => new { q.Title, BoardName = q.Board.Name })
            .FirstOrDefaultAsync(ct);
        if (context == null) return;

        var actorName = await _db.Users.AsNoTracking()
            .Where(u => u.Id == actorUserId)
            .Select(u => u.DisplayName)
            .FirstOrDefaultAsync(ct) ?? "Пользователь";
        var recipients = await _db.QuestNotificationRecipients.AsNoTracking()
            .Where(r => r.QuestId == questId)
            .Select(r => r.User)
            .Distinct()
            .ToListAsync(ct);
        var externalRecipients = await _db.QuestExternalNotificationRecipients.AsNoTracking()
            .Where(r => r.QuestId == questId)
            .Select(r => new { r.Email, r.DisplayName })
            .ToListAsync(ct);

        static string Encode(string? value) => System.Net.WebUtility.HtmlEncode(value) ?? string.Empty;
        var sentEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var recipient in recipients)
        {
            if (!sentEmails.Add(recipient.Email)) continue;
            var body = $"""
                <!DOCTYPE html>
                <html><head><meta charset="utf-8"></head>
                <body style="font-family:sans-serif;line-height:1.5">
                  <h2>{Encode(eventTitle)}</h2>
                  <p>Здравствуйте, <strong>{Encode(recipient.DisplayName)}</strong>.</p>
                  <p>Задача: <strong>{Encode(context.Title)}</strong></p>
                  <p>Доска: <strong>{Encode(context.BoardName)}</strong></p>
                  <p>Изменил: <strong>{Encode(actorName)}</strong></p>
                  <p>{Encode(details)}</p>
                  <p style="color:#6b7280;font-size:.9em">Это письмо отправлено автоматически.</p>
                </body></html>
                """;
            await _emailSender.SendAsync(recipient.Email, recipient.DisplayName, $"{eventTitle}: {context.Title}", body, ct);
        }

        foreach (var recipient in externalRecipients)
        {
            if (!sentEmails.Add(recipient.Email)) continue;
            var displayName = string.IsNullOrWhiteSpace(recipient.DisplayName) ? recipient.Email : recipient.DisplayName;
            var body = $"""
                <!DOCTYPE html>
                <html><head><meta charset="utf-8"></head>
                <body style="font-family:sans-serif;line-height:1.5">
                  <h2>{Encode(eventTitle)}</h2>
                  <p>Здравствуйте, <strong>{Encode(displayName)}</strong>.</p>
                  <p>Задача: <strong>{Encode(context.Title)}</strong></p>
                  <p>Доска: <strong>{Encode(context.BoardName)}</strong></p>
                  <p>Изменил: <strong>{Encode(actorName)}</strong></p>
                  <p>{Encode(details)}</p>
                  <p style="color:#6b7280;font-size:.9em">Это письмо отправлено автоматически.</p>
                </body></html>
                """;
            await _emailSender.SendAsync(recipient.Email, displayName, $"{eventTitle}: {context.Title}", body, ct);
        }
    }
}
