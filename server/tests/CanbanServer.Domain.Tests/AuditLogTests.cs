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

    [Fact]
    public void Diff_lists_changed_fields_and_masks_secrets()
    {
        var before = new Dictionary<string, string?> { ["Name"] = "Old", ["Kind"] = "Todo", ["SecretConfigurationKey"] = "a", ["Labels"] = "" };
        var after = new Dictionary<string, string?> { ["Name"] = "New", ["Kind"] = "Todo", ["SecretConfigurationKey"] = "b", ["Labels"] = null };
        var changes = AuditLogService.Diff(before, after);
        Assert.Equal(2, changes.Count);
        Assert.Contains(new AuditChange("Name", "Old", "New"), changes);
        Assert.Contains(new AuditChange("SecretConfigurationKey", "***", "***"), changes);
    }

    [Fact]
    public void Diff_for_creation_and_deletion()
    {
        var snapshot = new Dictionary<string, string?> { ["Name"] = "Board", ["Description"] = null };
        Assert.Equal(new[] { new AuditChange("Name", null, "Board") }, AuditLogService.Diff(null, snapshot));
        Assert.Equal(new[] { new AuditChange("Name", "Board", null) }, AuditLogService.Diff(snapshot, null));
        Assert.Empty(AuditLogService.Diff(null, null));
    }

    [Fact]
    public void Long_values_are_clipped_and_values_formatted()
    {
        var change = Assert.Single(AuditLogService.Diff(new Dictionary<string, string?> { ["Description"] = "a" }, new Dictionary<string, string?> { ["Description"] = new string('x', 1000) }));
        Assert.Equal(AuditLogService.MaxChangeValueLength, change.To!.Length);
        Assert.Equal("2026-10-20 06:00:00", AuditLogService.FormatValue("At", new DateTime(2026, 10, 20, 6, 0, 0, DateTimeKind.Utc)));
        Assert.Equal("true", AuditLogService.FormatValue("Enabled", true));
        Assert.Equal("1.5", AuditLogService.FormatValue("Points", 1.5m));
    }

    [Fact]
    public void Details_keep_changes_when_request_is_too_large()
    {
        var json = AuditLogService.SerializeDetails(
            new Dictionary<string, object?> { ["text"] = new string('x', AuditLogService.MaxDetailsLength) },
            new[] { new AuditChange("Name", "A", "B") })!;
        using var doc = JsonDocument.Parse(json);
        Assert.False(doc.RootElement.TryGetProperty("text", out _));
        Assert.Equal("B", doc.RootElement.GetProperty("changes")[0].GetProperty("to").GetString());
    }
}
