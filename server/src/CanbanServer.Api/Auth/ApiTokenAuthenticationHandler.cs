using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace CanbanServer.Api.Auth;

/// <summary>
/// Authenticates personal API tokens sent the Atlassian way: <c>Authorization: Basic base64(email:kbn_…)</c>.
/// </summary>
public sealed class ApiTokenAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "ApiToken";
    public const string MethodClaim = "auth_method";
    public const string TokenIdClaim = "api_token_id";
    public const string ScopeClaim = "api_token_scope";

    public ApiTokenAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, ISystemClock clock)
        : base(options, logger, encoder, clock) { }

    public static bool Accepts(HttpRequest request)
    {
        var header = request.Headers.Authorization.ToString();
        return header.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsApiTokenSession(ClaimsPrincipal user) => user.FindFirst(MethodClaim)?.Value == SchemeName;

    /// <summary>Null for classic tokens and interactive sessions.</summary>
    public static IReadOnlyList<string>? Scopes(ClaimsPrincipal user) =>
        IsApiTokenSession(user) && user.HasClaim(c => c.Type == ScopedClaim)
            ? user.FindAll(ScopeClaim).Select(c => c.Value).ToList()
            : null;

    public const string ScopedClaim = "api_token_scoped";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase)) return AuthenticateResult.NoResult();
        string decoded;
        try { decoded = Encoding.UTF8.GetString(Convert.FromBase64String(header["Basic ".Length..].Trim())); }
        catch (FormatException) { return AuthenticateResult.Fail("Malformed basic credentials"); }
        var colon = decoded.IndexOf(':');
        if (colon <= 0) return AuthenticateResult.Fail("Malformed basic credentials");
        var email = decoded[..colon].Trim();
        var secret = decoded[(colon + 1)..];

        var tokens = Context.RequestServices.GetRequiredService<ApiTokenService>();
        var owner = await tokens.AuthenticateAsync(secret, Context.Connection.RemoteIpAddress?.ToString(), Context.RequestAborted);
        if (owner is null || !string.Equals(email, owner.Email, StringComparison.OrdinalIgnoreCase))
            return AuthenticateResult.Fail("Invalid API token");

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, owner.UserId.ToString()),
            new Claim(ClaimTypes.Email, owner.Email),
            new Claim(ClaimTypes.Name, owner.DisplayName),
            new Claim(MethodClaim, SchemeName),
            new Claim(TokenIdClaim, owner.TokenId.ToString()),
        };
        if (owner.Scopes is { } scopes)
        {
            claims.Add(new Claim(ScopedClaim, "true"));
            claims.AddRange(scopes.Select(x => new Claim(ScopeClaim, x)));
        }
        var identity = new ClaimsIdentity(claims, SchemeName);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        Response.Headers.WWWAuthenticate = "Basic realm=\"Kanban API\"";
        return Task.CompletedTask;
    }
}
