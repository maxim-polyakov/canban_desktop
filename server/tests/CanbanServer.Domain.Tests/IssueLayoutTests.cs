using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class IssueLayoutTests
{
    private static readonly string Bug = ((int)IssueType.Bug).ToString();
    private static readonly string Task = ((int)IssueType.Task).ToString();

    private static BoardLayout Layout() => new()
    {
        FieldConfigs =
        {
            [BoardLayout.DefaultKey] = new() { ["description"] = new FieldRule { Required = true } },
            [Bug] = new() { ["cf:1"] = new FieldRule { Hidden = true }, ["duedate"] = new FieldRule { Required = true } },
        },
        Screens =
        {
            [BoardLayout.DefaultKey] = new OperationScreens
            {
                Create = new() { new ScreenTab { Name = "Поля", Fields = { "summary", "description", "cf:2" } } },
                Edit = new() { new ScreenTab { Name = "Поля", Fields = { "summary", "cf:2", "cf:3" } } },
                View = new() { new ScreenTab { Name = "Поля", Fields = { "summary" } } },
            },
        },
    };

    [Fact]
    public void IssueTypeConfigurationReplacesTheDefaultOne()
    {
        var layout = Layout();
        Assert.True(layout.Rule(Task, "description").Required);
        Assert.False(layout.Rule(Bug, "description").Required);
        Assert.True(layout.Rule(Bug, "cf:1").Hidden);
        Assert.False(layout.Rule(Task, "cf:1").Hidden);
    }

    [Fact]
    public void ScreensDecideWhereAFieldAppears()
    {
        var layout = Layout();
        Assert.True(layout.OnScreen(Bug, "create", "cf:2"));
        Assert.False(layout.OnScreen(Bug, "create", "cf:3"));
        Assert.True(layout.OnScreen(Bug, "edit", "CF:3"));
        Assert.False(layout.OnScreen(Bug, "view", "cf:2"));
        Assert.True(new BoardLayout().OnScreen(Bug, "create", "cf:9"));
        Assert.Null(new BoardLayout().Tabs(Bug, "edit"));
    }

    [Fact]
    public void MissingRequiredSystemFieldsIgnoreHiddenAndSummary()
    {
        var layout = Layout();
        Assert.Equal(new[] { "description" }, IssueLayoutService.MissingRequiredSystemFields(layout, Task, _ => false));
        Assert.Equal(new[] { "duedate" }, IssueLayoutService.MissingRequiredSystemFields(layout, Bug, _ => false));
        Assert.Empty(IssueLayoutService.MissingRequiredSystemFields(layout, Bug, key => key == "duedate"));
        Assert.Empty(IssueLayoutService.MissingRequiredSystemFields(new BoardLayout(), Bug, _ => false));
    }
}
