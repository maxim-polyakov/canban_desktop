using CanbanServer.Domain.Entities;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class SprintAndIssueMetaTests
{
    [Fact]
    public void NewSprintDefaultsToFuture()
    {
        var sprint = new Sprint { Name = "Sprint 1" };
        Assert.Equal(SprintStatus.Future, sprint.Status);
        Assert.Empty(sprint.Quests);
    }

    [Fact]
    public void QuestSupportsJiraLikeMetadataWithoutBreakingXpFields()
    {
        var quest = new Quest
        {
            Title = "Implement backlog",
            IssueKey = "KAN-12",
            IssueNumber = 12,
            IssueType = IssueType.Story,
            Priority = IssuePriority.High,
            Labels = "frontend,ux",
            XpReward = 40,
            Category = QuestCategory.Frontend
        };

        Assert.Equal("KAN-12", quest.IssueKey);
        Assert.Equal(IssueType.Story, quest.IssueType);
        Assert.Equal(IssuePriority.High, quest.Priority);
        Assert.Equal(40, quest.XpReward);
        Assert.Equal(QuestCategory.Frontend, quest.Category);
    }

    [Fact]
    public void EpicIssueTypeAlignsWithIsEpicFlagConvention()
    {
        var epic = new Quest
        {
            Title = "Delivery epic",
            IssueType = IssueType.Epic,
            IsEpic = true,
            IssueKey = "KAN-1",
            IssueNumber = 1
        };

        Assert.True(epic.IsEpic);
        Assert.Equal(IssueType.Epic, epic.IssueType);
    }

    [Fact]
    public void BoardTracksIssueKeySequence()
    {
        var board = new Board
        {
            Name = "Delivery",
            KeyPrefix = "DEL",
            NextIssueNumber = 5
        };

        Assert.Equal("DEL", board.KeyPrefix);
        Assert.Equal(5, board.NextIssueNumber);
        Assert.Empty(board.Sprints);
    }
}
