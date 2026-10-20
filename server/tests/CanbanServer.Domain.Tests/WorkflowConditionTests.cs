using System.Text.Json;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class WorkflowConditionTests
{
    private static void Check(WorkflowTransition rule, Quest quest, BoardPermission permission = BoardPermission.Work, Guid? userId = null) =>
        JiraPlatformService.CheckConditions(rule, quest, permission, userId);

    [Fact]
    public void IssueTypeConditionsUnderstandCustomTypes()
    {
        var incident = Guid.NewGuid();
        var rule = new WorkflowTransition { AllowedIssueTypes = $"Bug,{incident}" };
        Check(rule, new Quest { IssueType = IssueType.Bug });
        Check(rule, new Quest { IssueType = IssueType.Task, IssueTypeId = incident });
        Assert.Throws<InvalidOperationException>(() => Check(rule, new Quest { IssueType = IssueType.Task }));
        Assert.Throws<InvalidOperationException>(() => Check(rule, new Quest { IssueType = IssueType.Bug, IssueTypeId = Guid.NewGuid() }));
    }

    [Fact]
    public void RoleConditionsAllowHigherRoles()
    {
        var rule = new WorkflowTransition { AllowedRoles = "Manage" };
        Check(rule, new Quest(), BoardPermission.Manage);
        Check(rule, new Quest(), BoardPermission.Admin);
        Assert.Throws<InvalidOperationException>(() => Check(rule, new Quest(), BoardPermission.Work));
    }

    [Fact]
    public void OnlyAssigneeAndRequiredCustomFields()
    {
        var me = Guid.NewGuid();
        var field = Guid.NewGuid();
        var onlyAssignee = new WorkflowTransition { ConditionsJson = """{"onlyAssignee":true}""" };
        Check(onlyAssignee, new Quest { AssigneeId = me }, userId: me);
        Assert.Throws<InvalidOperationException>(() => Check(onlyAssignee, new Quest { AssigneeId = Guid.NewGuid() }, userId: me));

        var required = new WorkflowTransition { ConditionsJson = JsonSerializer.Serialize(new { requiredFields = new[] { $"cf:{field}", "duedate" } }) };
        var filled = new Quest { DueDate = DateTime.UtcNow, CustomFieldsJson = JsonSerializer.Serialize(new Dictionary<string, object> { [field.ToString()] = "S1" }) };
        Check(required, filled);
        Assert.Throws<InvalidOperationException>(() => Check(required, new Quest { DueDate = DateTime.UtcNow }));
    }
}
