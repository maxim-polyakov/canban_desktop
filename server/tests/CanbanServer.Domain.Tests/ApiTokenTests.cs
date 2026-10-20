using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class ApiTokenTests
{
    [Fact]
    public void Generated_tokens_are_prefixed_unique_and_recognised()
    {
        var a = ApiTokenService.Generate();
        var b = ApiTokenService.Generate();
        Assert.StartsWith(ApiTokenService.Prefix, a);
        Assert.Equal(ApiTokenService.Prefix.Length + ApiTokenService.SecretLength, a.Length);
        Assert.NotEqual(a, b);
        Assert.True(ApiTokenService.LooksLikeToken(a));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("kbn_short")]
    [InlineData("eyJhbGciOiJIUzI1NiJ9.payload.signature")]
    [InlineData("kbn_!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")]
    public void Other_strings_are_not_tokens(string? value) => Assert.False(ApiTokenService.LooksLikeToken(value));

    [Fact]
    public void Hash_is_stable_lowercase_sha256()
    {
        var hash = ApiTokenService.Hash("kbn_test");
        Assert.Equal(64, hash.Length);
        Assert.Equal(hash, ApiTokenService.Hash("kbn_test"));
        Assert.Equal(hash.ToLowerInvariant(), hash);
        Assert.NotEqual(hash, ApiTokenService.Hash("kbn_Test"));
    }

    [Theory]
    [InlineData("GET", "/api/search/issues", false, "read:jira-work")]
    [InlineData("POST", "/api/quests", false, "write:jira-work")]
    [InlineData("PUT", "/api/workflows/board/x", true, "manage:jira-configuration")]
    [InlineData("GET", "/api/users/1", false, "read:jira-user")]
    public void Requests_need_matching_scope(string method, string path, bool configuration, string scope)
    {
        var required = ApiTokenService.RequiredScopes(method, path, configuration);
        Assert.Contains(scope, required);
        Assert.True(ApiTokenService.Allows(new[] { scope }, required));
        Assert.True(ApiTokenService.Allows(null, required));
        Assert.False(ApiTokenService.Allows(Array.Empty<string>(), required));
    }

    [Fact]
    public void Read_scope_does_not_allow_writes() =>
        Assert.False(ApiTokenService.Allows(new[] { ApiTokenService.ReadWork }, ApiTokenService.RequiredScopes("DELETE", "/api/quests/1", false)));
}