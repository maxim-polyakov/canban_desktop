using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace CanbanServer.Infrastructure.Services;

public interface IGitHubAppClient
{
    bool IsConfigured { get; }
    Task<long?> FindRepositoryInstallationAsync(string owner, string repository, CancellationToken ct);
    Task<JsonDocument> GetAsync(long installationId, string path, CancellationToken ct);
}

public sealed class GitHubAppClient : IGitHubAppClient
{
    public const string HttpClientName = "github";

    private static readonly ConcurrentDictionary<long, (string Token, DateTimeOffset ExpiresAt)> InstallationTokens = new();

    private readonly IHttpClientFactory _clients;
    private readonly IConfiguration _configuration;

    public GitHubAppClient(IHttpClientFactory clients, IConfiguration configuration)
    {
        _clients = clients;
        _configuration = configuration;
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(AppIssuer) && LoadPrivateKeyPem() != null;

    private string? AppIssuer => _configuration["GitHub:ClientId"] is { Length: > 0 } clientId ? clientId : _configuration["GitHub:AppId"];

    private Uri ApiBase => new((_configuration["GitHub:ApiBaseUrl"] ?? "https://api.github.com").TrimEnd('/') + "/");

    public string CreateAppJwt(DateTimeOffset now)
    {
        var issuer = AppIssuer;
        if (string.IsNullOrWhiteSpace(issuer)) throw new InvalidOperationException("GitHub App is not configured: set GitHub:AppId or GitHub:ClientId");
        var pem = LoadPrivateKeyPem() ?? throw new InvalidOperationException("GitHub App private key is not configured");
        using var rsa = RSA.Create();
        rsa.ImportFromPem(pem);
        var header = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new { alg = "RS256", typ = "JWT" }));
        var payload = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new
        {
            iat = now.AddSeconds(-60).ToUnixTimeSeconds(),
            exp = now.AddMinutes(9).ToUnixTimeSeconds(),
            iss = issuer
        }));
        var signature = rsa.SignData(Encoding.ASCII.GetBytes(header + "." + payload), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        return $"{header}.{payload}.{Base64Url(signature)}";
    }

    public async Task<long?> FindRepositoryInstallationAsync(string owner, string repository, CancellationToken ct)
    {
        using var request = CreateRequest(HttpMethod.Get, $"repos/{Uri.EscapeDataString(owner)}/{Uri.EscapeDataString(repository)}/installation", CreateAppJwt(DateTimeOffset.UtcNow));
        using var response = await _clients.CreateClient(HttpClientName).SendAsync(request, ct);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        await EnsureSuccessAsync(response, ct);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        return doc.RootElement.GetProperty("id").GetInt64();
    }

    public async Task<JsonDocument> GetAsync(long installationId, string path, CancellationToken ct)
    {
        var token = await GetInstallationTokenAsync(installationId, ct);
        using var request = CreateRequest(HttpMethod.Get, path.TrimStart('/'), token);
        using var response = await _clients.CreateClient(HttpClientName).SendAsync(request, ct);
        if (response.StatusCode == HttpStatusCode.Unauthorized) InstallationTokens.TryRemove(installationId, out _);
        await EnsureSuccessAsync(response, ct);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
    }

    private async Task<string> GetInstallationTokenAsync(long installationId, CancellationToken ct)
    {
        if (InstallationTokens.TryGetValue(installationId, out var cached) && cached.ExpiresAt > DateTimeOffset.UtcNow.AddMinutes(5))
            return cached.Token;
        using var request = CreateRequest(HttpMethod.Post, $"app/installations/{installationId}/access_tokens", CreateAppJwt(DateTimeOffset.UtcNow));
        using var response = await _clients.CreateClient(HttpClientName).SendAsync(request, ct);
        await EnsureSuccessAsync(response, ct);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var token = doc.RootElement.GetProperty("token").GetString() ?? throw new InvalidOperationException("GitHub returned an empty installation token");
        var expiresAt = doc.RootElement.TryGetProperty("expires_at", out var expires) && expires.TryGetDateTimeOffset(out var parsed)
            ? parsed
            : DateTimeOffset.UtcNow.AddMinutes(50);
        InstallationTokens[installationId] = (token, expiresAt);
        return token;
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string relativePath, string bearer)
    {
        var request = new HttpRequestMessage(method, new Uri(ApiBase, relativePath));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        request.Headers.UserAgent.Add(new ProductInfoHeaderValue("Canban", "1.0"));
        request.Headers.Add("X-GitHub-Api-Version", "2022-11-28");
        return request;
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        var body = await response.Content.ReadAsStringAsync(ct);
        if (body.Length > 500) body = body[..500];
        throw new InvalidOperationException($"GitHub API {(int)response.StatusCode}: {body}");
    }

    private string? LoadPrivateKeyPem()
    {
        var base64 = _configuration["GitHub:PrivateKeyBase64"];
        if (!string.IsNullOrWhiteSpace(base64)) return Encoding.UTF8.GetString(Convert.FromBase64String(base64.Trim()));
        var inline = _configuration["GitHub:PrivateKey"];
        if (!string.IsNullOrWhiteSpace(inline)) return inline.Replace("\\n", "\n");
        var path = _configuration["GitHub:PrivateKeyPath"];
        return !string.IsNullOrWhiteSpace(path) && File.Exists(path) ? File.ReadAllText(path) : null;
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
