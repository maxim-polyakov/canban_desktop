using System.Text.Json;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class AuditLogTests
{
    private sealed record WebhookRequest(string Url, string? Secret, Dictionary<string, string> Headers);

    [Fact]
    public void Details_mask_credentials_at_any_depth()
    {
        var json = AuditLogService.SerializeDetails(new Dictionary<string, object?>
        {
            ["request"] = new WebhookRequest("https://example.test/hook", "s3cr3t", new() { ["X-Api-Key"] = "k", ["Accept"] = "json" }),
            ["password"] = "hunter2",
        })!;

        using var doc = JsonDocument.Parse(json);
        var request = doc.RootElement.GetProperty("request");
        Assert.Equal("https://example.test/hook", request.GetProperty("url").GetString());
        Assert.Equal("***", request.GetProperty("secret").GetString());
        Assert.Equal("***", request.GetProperty("headers").GetProperty("X-Api-Key").GetString());
        Assert.Equal("json", request.GetProperty("headers").GetProperty("Accept").GetString());
        Assert.Equal("***", doc.RootElement.GetProperty("password").GetString());
        Assert.DoesNotContain("s3cr3t", json);
        Assert.DoesNotContain("hunter2", json);
    }

    [Fact]
    public void Details_are_dropped_when_empty_or_too_large()
    {
        Assert.Null(AuditLogService.SerializeDetails(new Dictionary<string, object?>()));
        Assert.Null(AuditLogService.SerializeDetails(new Dictionary<string, object?> { ["text"] = new string('x', AuditLogService.MaxDetailsLength) }));
    }

    [Theory]
    [InlineData("workflow.transition.save", "workflow")]
    [InlineData("member.add", "member")]
    [InlineData("custom", "custom")]
    public void Category_is_first_segment(string action, string category) =>
        Assert.Equal(category, AuditLogService.CategoryOf(action));

    [Theory]
    [InlineData("plain", "plain")]
    [InlineData("a,b", "\"a,b\"")]
    [InlineData("say \"hi\"", "\"say \"\"hi\"\"\"")]
    [InlineData("=HYPERLINK(1)", "'=HYPERLINK(1)")]
    public void Csv_cells_are_escaped(string value, string expected) =>
        Assert.Equal(expected, AuditLogService.CsvCell(value));
}
