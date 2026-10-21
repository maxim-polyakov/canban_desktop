using CanbanServer.Api.Auditing;
using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

public record BoardPermissionSchemeRequest(Guid? PermissionSchemeId);

[ApiController]
[Authorize]
[Route("api")]
public class PermissionSchemesController : ControllerBase
{
    private readonly PermissionSchemeService _schemes;
    private readonly PlanAccessService _plans;

    public PermissionSchemesController(PermissionSchemeService schemes, PlanAccessService plans)
    {
        _schemes = schemes;
        _plans = plans;
    }

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet("permission-schemes")]
    public async Task<ActionResult> Catalog([FromQuery] Guid teamId, CancellationToken ct) => Ok(await _schemes.CatalogAsync(Me, teamId, ct));

    [Audit("issueconfig.permissionscheme.create", AuditTarget.Body, ObjectType = "permissionscheme")]
    [RequiresPlan(BillingPlans.Standard)]
    [HttpPost("permission-schemes")]
    public async Task<ActionResult> Create([FromBody] IssueLayoutRequest request, CancellationToken ct) => Ok(await _schemes.CreateAsync(Me, request, ct));

    [Audit("issueconfig.permissionscheme.update", AuditTarget.IssueLayout, ObjectType = "permissionscheme")]
    [RequiresPlan(BillingPlans.Standard)]
    [HttpPut("permission-schemes/{id:guid}")]
    public async Task<ActionResult> Update(Guid id, [FromBody] IssueLayoutRequest request, CancellationToken ct) => Ok(await _schemes.UpdateAsync(id, Me, request, ct));

    [Audit("issueconfig.permissionscheme.delete", AuditTarget.IssueLayout, ObjectType = "permissionscheme")]
    [HttpDelete("permission-schemes/{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _schemes.DeleteAsync(id, Me, ct);
        return NoContent();
    }

    [HttpGet("boards/{boardId:guid}/permission-scheme")]
    public async Task<ActionResult> Board(Guid boardId, CancellationToken ct) => Ok(await _schemes.BoardAsync(boardId, Me, ct));

    [Audit("space.permissionscheme", AuditTarget.Board, "boardId")]
    [HttpPut("boards/{boardId:guid}/permission-scheme")]
    public async Task<ActionResult> Assign(Guid boardId, [FromBody] BoardPermissionSchemeRequest request, CancellationToken ct)
    {
        if (request.PermissionSchemeId.HasValue) await _plans.EnsureUserAsync(Me, BillingPlans.Standard, ct);
        return Ok(await _schemes.AssignAsync(boardId, Me, request.PermissionSchemeId, ct));
    }
}
