using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class PermissionSchemeTests
{
    private static PermissionScope Scope(string? role, PermissionSchemeData? scheme = null, Guid? userId = null, params Guid[] groups) => new()
    {
        UserId = userId ?? Guid.NewGuid(),
        Role = role,
        Scheme = scheme ?? PermissionSchemeService.Default(),
        Groups = groups.ToHashSet(),
    };

    private static PermissionSchemeData Only(string key, params PermissionGrant[] grants)
    {
        var data = new PermissionSchemeData();
        data.Grants[JiraPermissions.Browse] = new() { new PermissionGrant { Type = "anyone" } };
        data.Grants[key] = grants.ToList();
        return data;
    }

    [Theory]
    [InlineData("viewer", BoardPermission.View)]
    [InlineData("member", BoardPermission.Work)]
    [InlineData("lead", BoardPermission.Manage)]
    [InlineData("admin", BoardPermission.Admin)]
    public void Default_scheme_keeps_existing_role_levels(string role, BoardPermission level) =>
        Assert.Equal(level, Scope(role).Level);

    [Fact]
    public void Default_scheme_grants_by_role()
    {
        Assert.True(Scope("viewer").Has(JiraPermissions.Browse));
        Assert.False(Scope("viewer").Has(JiraPermissions.AddComments));
        Assert.True(Scope("member").Has(JiraPermissions.AddComments));
        Assert.True(Scope("member").Has(JiraPermissions.Assignable));
        Assert.False(Scope("viewer").Has(JiraPermissions.Assignable));
        Assert.False(Scope("member").Has(JiraPermissions.Delete));
        Assert.True(Scope("lead").Has(JiraPermissions.Delete));
        Assert.True(Scope("lead").Has(JiraPermissions.DeleteAllComments));
        Assert.Null(Scope(null).Level);
    }

    [Fact]
    public void Removing_browse_hides_the_space_but_team_admins_keep_it()
    {
        var data = PermissionSchemeService.Default();
        data.Grants[JiraPermissions.Browse] = new();
        data.Grants[JiraPermissions.Administer] = new();
        Assert.Null(Scope("member", data).Level);
        Assert.Equal(BoardPermission.Admin, Scope("admin", data).Level);
        Assert.True(Scope("admin", data).Has(JiraPermissions.Administer));
    }

    [Fact]
    public void Reporter_assignee_user_group_and_anyone_grants()
    {
        var me = Guid.NewGuid();
        var group = Guid.NewGuid();
        var quest = new Quest { ReporterId = me };
        Assert.True(Scope("viewer", Only(JiraPermissions.Edit, new PermissionGrant { Type = "reporter" }), me).Has(JiraPermissions.Edit, quest));
        Assert.False(Scope("viewer", Only(JiraPermissions.Edit, new PermissionGrant { Type = "reporter" }), me).Has(JiraPermissions.Edit, new Quest()));

        var assigned = new Quest();
        assigned.Assignees.Add(new QuestAssignee { UserId = me });
        Assert.True(Scope("viewer", Only(JiraPermissions.Transition, new PermissionGrant { Type = "assignee" }), me).Has(JiraPermissions.Transition, assigned));
        Assert.True(Scope("viewer", Only(JiraPermissions.Transition, new PermissionGrant { Type = "assignee" }), me).Has(JiraPermissions.Transition, new Quest { AssigneeId = me }));

        Assert.True(Scope("viewer", Only(JiraPermissions.Delete, new PermissionGrant { Type = "user", Value = me.ToString() }), me).Has(JiraPermissions.Delete));
        Assert.True(Scope("viewer", Only(JiraPermissions.Delete, new PermissionGrant { Type = "group", Value = group.ToString() }), me, group).Has(JiraPermissions.Delete));
        Assert.False(Scope("viewer", Only(JiraPermissions.Delete, new PermissionGrant { Type = "group", Value = group.ToString() }), me).Has(JiraPermissions.Delete));
        Assert.True(Scope("viewer", Only(JiraPermissions.Delete, new PermissionGrant { Type = "anyone" })).Has(JiraPermissions.Delete));
        Assert.False(Scope(null, Only(JiraPermissions.Delete, new PermissionGrant { Type = "anyone" })).Has(JiraPermissions.Delete));
    }

    [Fact]
    public void Edit_through_scheme_raises_the_level_of_viewers()
    {
        var data = PermissionSchemeService.Default();
        data.Grants[JiraPermissions.Edit].Add(new PermissionGrant { Type = "role", Value = "viewer" });
        Assert.Equal(BoardPermission.Work, Scope("viewer", data).Level);
    }

    [Fact]
    public void Normalize_validates_grants()
    {
        var group = Guid.NewGuid();
        var user = Guid.NewGuid();
        var groups = new HashSet<Guid> { group };
        var users = new HashSet<Guid> { user };
        string Run(string key, string type, string? value) =>
            PermissionSchemeService.Normalize(Only(key, new PermissionGrant { Type = type, Value = value }), groups, users);

        Assert.Throws<ArgumentException>(() => Run(JiraPermissions.Edit, "role", "owner"));
        Assert.Throws<ArgumentException>(() => Run(JiraPermissions.Edit, "group", Guid.NewGuid().ToString()));
        Assert.Throws<ArgumentException>(() => Run(JiraPermissions.Edit, "user", Guid.NewGuid().ToString()));
        Assert.Throws<ArgumentException>(() => Run(JiraPermissions.Edit, "magic", null));
        Assert.Throws<ArgumentException>(() => Run(JiraPermissions.Create, "reporter", null));
        Assert.Throws<ArgumentException>(() => Run(JiraPermissions.Browse, "assignee", null));

        var json = Run(JiraPermissions.Edit, "reporter", "ignored");
        var parsed = PermissionSchemeService.Parse(json)!;
        Assert.Equal("reporter", Assert.Single(parsed.Grants[JiraPermissions.Edit]).Type);
        Assert.Null(parsed.Grants[JiraPermissions.Edit][0].Value);
        Assert.Equal(JiraPermissions.All.Length, parsed.Grants.Count);
        Assert.Single(PermissionSchemeService.Parse(Run(JiraPermissions.Edit, "group", group.ToString().ToUpperInvariant()))!.Grants[JiraPermissions.Edit]);
    }

    [Fact]
    public void Normalize_drops_duplicates()
    {
        var data = Only(JiraPermissions.Edit, new PermissionGrant { Type = "role", Value = "member" }, new PermissionGrant { Type = "ROLE", Value = "Member" });
        var parsed = PermissionSchemeService.Parse(PermissionSchemeService.Normalize(data, new HashSet<Guid>(), new HashSet<Guid>()))!;
        Assert.Single(parsed.Grants[JiraPermissions.Edit]);
    }
}
