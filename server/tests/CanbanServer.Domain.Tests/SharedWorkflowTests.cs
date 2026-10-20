using System.Text.Json;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class SharedWorkflowTests
{
    private static readonly HashSet<string> Fields = new(IssueLayoutService.SystemFields.Append("cf:" + Guid.Empty), StringComparer.OrdinalIgnoreCase);
    private static readonly Guid Screen = Guid.NewGuid();
    private static readonly Guid Group = Guid.NewGuid();

    private static string Normalize(WorkflowData data) => WorkflowSchemeService.NormalizeWorkflow(data, Fields, new HashSet<Guid> { Screen }, new HashSet<Guid> { Group });

    [Fact]
    public void DefaultWorkflowIsValid()
    {
        var json = Normalize(WorkflowSchemeService.DefaultWorkflow());
        var data = JsonSerializer.Deserialize<WorkflowData>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.Equal("s1", data.Initial);
        Assert.Equal(3, data.Transitions.Count);
        Assert.Equal("Готово", data.StatusByName(" готово ")!.Name);
    }

    [Fact]
    public void StatusNamesMustBeUnique()
    {
        var data = WorkflowSchemeService.DefaultWorkflow();
        data.Statuses[1].Name = "к выполнению";
        Assert.Throws<ArgumentException>(() => Normalize(data));
    }

    [Fact]
    public void TransitionsNeedKnownStatusesAndSource()
    {
        var data = WorkflowSchemeService.DefaultWorkflow();
        data.Transitions[0].To = "nope";
        Assert.Throws<ArgumentException>(() => Normalize(data));

        data = WorkflowSchemeService.DefaultWorkflow();
        data.Transitions[0].From.Clear();
        Assert.Throws<ArgumentException>(() => Normalize(data));

        data = WorkflowSchemeService.DefaultWorkflow();
        data.Transitions[0].From.Clear();
        data.Transitions[0].Any = true;
        Normalize(data);

        data = WorkflowSchemeService.DefaultWorkflow();
        data.Transitions[0].From = new() { "s2" };
        Assert.Throws<ArgumentException>(() => Normalize(data));
    }

    [Fact]
    public void ScreensGroupsAndFieldsMustExist()
    {
        var data = WorkflowSchemeService.DefaultWorkflow();
        data.Transitions[0].ScreenId = Guid.NewGuid();
        Assert.Throws<ArgumentException>(() => Normalize(data));
        data.Transitions[0].ScreenId = Screen;
        data.Transitions[0].Conditions.Groups = new() { Group };
        data.Transitions[0].Validators.RequiredFields = new() { "DueDate", "cf:" + Guid.Empty };
        var json = Normalize(data);
        Assert.Contains("\"duedate\"", json);

        data.Transitions[0].Conditions.Groups = new() { Guid.NewGuid() };
        Assert.Throws<ArgumentException>(() => Normalize(data));
        data.Transitions[0].Conditions.Groups = new();
        data.Transitions[0].Validators.RequiredFields = new() { "cf:" + Guid.NewGuid() };
        Assert.Throws<ArgumentException>(() => Normalize(data));
    }

    [Fact]
    public void ValidatorPatternsAndPostFunctionsAreChecked()
    {
        var data = WorkflowSchemeService.DefaultWorkflow();
        data.Transitions[0].Validators.Patterns = new() { new FieldPattern { Field = "summary", Pattern = "([" } };
        Assert.Throws<ArgumentException>(() => Normalize(data));
        data.Transitions[0].Validators.Patterns = new() { new FieldPattern { Field = "assignee", Pattern = ".+" } };
        Assert.Throws<ArgumentException>(() => Normalize(data));
        data.Transitions[0].Validators.Patterns = new() { new FieldPattern { Field = "summary", Pattern = "^[A-Z]+-\\d+" } };
        data.Transitions[0].Validators.PreviousStatus = "s9";
        Assert.Throws<ArgumentException>(() => Normalize(data));
        data.Transitions[0].Validators.PreviousStatus = "s3";
        data.Transitions[0].Post.Priority = 42;
        Assert.Throws<ArgumentException>(() => Normalize(data));
        data.Transitions[0].Post.Priority = (int)IssuePriority.High;
        data.Transitions[0].Conditions.Role = "Owner";
        Assert.Throws<ArgumentException>(() => Normalize(data));
        data.Transitions[0].Conditions.Role = "Manage";
        Normalize(data);
    }

    [Fact]
    public void MissingInitialFallsBackToFirstStatusAndCategoriesAreBounded()
    {
        var data = WorkflowSchemeService.DefaultWorkflow();
        data.Initial = "missing";
        Assert.Contains("\"initial\":\"s1\"", Normalize(data));
        data.Statuses[0].Kind = (int)ColumnKind.Archive;
        Assert.Throws<ArgumentException>(() => Normalize(data));
    }

    [Fact]
    public void BoardWorkflowFallsBackToDefault()
    {
        var def = WorkflowSchemeService.DefaultWorkflow();
        var bugs = WorkflowSchemeService.DefaultWorkflow();
        bugs.Statuses[0].Name = "Новая ошибка";
        var board = new BoardWorkflow { SchemeId = Guid.NewGuid() };
        board.ByToken[BoardLayout.DefaultKey] = (Guid.NewGuid(), "Default", def);
        board.ByToken[((int)IssueType.Bug).ToString()] = (Guid.NewGuid(), "Bugs", bugs);
        Assert.Same(bugs, board.For(((int)IssueType.Bug).ToString()));
        Assert.Same(def, board.For(((int)IssueType.Story).ToString()));
    }
}
