using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class EmailTextTests
{
    [Fact]
    public void HtmlToText_KeepsContentAndDropsMarkup()
    {
        var text = SmtpEmailSender.HtmlToText("""
            <!DOCTYPE html><html><head><meta charset="utf-8"><title>x</title></head>
            <body><h2>Задача изменена</h2><p>Задача: <strong>A &amp; B</strong></p></body></html>
            """);

        Assert.Equal("Задача изменена\nЗадача: A & B", text);
    }

    [Fact]
    public void HtmlToText_SeparatesTableCells()
    {
        var text = SmtpEmailSender.HtmlToText("<table><tr><td>Раздел</td> <td><b>Lotus</b></td></tr><tr><td>Изменил</td><td>Анна</td></tr></table>");
        Assert.Equal("Раздел: Lotus\nИзменил: Анна", text);
    }

    [Fact]
    public void Layout_HasLogoButtonAndEncodesContent()
    {
        var html = EmailLayout.Render("https://canban.baxic.ru", "https://canban.baxic.ru/favicon-192x192.png", "Задача <изменена>",
            "<p>Тело</p>", "Открыть задачу", "https://canban.baxic.ru/board/b/issue/q?a=1&b=2");

        Assert.StartsWith("<!DOCTYPE html>", html);
        Assert.Contains("""<img src="https://canban.baxic.ru/favicon-192x192.png" """, html);
        Assert.Contains("Задача &lt;изменена&gt;", html);
        Assert.Contains("""href="https://canban.baxic.ru/board/b/issue/q?a=1&amp;b=2" """, html);

        var text = SmtpEmailSender.HtmlToText(html);
        Assert.Contains("Открыть задачу: https://canban.baxic.ru/board/b/issue/q?a=1&b=2", text);
        Assert.Contains("Тело", text);
        Assert.Contains("Задача <изменена>", text);
        Assert.DoesNotMatch("<(td|img|a|table|p)\\b", text);
    }

    [Fact]
    public void Layout_OmitsButtonWithoutAction()
    {
        var html = EmailLayout.Render("https://canban.baxic.ru", "https://x/logo.png", "Код", EmailLayout.Code("123456"));
        Assert.DoesNotContain("#0c66e4;color:#ffffff", html);
        Assert.Contains("123456", SmtpEmailSender.HtmlToText(html));
    }
}
