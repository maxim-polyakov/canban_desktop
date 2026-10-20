using System.Net;
using Microsoft.Extensions.Configuration;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Branded HTML shell for all outgoing emails. Mail clients ignore &lt;style&gt; blocks, so everything is inline and table-based.</summary>
public static class EmailLayout
{
    public const string DefaultSiteUrl = "https://kanban.baxic.ru";

    public static string SiteUrl(IConfiguration config) =>
        (config["Email:SiteUrl"] ?? config["Auth:FrontendCallbackUrl"] ?? DefaultSiteUrl).Trim().TrimEnd('/');

    public static string LogoUrl(IConfiguration config) =>
        config["Email:LogoUrl"]?.Trim() is { Length: > 0 } url ? url : $"{SiteUrl(config)}/favicon-192x192.png";

    public static string Encode(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);

    /// <param name="contentHtml">Already-encoded HTML for the card body.</param>
    public static string Render(string siteUrl, string logoUrl, string title, string contentHtml,
        string? actionText = null, string? actionUrl = null, string? footerText = null)
    {
        var button = string.IsNullOrEmpty(actionText) || string.IsNullOrEmpty(actionUrl) ? "" : $"""
            <tr><td style="padding:8px 32px 28px">
              <a href="{Encode(actionUrl)}" style="display:inline-block;padding:10px 20px;background:#0c66e4;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:600;font-size:14px">{Encode(actionText)}</a>
            </td></tr>
            """;
        var footer = Encode(footerText ?? "Это письмо отправлено автоматически, не отвечайте на него.");
        return $"""
            <!DOCTYPE html>
            <html lang="ru">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>{Encode(title)}</title>
            </head>
            <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#172b4d">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7">
                <tr><td align="center" style="padding:32px 16px">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
                    <tr><td style="padding:0 4px 20px">
                      <a href="{Encode(siteUrl)}" style="text-decoration:none;color:#172b4d">
                        <img src="{Encode(logoUrl)}" width="40" height="40" alt="Канбан" style="vertical-align:middle;border:0;border-radius:8px">
                        <span style="vertical-align:middle;margin-left:10px;font-size:20px;font-weight:700">Канбан</span>
                      </a>
                    </td></tr>
                    <tr><td style="background:#ffffff;border-radius:8px;border:1px solid #dfe1e6">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr><td style="padding:28px 32px 8px">
                          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#172b4d">{Encode(title)}</h1>
                          <div style="font-size:14px;line-height:1.6;color:#172b4d">{contentHtml}</div>
                        </td></tr>
                        {button}
                      </table>
                    </td></tr>
                    <tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.5;color:#6b778c">
                      {footer}<br>
                      <a href="{Encode(siteUrl)}" style="color:#6b778c">{Encode(siteUrl.Replace("https://", "").Replace("http://", ""))}</a>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """;
    }

    public static string Code(string code) =>
        $"""<p style="margin:16px 0;font-size:28px;letter-spacing:0.25em;font-weight:700;font-family:Consolas,'Courier New',monospace;color:#172b4d">{Encode(code)}</p>""";
}
