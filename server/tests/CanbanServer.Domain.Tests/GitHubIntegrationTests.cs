using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CanbanServer.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class GitHubIntegrationTests
{
    [Fact]
    public void ExtractIssueKeys_FindsKeysInBranchesAndMessages()
    {
        var keys = GitHubEventParser.ExtractIssueKeys("feature/kan-12-login", "Fix KAN-7 and DEV-3", "no key here");
        Assert.Equal(new[] { "KAN-12", "KAN-7", "DEV-3" }, keys);
    }

    [Fact]
    public void Parse_PullRequest_ReturnsPullRequestAndBranch()
    {
        using var doc = JsonDocument.Parse("""
            {"action":"closed","repository":{"full_name":"o/r","html_url":"https://github.com/o/r"},
             "installation":{"id":42},
             "pull_request":{"id":100,"number":5,"title":"KAN-1 add login","html_url":"https://github.com/o/r/pull/5",
               "state":"closed","merged":true,"head":{"ref":"kan-1-login"}}}
            """);
        var events = GitHubEventParser.Parse("pull_request", doc.RootElement);
        var pr = Assert.Single(events, e => e.Kind == GitHubEventParser.PullRequestKind);
        Assert.Equal("merged", pr.Status);
        Assert.Equal("#5 KAN-1 add login", pr.Title);
        Assert.Contains("KAN-1", pr.IssueKeys);
        Assert.Single(events, e => e.Kind == GitHubEventParser.BranchKind && e.ExternalId == "kan-1-login");
        Assert.Equal(42, GitHubEventParser.InstallationId(doc.RootElement));
        Assert.Equal("o/r", GitHubEventParser.RepositoryFullName(doc.RootElement));
    }

    [Fact]
    public void Parse_Push_ReturnsCommitsForEachIssueKey()
    {
        using var doc = JsonDocument.Parse("""
            {"ref":"refs/heads/main","repository":{"full_name":"o/r","html_url":"https://github.com/o/r"},
             "commits":[{"id":"abc","message":"KAN-2 fix\n\nbody","url":"https://github.com/o/r/commit/abc"},
                        {"id":"def","message":"chore","url":"https://github.com/o/r/commit/def"}]}
            """);
        var events = GitHubEventParser.Parse("push", doc.RootElement);
        var commit = Assert.Single(events);
        Assert.Equal(GitHubEventParser.CommitKind, commit.Kind);
        Assert.Equal("KAN-2 fix", commit.Title);
    }

    [Fact]
    public void CreateAppJwt_IsSignedWithPrivateKey()
    {
        using var rsa = RSA.Create(2048);
        var pem = rsa.ExportRSAPrivateKeyPem();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["GitHub:AppId"] = "123",
            ["GitHub:PrivateKeyBase64"] = Convert.ToBase64String(Encoding.UTF8.GetBytes(pem))
        }).Build();
        var client = new GitHubAppClient(new StubHttpClientFactory(), config);
        Assert.True(client.IsConfigured);

        var jwt = client.CreateAppJwt(DateTimeOffset.UtcNow);
        var parts = jwt.Split('.');
        Assert.Equal(3, parts.Length);
        var payload = JsonDocument.Parse(FromBase64Url(parts[1])).RootElement;
        Assert.Equal("123", payload.GetProperty("iss").GetString());
        Assert.True(rsa.VerifyData(Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]), FromBase64Url(parts[2]), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
    }

    [Fact]
    public void GitHubAppClient_IsNotConfiguredWithoutPrivateKey()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["GitHub:AppId"] = "123" }).Build();
        Assert.False(new GitHubAppClient(new StubHttpClientFactory(), config).IsConfigured);
    }

    private static byte[] FromBase64Url(string value)
    {
        var s = value.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(s.PadRight(s.Length + (4 - s.Length % 4) % 4, '='));
    }

    private sealed class StubHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(new StubHandler());

        private sealed class StubHandler : HttpMessageHandler
        {
            protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
                Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        }
    }
}
