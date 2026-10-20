using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class VoteTests
{
    private static bool Matches(string jql, Quest quest, Guid userId) =>
        JqlService.Matches(new JqlParser(jql).Parse(), quest, new JqlService.JqlContext(userId, DateTime.UtcNow, q => q.CreatedAt));

    [Fact]
    public void Reporter_and_resolved_issues_cannot_be_voted_on()
    {
        var me = Guid.NewGuid();
        var open = new Quest { ReporterId = Guid.NewGuid(), Column = new Column { Kind = ColumnKind.InProgress } };
        Assert.Null(IssueVoteService.BlockedReason(open, me));
        Assert.Equal(IssueVoteService.ReporterReason, IssueVoteService.BlockedReason(new Quest { ReporterId = me, Column = new Column { Kind = ColumnKind.Backlog } }, me));
        Assert.Equal(IssueVoteService.ResolvedReason, IssueVoteService.BlockedReason(new Quest { Column = new Column { Kind = ColumnKind.Done } }, me));
        Assert.Equal(IssueVoteService.ResolvedReason, IssueVoteService.BlockedReason(new Quest { CompletedAt = DateTime.UtcNow, Column = new Column { Kind = ColumnKind.Backlog } }, me));
        Assert.Equal(IssueVoteService.ResolvedReason, IssueVoteService.BlockedReason(new Quest { ReporterId = me, Column = new Column { Kind = ColumnKind.Archive } }, me));
    }

    [Fact]
    public void Jql_supports_votes_voter_watchers_and_watcher()
    {
        var me = Guid.NewGuid();
        var other = Guid.NewGuid();
        var quest = new Quest { Column = new Column { Kind = ColumnKind.Backlog } };
        quest.Votes.Add(new QuestVote { UserId = me });
        quest.Votes.Add(new QuestVote { UserId = other });
        quest.NotificationRecipients.Add(new QuestNotificationRecipient { UserId = other });
        var empty = new Quest { Column = new Column { Kind = ColumnKind.Backlog } };

        Assert.True(Matches("votes >= 2", quest, me));
        Assert.False(Matches("votes > 2", quest, me));
        Assert.True(Matches("votes = 0", empty, me));
        Assert.True(Matches("voter = currentUser()", quest, me));
        Assert.False(Matches("voter = currentUser()", empty, me));
        Assert.True(Matches($"voter = \"{other}\"", quest, me));
        Assert.True(Matches("voter IS EMPTY", empty, me));
        Assert.True(Matches("watchers = 1", quest, me));
        Assert.False(Matches("watcher = currentUser()", quest, me));
        Assert.True(Matches($"watcher in (\"{other}\")", quest, me));
    }
}
