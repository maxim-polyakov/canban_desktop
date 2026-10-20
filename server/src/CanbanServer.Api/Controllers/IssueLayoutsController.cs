using CanbanServer.Api.Auditing;
using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public class IssueLayoutsController : ControllerBase
{
    private readonly IssueLayoutService _layouts;

    public IssueLayoutsController(IssueLayoutService layouts) => _layouts = layouts;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet("issue-layouts")]
    public async Task<ActionResult> Catalog([FromQuery] Guid teamId, CancellationToken ct) => Ok(await _layouts.CatalogAsync(Me, teamId, ct));

    [Audit("issueconfig.layout.create", AuditTarget.Body, ObjectType = "layout")]
    [HttpPost("issue-layouts/{kind}")]
    public async Task<ActionResult> Create(string kind, [FromBody] IssueLayoutRequest request, CancellationToken ct) =>
        Ok(await _layouts.CreateAsync(Me, kind, request, ct));

    [Audit("issueconfig.layout.update", AuditTarget.IssueLayout)]
    [HttpPut("issue-layouts/item/{id:guid}")]
    public async Task<ActionResult> Update(Guid id, [FromBody] IssueLayoutRequest request, CancellationToken ct) =>
        Ok(await _layouts.UpdateAsync(id, Me, request, ct));

    [Audit("issueconfig.layout.delete", AuditTarget.IssueLayout)]
    [HttpDelete("issue-layouts/item/{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _layouts.DeleteAsync(id, Me, ct);
        return NoContent();
    }

    [Audit("space.layout", AuditTarget.Board, "boardId")]
    [HttpPut("boards/{boardId:guid}/issue-layout")]
    public async Task<ActionResult> Assign(Guid boardId, [FromBody] BoardIssueLayoutRequest request, CancellationToken ct) =>
        Ok(await _layouts.AssignAsync(boardId, Me, request, ct));
}
