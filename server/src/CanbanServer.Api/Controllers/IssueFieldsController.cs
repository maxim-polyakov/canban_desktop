using CanbanServer.Api.Auditing;
using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public class IssueFieldsController : ControllerBase
{
    private readonly IssueFieldService _fields;

    public IssueFieldsController(IssueFieldService fields) => _fields = fields;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet("issue-config")]
    public async Task<ActionResult> Catalog(CancellationToken ct) => Ok(await _fields.CatalogAsync(Me, ct));

    [HttpGet("boards/{boardId:guid}/issue-config")]
    public async Task<ActionResult> ForBoard(Guid boardId, CancellationToken ct) => Ok(await _fields.ForBoardAsync(boardId, Me, ct));

    [Audit("issueconfig.type.create", AuditTarget.Body, ObjectType = "issuetype")]
    [HttpPost("issue-config/types")]
    public async Task<ActionResult> CreateType([FromBody] IssueTypeRequest request, CancellationToken ct) =>
        Ok(await _fields.CreateTypeAsync(Me, request, ct));

    [Audit("issueconfig.type.update", AuditTarget.IssueType)]
    [HttpPut("issue-config/types/{id:guid}")]
    public async Task<ActionResult> UpdateType(Guid id, [FromBody] IssueTypeRequest request, CancellationToken ct) =>
        Ok(await _fields.UpdateTypeAsync(id, Me, request, ct));

    [Audit("issueconfig.type.delete", AuditTarget.IssueType)]
    [HttpDelete("issue-config/types/{id:guid}")]
    public async Task<ActionResult> DeleteType(Guid id, CancellationToken ct)
    {
        await _fields.DeleteTypeAsync(id, Me, ct);
        return NoContent();
    }

    [Audit("issueconfig.field.create", AuditTarget.Body, ObjectType = "field")]
    [HttpPost("issue-config/fields")]
    public async Task<ActionResult> CreateField([FromBody] CustomFieldRequest request, CancellationToken ct) =>
        Ok(await _fields.CreateFieldAsync(Me, request, ct));

    [Audit("issueconfig.field.update", AuditTarget.CustomField)]
    [HttpPut("issue-config/fields/{id:guid}")]
    public async Task<ActionResult> UpdateField(Guid id, [FromBody] CustomFieldRequest request, CancellationToken ct) =>
        Ok(await _fields.UpdateFieldAsync(id, Me, request, ct));

    [Audit("issueconfig.field.delete", AuditTarget.CustomField)]
    [HttpDelete("issue-config/fields/{id:guid}")]
    public async Task<ActionResult> DeleteField(Guid id, CancellationToken ct)
    {
        await _fields.DeleteFieldAsync(id, Me, ct);
        return NoContent();
    }

    [HttpPut("quests/{questId:guid}/fields/{fieldId:guid}")]
    public async Task<ActionResult> SetValue(Guid questId, Guid fieldId, [FromBody] SetCustomFieldRequest request, CancellationToken ct) =>
        Ok(await _fields.SetValueAsync(questId, fieldId, request.Value, Me, ct));
}
