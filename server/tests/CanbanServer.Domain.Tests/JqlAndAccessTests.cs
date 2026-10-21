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

    private static bool Matches(string jql, Quest quest, Guid userId, DateTime? updated = null) =>
        JqlService.Matches(new JqlParser(jql).Parse(), quest, new JqlService.JqlContext(userId, DateTime.UtcNow, q => updated ?? q.CreatedAt));

    [Fact]
    public void Jql_DefaultFilters_MatchExpectedIssues()
    {
        var me = Guid.NewGuid();
        var open = new Quest { IssueKey = "KAN-1", AssigneeId = me, ReporterId = me, CreatedAt = DateTime.UtcNow.AddDays(-2), Column = new Column { Kind = ColumnKind.InProgress, Title = "В работе" } };
        var done = new Quest { IssueKey = "KAN-2", ReporterId = Guid.NewGuid(), CreatedAt = DateTime.UtcNow.AddDays(-30), CompletedAt = DateTime.UtcNow.AddDays(-1), Column = new Column { Kind = ColumnKind.Done, Title = "Готово" } };

        Assert.True(Matches("assignee = currentUser() AND resolution = Unresolved", open, me));
        Assert.False(Matches("assignee = currentUser() AND resolution = Unresolved", done, me));
        Assert.True(Matches("reporter = currentUser()", open, me));
        Assert.False(Matches("reporter = currentUser()", done, me));
        Assert.True(Matches("statusCategory = Done", done, me));
        Assert.True(Matches("statusCategory != Done", open, me));
        Assert.True(Matches("statusCategory = \"In Progress\"", open, me));
        Assert.True(Matches("created >= -1w", open, me));
        Assert.False(Matches("created >= -1w", done, me));
        Assert.True(Matches("resolved >= -1w", done, me));
        Assert.False(Matches("resolved >= -1w", open, me));
        Assert.True(Matches("updated >= -7d", done, me, DateTime.UtcNow.AddHours(-3)));
        Assert.True(Matches("key in (KAN-2, KAN-9)", done, me));
        Assert.False(Matches("key in (KAN-2, KAN-9)", open, me));
        Assert.True(Matches("text ~ \"kan-1\"", open, me));
        Assert.True(Matches("created >= \"2000-01-01\"", open, me));
    }

    [Fact]
    public void Jql_DateFunctions_AcceptJiraOffsets()
    {
        var now = new DateTime(2026, 10, 21, 15, 30, 0, DateTimeKind.Utc); // Wednesday
        bool At(string jql, DateTime created) => JqlService.Matches(new JqlParser(jql).Parse(), new Quest { CreatedAt = created, Column = new Column() },
            new JqlService.JqlContext(Guid.NewGuid(), now, q => q.CreatedAt));

        Assert.True(At("created >= startOfDay(-7d)", new DateTime(2026, 10, 14, 0, 0, 0, DateTimeKind.Utc)));
        Assert.False(At("created >= startOfDay(-7d)", new DateTime(2026, 10, 13, 23, 59, 0, DateTimeKind.Utc)));
        Assert.True(At("created >= startOfWeek(-1) AND created < startOfWeek()", new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc)));
        Assert.False(At("created >= startOfWeek(-1) AND created < startOfWeek()", new DateTime(2026, 10, 19, 9, 0, 0, DateTimeKind.Utc)));
        Assert.True(At("created >= startOfMonth(-1) AND created <= endOfMonth(-1)", new DateTime(2026, 9, 30, 23, 0, 0, DateTimeKind.Utc)));
        Assert.True(At("created <= endOfDay() AND created >= startOfYear()", now.AddHours(8)));
        Assert.False(At("created <= endOfDay()", now.AddHours(9)));
        Assert.True(At("created >= startOfDay(\"-1d\")", now.AddHours(-20)));
        Assert.Throws<ArgumentException>(() => At("created >= startOfDay(abc)", now));
    }

    [Fact]
    public void Jql_Project_MatchesKeyOrSpaceId()
    {
        var me = Guid.NewGuid();
        var a = new Quest { BoardId = Guid.NewGuid(), Board = new Board { KeyPrefix = "KAN" }, Column = new Column { Kind = ColumnKind.Backlog } };
        var b = new Quest { BoardId = Guid.NewGuid(), Board = new Board { KeyPrefix = "KAN" }, Column = new Column { Kind = ColumnKind.Backlog } };

        Assert.True(Matches("project = KAN", a, me));
        Assert.True(Matches("project = KAN", b, me));
        Assert.True(Matches($"project in (\"{a.BoardId}\")", a, me));
        Assert.False(Matches($"project in (\"{a.BoardId}\")", b, me));
        Assert.True(Matches($"project not in (\"{a.BoardId}\")", b, me));
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
