using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class MentionServiceTests
{
    private static readonly Guid Anna = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Boris = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public void Parse_reads_mention_tokens_with_spaces_in_names()
    {
        var ids = MentionService.Parse($"Привет, @[Анна Петрова]({Anna}) и @[Борис]({Boris})! Почта a@b.ru не упоминание.");
        Assert.Equal(new[] { Anna, Boris }.OrderBy(x => x), ids.OrderBy(x => x));
    }

    [Fact]
    public void Added_returns_only_new_mentions()
    {
        var before = $"@[Анна Петрова]({Anna}) посмотри";
        var after = $"@[Анна Петрова]({Anna}) и @[Борис]({Boris}) посмотрите";
        Assert.Equal(new[] { Boris }, MentionService.Added(before, after));
        Assert.Empty(MentionService.Added(after, before));
    }

    [Fact]
    public void ToPlainText_keeps_only_the_name()
    {
        Assert.Equal("Привет, @Анна Петрова!", MentionService.ToPlainText($"Привет, @[Анна Петрова]({Anna})!"));
        Assert.Equal("", MentionService.ToPlainText(null));
    }
}
