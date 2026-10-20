using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class SpaceTemplateTests
{
    [Fact]
    public void EveryTemplateIsUsable()
    {
        var categories = SpaceTemplates.Categories.Select(c => c.Id).ToHashSet();
        Assert.Equal(SpaceTemplates.All.Count, SpaceTemplates.All.Select(t => t.Id).Distinct().Count());
        foreach (var template in SpaceTemplates.All)
        {
            Assert.Contains(template.Category, categories);
            Assert.Contains(template.Columns, c => c.Kind == ColumnKind.Done);
            Assert.Contains("board", SpaceTemplates.NormalizeFeatures(template.Features).Split(','));
            Assert.All(template.Features, f => Assert.Contains(f, SpaceTemplates.AllFeatures));
        }
    }

    [Fact]
    public void NormalizeFeaturesKeepsCanonicalOrderAndBoard()
    {
        Assert.Equal("summary,board,list,calendar", SpaceTemplates.NormalizeFeatures(new[] { "calendar", "LIST", "bogus", "summary" }));
    }

    [Fact]
    public void UnknownTemplateFallsBackToKanban()
    {
        Assert.Equal("kanban", SpaceTemplates.Find("nope").Id);
        Assert.Equal("scrum", SpaceTemplates.Find("Scrum").Id);
    }

    [Fact]
    public void OutsidersGetPermissionByAccessLevel()
    {
        Assert.Equal(BoardPermission.Work, ProjectAccessService.OutsiderPermission("open"));
        Assert.Equal(BoardPermission.View, ProjectAccessService.OutsiderPermission("limited"));
        Assert.Null(ProjectAccessService.OutsiderPermission("private"));
    }
}
