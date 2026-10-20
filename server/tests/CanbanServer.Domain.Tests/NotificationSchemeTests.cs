using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class NotificationSchemeTests
{
    private static NotificationSchemeData With(string eventKey, params PermissionGrant[] recipients)
    {
        var data = new NotificationSchemeData();
        data.Events[eventKey] = recipients.ToList();
        return data;
    }

    [Fact]
    public void Default_scheme_notifies_watchers_reporter_and_assignee_on_every_event()
    {
        var data = NotificationSchemeService.Default();
        Assert.Equal(NotificationEvents.All.Length, data.Events.Count);
        foreach (var list in data.Events.Values)
            Assert.Equal(new[] { "watchers", "reporter", "assignee" }, list.Select(r => r.Type));
    }

    [Theory]
    [InlineData(ColumnKind.Backlog, ColumnKind.Done, NotificationEvents.Resolved)]
    [InlineData(ColumnKind.InProgress, ColumnKind.Done, NotificationEvents.Resolved)]
    [InlineData(ColumnKind.Done, ColumnKind.InProgress, NotificationEvents.Reopened)]
    [InlineData(ColumnKind.Done, ColumnKind.Archive, NotificationEvents.Transitioned)]
    [InlineData(ColumnKind.Backlog, ColumnKind.InProgress, NotificationEvents.Transitioned)]
    public void Moves_map_to_resolved_reopened_or_transitioned(ColumnKind from, ColumnKind to, string expected) =>
        Assert.Equal(expected, NotificationEvents.ForMove(from, to));

    [Fact]
    public void Normalize_validates_and_dedupes_recipients()
    {
        var group = Guid.NewGuid();
        var user = Guid.NewGuid();
        var groups = new HashSet<Guid> { group };
        var users = new HashSet<Guid> { user };
        string Run(params PermissionGrant[] r) => NotificationSchemeService.Normalize(With(NotificationEvents.Commented, r), groups, users);

        Assert.Throws<ArgumentException>(() => Run(new PermissionGrant { Type = "anyone" }));
        Assert.Throws<ArgumentException>(() => Run(new PermissionGrant { Type = "role", Value = "owner" }));
        Assert.Throws<ArgumentException>(() => Run(new PermissionGrant { Type = "group", Value = Guid.NewGuid().ToString() }));
        Assert.Throws<ArgumentException>(() => Run(new PermissionGrant { Type = "user", Value = Guid.NewGuid().ToString() }));

        var parsed = NotificationSchemeService.Parse(Run(
            new PermissionGrant { Type = "Watchers", Value = "x" },
            new PermissionGrant { Type = "watchers" },
            new PermissionGrant { Type = "role", Value = "Lead" },
            new PermissionGrant { Type = "group", Value = group.ToString() },
            new PermissionGrant { Type = "user", Value = user.ToString() }))!;
        var list = parsed.Events[NotificationEvents.Commented];
        Assert.Equal(new[] { "watchers", "role", "group", "user" }, list.Select(r => r.Type));
        Assert.Null(list[0].Value);
        Assert.Equal("lead", list[1].Value);
        Assert.Empty(parsed.Events[NotificationEvents.Created]);
    }
}
