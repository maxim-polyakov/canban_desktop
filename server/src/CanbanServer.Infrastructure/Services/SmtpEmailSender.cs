using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MimeKit;
using CanbanServer.Application.Contracts;

namespace CanbanServer.Infrastructure.Services;

public class SmtpEmailSender : IEmailSender
{
    private readonly IConfiguration _config;
    private readonly ILogger<SmtpEmailSender> _logger;
    private readonly string? _host;
    private readonly int _port;
    private readonly bool _useSsl;
    private readonly string? _user;
    private readonly string? _password;
    private readonly string _fromAddress;
    private readonly string _fromName;

    public SmtpEmailSender(IConfiguration config, ILogger<SmtpEmailSender> logger)
    {
        _config = config;
        _logger = logger;
        _host = _config["Smtp:Host"]?.Trim();
        _port = int.TryParse(_config["Smtp:Port"], out var p) ? p : 1025;
        _useSsl = string.Equals(_config["Smtp:UseSsl"], "true", StringComparison.OrdinalIgnoreCase);
        _user = _config["Smtp:User"]?.Trim();
        _password = _config["Smtp:Password"]?.Trim();
        _fromAddress = _config["Smtp:FromAddress"]?.Trim() ?? "noreply@canban.local";
        _fromName = _config["Smtp:FromName"]?.Trim() ?? "Canban";
    }

    public async Task<bool> SendAsync(string toEmail, string toName, string subject, string bodyHtml, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(_host))
        {
            _logger.LogDebug("SMTP не настроен (Smtp:Host пуст), письмо не отправлено: {Subject}", subject);
            return true;
        }

        if (string.IsNullOrWhiteSpace(toEmail))
            return false;

        try
        {
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(_fromName, _fromAddress));
            message.To.Add(new MailboxAddress(toName, toEmail.Trim()));
            message.Subject = subject;
            message.Body = new BodyBuilder { HtmlBody = bodyHtml }.ToMessageBody();

            using var client = new SmtpClient();
            var secureSocketOptions = _useSsl ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.None;
            await client.ConnectAsync(_host, _port, secureSocketOptions, ct);
            if (!string.IsNullOrEmpty(_user) && !string.IsNullOrEmpty(_password))
                await client.AuthenticateAsync(_user, _password, ct);
            await client.SendAsync(message, ct);
            await client.DisconnectAsync(true, ct);
            _logger.LogInformation("Письмо отправлено: {To} — {Subject}", toEmail, subject);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка отправки письма на {To}: {Subject}", toEmail, subject);
            return false;
        }
    }
}
