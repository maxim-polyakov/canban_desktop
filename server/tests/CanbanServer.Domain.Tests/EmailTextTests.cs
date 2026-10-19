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
}
