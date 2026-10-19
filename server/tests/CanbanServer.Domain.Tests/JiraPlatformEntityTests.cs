using CanbanServer.Domain.Entities;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class JiraPlatformEntityTests
{
    [Fact]
    public void WorkflowAndOutboxHaveSafeDefaults()
    {
        var transition = new WorkflowTransition();
        var message = new OutboxMessage();
        Assert.True(transition.Enabled);
        Assert.Equal("", transition.AllowedIssueTypes);
        Assert.Equal(OutboxStatus.Pending, message.Status);
        Assert.Equal("{}", message.PayloadJson);
    }

    [Fact]
    public void GeneralParentAndLegacyEpicCanCoexist()
    {
        var parentId = Guid.NewGuid();
        var quest = new Quest
        {
            IssueType = IssueType.Story,
            ParentQuestId = parentId,
            ParentEpicId = parentId,
            OriginalEstimateMinutes = 480,
            RemainingEstimateMinutes = 240,
            Description = "Fallback",
            DescriptionDocumentJson = """{"type":"doc","content":[]}"""
        };
        Assert.Equal(quest.ParentEpicId, quest.ParentQuestId);
        Assert.Equal(240, quest.RemainingEstimateMinutes);
        Assert.NotNull(quest.DescriptionDocumentJson);
    }

    [Theory]
    [InlineData(TeamRole.Member, BoardPermission.Work)]
    [InlineData(TeamRole.Lead, BoardPermission.Manage)]
    [InlineData(TeamRole.Admin, BoardPermission.Admin)]
    public void PermissionsPreserveTeamRoleOrdering(TeamRole role, BoardPermission expected)
    {
        var mapped = role switch
        {
            TeamRole.Admin => BoardPermission.Admin,
            TeamRole.Lead => BoardPermission.Manage,
            _ => BoardPermission.Work
        };
        Assert.Equal(expected, mapped);
    }
}
