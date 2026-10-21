using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class NaturalJqlTests
{
    [Theory]
    [InlineData("мои баги с высоким приоритетом за неделю", "assignee = currentUser() AND type = Bug AND priority IN (High, Highest) AND created >= \"-1w\" ORDER BY priority DESC")]
    [InlineData("открытые задачи без исполнителя", "assignee IS EMPTY AND resolution = Unresolved ORDER BY created DESC")]
    [InlineData("просроченные задачи в текущем спринте", "duedate < now() AND resolution = Unresolved AND sprint IN (openSprints()) ORDER BY duedate ASC")]
    [InlineData("эпики, обновлённые за 3 дня", "type = Epic AND updated >= \"-3d\" ORDER BY updated DESC")]
    [InlineData("my open bugs created today", "assignee = currentUser() AND type = Bug AND resolution = Unresolved AND created >= startOfDay() ORDER BY created DESC")]
    [InlineData("задачи про \"оплата картой\"", "text ~ \"оплата картой\" ORDER BY created DESC")]
    [InlineData("задачи с меткой backend в работе", "statusCategory = \"In Progress\" AND labels = \"backend\" ORDER BY created DESC")]
    public void TranslatesCommonRequests(string text, string expected)
    {
        var result = NaturalJql.Translate(text);
        Assert.Equal(expected, result.Jql);
        Assert.Equal("rules", result.Source);
        new JqlParser(result.Jql).Parse();
    }

    [Fact]
    public void FallsBackToTextSearch()
    {
        var result = NaturalJql.Translate("молибден отжиг");
        Assert.Equal("text ~ \"молибден отжиг\" ORDER BY created DESC", result.Jql);
        Assert.Contains("молибден отжиг", result.Explanation);
        new JqlParser(result.Jql).Parse();
    }

    [Fact]
    public void EscapesQuotes()
    {
        var result = NaturalJql.Translate("ошибки про «кнопка \\ \"ок\"»");
        new JqlParser(result.Jql).Parse();
        Assert.StartsWith("type = Bug AND text ~ ", result.Jql);
    }
}
