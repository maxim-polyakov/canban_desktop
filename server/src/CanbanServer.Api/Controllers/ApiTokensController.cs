using CanbanServer.Api.Auth;
using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/me/tokens")]
public class ApiTokensController : ControllerBase
{
    private readonly ApiTokenService _tokens;

    public ApiTokensController(ApiTokenService tokens) => _tokens = tokens;

    /// <summary>Tokens are managed only from an interactive session so a leaked token cannot mint or hide others.</summary>
    private Guid Me => ApiTokenAuthenticationHandler.IsApiTokenSession(User)
        ? throw new UnauthorizedAccessException("API-токенами можно управлять только после входа в систему.")
        : User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet]
    public async Task<ActionResult> List(CancellationToken ct) => Ok(await _tokens.ListAsync(Me, ct));

    [HttpPost]
    public async Task<ActionResult> Create([FromBody] CreateApiTokenRequest request, CancellationToken ct) =>
        Ok(await _tokens.CreateAsync(Me, request, ct));

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Revoke(Guid id, CancellationToken ct)
    {
        await _tokens.RevokeAsync(Me, id, ct);
        return NoContent();
    }

    [HttpDelete]
    public async Task<ActionResult> RevokeAll(CancellationToken ct) => Ok(new { revoked = await _tokens.RevokeAllAsync(Me, ct) });
}
