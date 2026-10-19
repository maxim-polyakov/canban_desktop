using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class PlanTests
{
    [Fact]
    public void IssueTypeExclusionsAreNormalized()
    {
        Assert.Equal("0,3", PlanService.NormalizeIssueTypes(new[] { 3, 0, 3, 42, -1 }));
        Assert.Equal("", PlanService.NormalizeIssueTypes(null));
        Assert.Equal(new List<int> { 0, 3 }, PlanService.ParseIssueTypes("0,3,x"));
        Assert.Empty(PlanService.ParseIssueTypes(""));
    }
}
