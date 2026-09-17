using CanbanServer.Domain.Entities;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class EntityDefaultsTests
{
    [Fact]
    public void NewQuestHasSafeIndependentNavigationCollections()
    {
        var first = new Quest();
        var second = new Quest();

        first.Assignees.Add(new QuestAssignee { UserId = Guid.NewGuid() });
        first.Comments.Add(new QuestComment());

        Assert.Single(first.Assignees);
        Assert.Single(first.Comments);
        Assert.Empty(second.Assignees);
        Assert.Empty(second.Comments);
        Assert.NotSame(first.Assignees, second.Assignees);
        Assert.NotSame(first.Comments, second.Comments);
    }

    [Fact]
    public void NewBoardAndColumnCanBuildAnInMemoryAggregate()
    {
        var board = new Board { Name = "Delivery" };
        var column = new Column
        {
            Title = "Done",
            Kind = ColumnKind.Done,
            Board = board
        };
        var quest = new Quest
        {
            Title = "Ship release",
            Category = QuestCategory.DevOps,
            XpReward = 50,
            Board = board,
            Column = column
        };

        board.Columns.Add(column);
        column.Quests.Add(quest);

        Assert.Same(board, quest.Board);
        Assert.Same(column, quest.Column);
        Assert.Equal(ColumnKind.Done, quest.Column.Kind);
        Assert.Equal(QuestCategory.DevOps, quest.Category);
        Assert.Equal(50, quest.XpReward);
    }
}
