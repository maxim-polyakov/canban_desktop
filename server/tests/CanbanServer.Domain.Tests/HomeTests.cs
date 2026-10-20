using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class HomeTests
{
    [Fact]
    public void TagsAreTrimmedDeduplicatedAndCapped()
    {
        Assert.Equal("Q4,mobile app", HomeService.NormalizeTags(new[] { " #Q4 ", "q4", "mobile,  app", "", null! }));
        Assert.Equal(10, HomeService.ParseTags(HomeService.NormalizeTags(Enumerable.Range(0, 20).Select(i => $"t{i}"))).Count);
        Assert.Equal(40, HomeService.NormalizeTags(new[] { new string('x', 90) }).Length);
        Assert.Empty(HomeService.ParseTags(""));
    }

    [Fact]
    public void KindAcceptsSingularAndPlural()
    {
        Assert.Equal("project", HomeService.NormalizeKind("projects"));
        Assert.Equal("goal", HomeService.NormalizeKind("goal"));
        Assert.Throws<KeyNotFoundException>(() => HomeService.NormalizeKind("teams"));
    }

    [Fact]
    public void LinksMustBeHttp()
    {
        Assert.Equal("https://example.com/docs", HomeService.NormalizeUrl(" example.com/docs "));
        Assert.Equal("http://intra.local/", HomeService.NormalizeUrl("http://intra.local"));
        Assert.Throws<ArgumentException>(() => HomeService.NormalizeUrl("javascript:alert(1)"));
        Assert.Throws<ArgumentException>(() => HomeService.NormalizeUrl("ftp://example.com"));
        Assert.Throws<ArgumentException>(() => HomeService.NormalizeUrl(""));
    }

    [Fact]
    public void KeysAndCloneNames()
    {
        Assert.Equal("PROJ-12", HomeService.KeyOf("project", 12));
        Assert.Equal("GOAL-3", HomeService.KeyOf("goal", 3));
        Assert.Equal("Копия Запуск", HomeService.CloneName("Запуск"));
        Assert.Equal("Копия Запуск", HomeService.CloneName("Копия Запуск"));
    }
}
