using CanbanServer.Application.Contracts;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class JqlParserTests
{
    [Fact]
    public void ParsesBooleanPrecedenceAndParentheses()
    {
        var query = new JqlParser("priority = High OR (type = Bug AND NOT status = Done)").Parse();
        var root = Assert.IsType<JqlBinary>(query.Where);
        Assert.Equal("OR", root.Operator);
        var nested = Assert.IsType<JqlBinary>(root.Right);
        Assert.Equal("AND", nested.Operator);
        Assert.IsType<JqlNot>(nested.Right);
    }

    [Theory]
    [InlineData("assignee = currentUser()")]
    [InlineData("sprint IN (openSprints())")]
    [InlineData("labels NOT IN (one, \"two words\")")]
    [InlineData("description !~ \"obsolete\"")]
    [InlineData("dueDate IS NOT EMPTY")]
    [InlineData("storyPoints >= 5")]
    public void ParsesSupportedPredicates(string text)
    {
        var query = new JqlParser(text).Parse();
        Assert.NotNull(query.Where);
    }

    [Fact]
    public void ParsesOrdering()
    {
        var query = new JqlParser("type = Bug ORDER BY priority DESC, created ASC").Parse();
        Assert.Collection(query.OrderBy,
            first => { Assert.Equal("priority", first.Field); Assert.True(first.Descending); },
            second => { Assert.Equal("created", second.Field); Assert.False(second.Descending); });
    }

    [Theory]
    [InlineData("priority =")]
    [InlineData("(type = Bug")]
    [InlineData("status ~~ Done")]
    [InlineData("labels IN ()")]
    public void RejectsMalformedQueries(string text) =>
        Assert.Throws<FormatException>(() => new JqlParser(text).Parse());
}
