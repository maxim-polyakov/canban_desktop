namespace CanbanServer.Application.Contracts;

/// <summary>Отправка email через SMTP.</summary>
public interface IEmailSender
{
    /// <param name="plainTextOnly">Send only a text/plain part (the recipient chose the "text" email format).</param>
    Task<bool> SendAsync(string toEmail, string toName, string subject, string bodyHtml, CancellationToken ct = default, bool plainTextOnly = false);
}
