using CanbanServer.Api.Auditing;
using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

public record BoardNotificationSchemeRequest(Guid? NotificationSchemeId);

[ApiController]
[Authorize]
[Route("api")]
public class NotificationSchemesController : ControllerBase
{
    private readonly NotificationSchemeService _schemes;
    private readonly PlanAccessService _plans;

    public NotificationSchemesController(NotificationSchemeService schemes, PlanAccessService plans)
    {
        _schemes = schemes;
        _plans = plans;
    }

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet("notification-schemes")]
    public async Task<ActionResult> Catalog([FromQuery] Guid teamId, CancellationToken ct) => Ok(await _schemes.CatalogAsync(Me, teamId, ct));

    [Audit("issueconfig.notificationscheme.create", AuditTarget.Body, ObjectType = "notificationscheme")]
    [RequiresPlan(BillingPlans.Standard)]
    [HttpPost("notification-schemes")]
    public async Task<ActionResult> Create([FromBody] IssueLayoutRequest request, CancellationToken ct) => Ok(await _schemes.CreateAsync(Me, request, ct));

    [Audit("issueconfig.notificationscheme.update", AuditTarget.IssueLayout, ObjectType = "notificationscheme")]
    [RequiresPlan(BillingPlans.Standard)]
    [HttpPut("notification-schemes/{id:guid}")]
    public async Task<ActionResult> Update(Guid id, [FromBody] IssueLayoutRequest request, CancellationToken ct) => Ok(await _schemes.UpdateAsync(id, Me, request, ct));

    [Audit("issueconfig.notificationscheme.delete", AuditTarget.IssueLayout, ObjectType = "notificationscheme")]
    [HttpDelete("notification-schemes/{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _schemes.DeleteAsync(id, Me, ct);
        return NoContent();
    }

    [Audit("space.notificationscheme", AuditTarget.Board, "boardId")]
    [HttpPut("boards/{boardId:guid}/notification-scheme")]
    public async Task<ActionResult> Assign(Guid boardId, [FromBody] BoardNotificationSchemeRequest request, CancellationToken ct)
    {
        if (request.NotificationSchemeId.HasValue) await _plans.EnsureUserAsync(Me, BillingPlans.Standard, ct);
        return Ok(await _schemes.AssignAsync(boardId, Me, request.NotificationSchemeId, ct));
    }
}
