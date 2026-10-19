using System.Text.Json.Nodes;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class DashboardTests
{
    private static int WidgetCount(JsonObject layout) =>
        layout["rows"]!.AsArray().Sum(r => r!["widgets"]!.AsArray().Count);

    [Fact]
    public void Access_RespectsViewersAndEditors()
    {
        var owner = Guid.NewGuid();
        var mate = Guid.NewGuid();
        var stranger = Guid.NewGuid();
        var mateColleagues = new HashSet<Guid> { mate, owner };
        var strangerColleagues = new HashSet<Guid> { stranger };
        var dashboard = new Dashboard { OwnerUserId = owner, Viewers = DashboardService.Private, Editors = DashboardService.Private };

        Assert.True(DashboardService.CanView(dashboard, owner, new HashSet<Guid> { owner }));
        Assert.False(DashboardService.CanView(dashboard, mate, mateColleagues));

        dashboard.Viewers = DashboardService.Org;
        Assert.True(DashboardService.CanView(dashboard, mate, mateColleagues));
        Assert.False(DashboardService.CanEdit(dashboard, mate, mateColleagues));
        Assert.False(DashboardService.CanView(dashboard, stranger, strangerColleagues));

        dashboard.Editors = DashboardService.Org;
        Assert.True(DashboardService.CanEdit(dashboard, mate, mateColleagues));
        Assert.False(DashboardService.CanEdit(dashboard, stranger, strangerColleagues));
    }

    [Theory]
    [InlineData("space-team", 9)]
    [InlineData("devops", 6)]
    [InlineData("my-work", 6)]
    [InlineData(DashboardService.DefaultTemplate, 4)]
    public void Templates_BuildExpectedWidgets(string template, int widgets)
    {
        var layout = DashboardService.BuildTemplateLayout(template, Array.Empty<string>());
        Assert.Equal(widgets, WidgetCount(layout));
        Assert.Equal(layout.ToJsonString(), DashboardService.ValidateLayout(layout).ToJsonString());
    }

    [Fact]
    public void BlankTemplate_UsesCategories()
    {
        Assert.Equal(0, WidgetCount(DashboardService.BuildTemplateLayout("blank", Array.Empty<string>())));
        Assert.Single(DashboardService.BuildTemplateLayout("blank", Array.Empty<string>())["rows"]!.AsArray());
        var layout = DashboardService.BuildTemplateLayout("blank", new[] { "jira", "goals" });
        Assert.Equal(2, layout["rows"]!.AsArray().Count);
        Assert.Equal(5, WidgetCount(layout));
    }

    [Fact]
    public void ValidateLayout_RejectsOverfullRowsAndUnknownWidgets()
    {
        var tooWide = JsonNode.Parse("""{"rows":[{"id":"r1","widgets":[{"id":"a","type":"count_by","size":2},{"id":"b","type":"issue_table","size":2}]}]}""")!.AsObject();
        Assert.Throws<ArgumentException>(() => DashboardService.ValidateLayout(tooWide));
        var unknown = JsonNode.Parse("""{"rows":[{"id":"r1","widgets":[{"id":"a","type":"html"}]}]}""")!.AsObject();
        Assert.Throws<ArgumentException>(() => DashboardService.ValidateLayout(unknown));
        var duplicateIds = JsonNode.Parse("""{"rows":[{"id":"r1","widgets":[{"id":"a","type":"count_by"},{"id":"a","type":"issue_table"}]}]}""")!.AsObject();
        var cleaned = DashboardService.ValidateLayout(duplicateIds);
        var ids = cleaned["rows"]![0]!["widgets"]!.AsArray().Select(w => w!["id"]!.GetValue<string>()).ToList();
        Assert.Equal(2, ids.Distinct().Count());
    }

    [Fact]
    public void ParseLayout_ConvertsLegacyGadgetArrays()
    {
        var layout = DashboardService.ParseLayout("""[{"id":"g-1","type":"burndown","title":"Burndown"}]""");
        Assert.Equal(1, WidgetCount(layout));
        Assert.Equal("issue_table", layout["rows"]![0]!["widgets"]![0]!["type"]!.GetValue<string>());
        Assert.Equal(0, WidgetCount(DashboardService.ParseLayout("not json")));
    }

    [Fact]
    public void NormalizeFilters_DropsInvalidValues()
    {
        var filters = DashboardService.NormalizeFilters(new DashboardFilters
        {
            IssueTypes = new() { "bug", "Nope" },
            Priorities = new() { "HIGH" },
            StatusCategories = new() { "Done", "weird" },
            CreatedDays = -5,
            Assignees = new() { "me", "someone", Guid.Empty.ToString() },
        });
        Assert.Equal(new[] { "Bug" }, filters.IssueTypes);
        Assert.Equal(new[] { "High" }, filters.Priorities);
        Assert.Equal(new[] { "done" }, filters.StatusCategories);
        Assert.Null(filters.CreatedDays);
        Assert.Equal(2, filters.Assignees.Count);
    }

    [Fact]
    public void ExtractAuthor_ReadsGitHubPayloads()
    {
        Assert.Equal("octo", DashboardService.ExtractAuthor("""{"pull_request":{"user":{"login":"octo"}},"sender":{"login":"bot"}}""", "pull_request"));
        Assert.Equal("dev", DashboardService.ExtractAuthor("""{"head_commit":{"author":{"username":"dev"}}}""", "commit"));
        Assert.Equal("bot", DashboardService.ExtractAuthor("""{"sender":{"login":"bot"}}""", "check_run"));
        Assert.Equal("Неизвестно", DashboardService.ExtractAuthor(null, "commit"));
    }

    [Fact]
    public void StartOfWeek_IsMonday()
    {
        Assert.Equal(new DateTime(2026, 10, 19), DashboardService.StartOfWeek(new DateTime(2026, 10, 25, 13, 0, 0)));
        Assert.Equal(new DateTime(2026, 10, 19), DashboardService.StartOfWeek(new DateTime(2026, 10, 19, 0, 0, 1)));
    }
}
