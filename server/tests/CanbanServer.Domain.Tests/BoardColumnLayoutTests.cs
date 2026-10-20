using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class BoardColumnLayoutTests
{
    private static readonly BoardStatusInfo Todo = new(Guid.NewGuid(), "To Do", ColumnKind.Backlog, 0);
    private static readonly BoardStatusInfo Doing = new(Guid.NewGuid(), "In Progress", ColumnKind.InProgress, 1);
    private static readonly BoardStatusInfo Review = new(Guid.NewGuid(), "In Review", ColumnKind.Review, 2);
    private static readonly BoardStatusInfo Done = new(Guid.NewGuid(), "Done", ColumnKind.Done, 3);
    private static readonly List<BoardStatusInfo> Statuses = new() { Todo, Doing, Review, Done };

    private static PublishLayoutColumnRequest Col(string name, params string[] ids) => new(null, name, ids.ToList());

    [Fact]
    public void Without_layout_every_status_is_its_own_column()
    {
        var dto = BoardColumnLayoutService.Resolve(null, Statuses);
        Assert.False(dto.Configured);
        Assert.Equal(new[] { "To Do", "In Progress", "In Review", "Done" }, dto.Columns.Select(c => c.Name));
        Assert.All(dto.Columns, c => Assert.Single(c.StatusIds));
        Assert.Empty(dto.Hidden);
    }

    [Fact]
    public void Unmapped_statuses_are_hidden_and_deleted_ones_dropped()
    {
        var data = new BoardColumnLayoutData
        {
            Columns =
            {
                new BoardLayoutColumn { Id = Guid.NewGuid(), Name = "Work", StatusIds = { Doing.Id, Review.Id } },
                new BoardLayoutColumn { Id = Guid.NewGuid(), Name = "Gone", StatusIds = { Guid.NewGuid() } },
                new BoardLayoutColumn { Id = Guid.NewGuid(), Name = "Done", StatusIds = { Done.Id, Doing.Id } },
            }
        };
        var dto = BoardColumnLayoutService.Resolve(data, Statuses);
        Assert.True(dto.Configured);
        Assert.Equal(new[] { "Work", "Done" }, dto.Columns.Select(c => c.Name));
        Assert.Equal(new[] { Done.Id }, dto.Columns[1].StatusIds);
        Assert.Equal(new[] { Todo.Id }, dto.Hidden);
    }

    [Fact]
    public void Normalize_requires_a_status_in_every_column()
    {
        var request = new PublishColumnLayoutRequest(new() { Col("Work", Doing.Id.ToString()), Col("123") }, null);
        var error = Assert.Throws<ArgumentException>(() => BoardColumnLayoutService.Normalize(request, Statuses, _ => Guid.NewGuid()));
        Assert.Equal("Столбцы должны иметь хотя бы по одному статусу", error.Message);
    }

    [Fact]
    public void Normalize_rejects_duplicates_unknown_statuses_and_bad_names()
    {
        void Run(PublishColumnLayoutRequest r) => Assert.Throws<ArgumentException>(() => BoardColumnLayoutService.Normalize(r, Statuses, _ => Guid.NewGuid()));
        Run(new(new() { Col("A", Todo.Id.ToString()), Col("B", Todo.Id.ToString()) }, null));
        Run(new(new() { Col("A", Guid.NewGuid().ToString()) }, null));
        Run(new(new() { Col("  ", Todo.Id.ToString()) }, null));
        Run(new(new(), null));
        Run(new(new() { Col("A", "n1") }, new() { new("n1", "done", 3) }));
        Run(new(new() { Col("A", "n1") }, new() { new("n1", "Archive", 5) }));
    }

    [Fact]
    public void Normalize_creates_new_statuses_by_key()
    {
        var newId = Guid.NewGuid();
        var request = new PublishColumnLayoutRequest(
            new() { Col("To Do", Todo.Id.ToString()), Col("Work", Doing.Id.ToString(), "n1"), Col("Done", Done.Id.ToString()) },
            new() { new("n1", "  QA  ", 1) });
        var (layout, created) = BoardColumnLayoutService.Normalize(request, Statuses, _ => newId);
        Assert.Equal(("n1", "QA", ColumnKind.InProgress), Assert.Single(created));
        Assert.Equal(new[] { Doing.Id, newId }, layout.Columns[1].StatusIds);
        Assert.Equal(3, layout.Columns.Select(c => c.Id).Distinct().Count());
    }
}
