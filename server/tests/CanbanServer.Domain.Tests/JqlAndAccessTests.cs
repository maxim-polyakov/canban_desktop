using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class JqlAndAccessTests
{
    [Fact]
    public void JqlParser_ParsesAndOrNotAndOrderBy()
    {
        var query = new JqlParser("assignee = currentUser() AND priority = High OR type = Bug ORDER BY created DESC").Parse();
        Assert.NotNull(query.Where);
        Assert.Single(query.OrderBy);
        Assert.Equal("created", query.OrderBy[0].Field);
        Assert.True(query.OrderBy[0].Descending);
    }

    [Fact]
    public void JqlParser_SupportsInAndEmpty()
    {
        var query = new JqlParser("status IN (\"To Do\", Done) AND component IS NOT EMPTY").Parse();
        Assert.NotNull(query.Where);
    }

    [Fact]
    public void ProjectAccess_MapsRoles()
    {
        var service = new ProjectAccessService(null!);
        Assert.Equal(BoardPermission.Admin, service.MapRole(TeamRole.Admin, false));
        Assert.Equal(BoardPermission.Manage, service.MapRole(TeamRole.Lead, false));
        Assert.Equal(BoardPermission.Work, service.MapRole(TeamRole.Member, false));
        Assert.Equal(BoardPermission.Admin, service.MapRole(TeamRole.Member, true));
    }

    [Fact]
    public void QuestHierarchyFields_ExistOnEntity()
    {
        var quest = new Quest
        {
            ParentQuestId = Guid.NewGuid(),
            OriginalEstimateMinutes = 120,
            RemainingEstimateMinutes = 60,
            DescriptionDocumentJson = "{\"type\":\"doc\"}"
        };
        Assert.NotNull(quest.ParentQuestId);
        Assert.Equal(120, quest.OriginalEstimateMinutes);
    }
}
