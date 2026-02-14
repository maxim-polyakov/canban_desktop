namespace CanbanServer.Application.Contracts;

/// <summary>Отправка email через SMTP.</summary>
public interface IEmailSender
{
    Task<bool> SendAsync(string toEmail, string toName, string subject, string bodyHtml, CancellationToken ct = default);
}
