using CanbanServer.Api.Auditing;
using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public class SharedWorkflowsController : ControllerBase
{
    private readonly WorkflowSchemeService _workflows;

    public SharedWorkflowsController(WorkflowSchemeService workflows) => _workflows = workflows;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet("shared-workflows")]
    public async Task<ActionResult> Catalog([FromQuery] Guid teamId, CancellationToken ct) => Ok(await _workflows.CatalogAsync(Me, teamId, ct));

    [HttpGet("shared-workflows/item/{id:guid}")]
    public async Task<ActionResult> Get(Guid id, CancellationToken ct) => Ok(await _workflows.GetAsync(id, Me, ct));

    [Audit("issueconfig.workflow.create", AuditTarget.Body, ObjectType = "workflow")]
    [HttpPost("shared-workflows/{kind}")]
    public async Task<ActionResult> Create(string kind, [FromBody] IssueLayoutRequest request, CancellationToken ct) =>
        Ok(await _workflows.CreateAsync(Me, kind, request, ct));

    [Audit("issueconfig.workflow.update", AuditTarget.IssueLayout, ObjectType = "workflow")]
    [HttpPut("shared-workflows/item/{id:guid}")]
    public async Task<ActionResult> Update(Guid id, [FromBody] IssueLayoutRequest request, CancellationToken ct) =>
        Ok(await _workflows.UpdateAsync(id, Me, request, ct));

    [Audit("issueconfig.workflow.delete", AuditTarget.IssueLayout, ObjectType = "workflow")]
    [HttpDelete("shared-workflows/item/{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _workflows.DeleteAsync(id, Me, ct);
        return NoContent();
    }

    [Audit("issueconfig.workflow.create", AuditTarget.Board, "boardId", ObjectType = "workflow")]
    [HttpPost("boards/{boardId:guid}/shared-workflow")]
    public async Task<ActionResult> FromBoard(Guid boardId, [FromBody] WorkflowFromBoardRequest request, CancellationToken ct) =>
        Ok(await _workflows.FromBoardAsync(boardId, Me, request, ct));

    [HttpGet("boards/{boardId:guid}/workflow-scheme/preview")]
    public async Task<ActionResult> Preview(Guid boardId, [FromQuery] Guid? schemeId, CancellationToken ct) =>
        Ok(await _workflows.PreviewAsync(boardId, Me, schemeId, ct));

    [Audit("space.workflowscheme", AuditTarget.Board, "boardId")]
    [HttpPut("boards/{boardId:guid}/workflow-scheme")]
    public async Task<ActionResult> Assign(Guid boardId, [FromBody] BoardWorkflowSchemeRequest request, CancellationToken ct) =>
        Ok(await _workflows.AssignAsync(boardId, Me, request, ct));
}
