using CanbanServer.Api.Extensions;
using CanbanServer.Application.DTOs;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public class ServiceDeskController : ControllerBase
{
    private readonly ServiceDeskService _desk;

    public ServiceDeskController(ServiceDeskService desk) => _desk = desk;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet("boards/{boardId:guid}/service-desk")]
    public async Task<ActionResult> GetSettings(Guid boardId, CancellationToken ct) =>
        Ok(await _desk.GetSettingsAsync(boardId, Me, ct));

    [HttpPut("boards/{boardId:guid}/service-desk")]
    public async Task<ActionResult> UpdateSettings(Guid boardId, [FromBody] UpsertServiceDeskSettingsRequest request, CancellationToken ct) =>
        Ok(await _desk.UpdateSettingsAsync(boardId, Me, request, ct));

    [HttpGet("boards/{boardId:guid}/service-desk/request-types")]
    public async Task<ActionResult> ListRequestTypes(Guid boardId, [FromQuery] bool portal = false, CancellationToken ct = default) =>
        Ok(await _desk.ListRequestTypesAsync(boardId, Me, portal, ct));

    [HttpPost("boards/{boardId:guid}/service-desk/request-types")]
    public async Task<ActionResult> CreateRequestType(Guid boardId, [FromBody] SaveServiceRequestTypeRequest request, CancellationToken ct) =>
        Ok(await _desk.CreateRequestTypeAsync(boardId, Me, request, ct));

    [HttpPut("boards/{boardId:guid}/service-desk/request-types/{id:guid}")]
    public async Task<ActionResult> UpdateRequestType(Guid boardId, Guid id, [FromBody] SaveServiceRequestTypeRequest request, CancellationToken ct) =>
        Ok(await _desk.UpdateRequestTypeAsync(boardId, id, Me, request, ct));

    [HttpDelete("boards/{boardId:guid}/service-desk/request-types/{id:guid}")]
    public async Task<ActionResult> DeleteRequestType(Guid boardId, Guid id, CancellationToken ct)
    {
        await _desk.DeleteRequestTypeAsync(boardId, id, Me, ct);
        return NoContent();
    }

    [HttpGet("boards/{boardId:guid}/service-desk/queues")]
    public async Task<ActionResult> ListQueues(Guid boardId, [FromQuery] bool counts = true, CancellationToken ct = default) =>
        Ok(await _desk.ListQueuesAsync(boardId, Me, counts, ct));

    [HttpPost("boards/{boardId:guid}/service-desk/queues")]
    public async Task<ActionResult> CreateQueue(Guid boardId, [FromBody] SaveServiceQueueRequest request, CancellationToken ct) =>
        Ok(await _desk.CreateQueueAsync(boardId, Me, request, ct));

    [HttpPut("boards/{boardId:guid}/service-desk/queues/{id:guid}")]
    public async Task<ActionResult> UpdateQueue(Guid boardId, Guid id, [FromBody] SaveServiceQueueRequest request, CancellationToken ct) =>
        Ok(await _desk.UpdateQueueAsync(boardId, id, Me, request, ct));

    [HttpDelete("boards/{boardId:guid}/service-desk/queues/{id:guid}")]
    public async Task<ActionResult> DeleteQueue(Guid boardId, Guid id, CancellationToken ct)
    {
        await _desk.DeleteQueueAsync(boardId, id, Me, ct);
        return NoContent();
    }

    [HttpGet("boards/{boardId:guid}/service-desk/queues/{id:guid}/issues")]
    public async Task<ActionResult> QueueIssues(Guid boardId, Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default) =>
        Ok(await _desk.GetQueueIssuesAsync(boardId, id, Me, page, pageSize, ct));

    [HttpPost("boards/{boardId:guid}/service-desk/queues/{id:guid}/assign")]
    public async Task<ActionResult> AssignQueue(Guid boardId, Guid id, [FromBody] AssignQueueIssuesRequest request, CancellationToken ct)
    {
        await _desk.AssignQueueIssuesAsync(boardId, id, Me, request, ct);
        return Ok();
    }

    [HttpGet("boards/{boardId:guid}/service-desk/sla-policies")]
    public async Task<ActionResult> ListPolicies(Guid boardId, CancellationToken ct) =>
        Ok(await _desk.ListPoliciesAsync(boardId, Me, ct));

    [HttpPost("boards/{boardId:guid}/service-desk/sla-policies")]
    public async Task<ActionResult> CreatePolicy(Guid boardId, [FromBody] SaveSlaPolicyRequest request, CancellationToken ct) =>
        Ok(await _desk.CreatePolicyAsync(boardId, Me, request, ct));

    [HttpPut("boards/{boardId:guid}/service-desk/sla-policies/{id:guid}")]
    public async Task<ActionResult> UpdatePolicy(Guid boardId, Guid id, [FromBody] SaveSlaPolicyRequest request, CancellationToken ct) =>
        Ok(await _desk.UpdatePolicyAsync(boardId, id, Me, request, ct));

    [HttpDelete("boards/{boardId:guid}/service-desk/sla-policies/{id:guid}")]
    public async Task<ActionResult> DeletePolicy(Guid boardId, Guid id, CancellationToken ct)
    {
        await _desk.DeletePolicyAsync(boardId, id, Me, ct);
        return NoContent();
    }

    [HttpPost("boards/{boardId:guid}/service-desk/requests/{questId:guid}/approvals")]
    public async Task<ActionResult> CreateApproval(Guid boardId, Guid questId, [FromBody] CreateApprovalRequest request, CancellationToken ct) =>
        Ok(await _desk.CreateApprovalAsync(boardId, questId, Me, request, ct));

    [HttpPost("service-desk/approvals/{id:guid}/decide")]
    public async Task<ActionResult> DecideApproval(Guid id, [FromBody] DecideApprovalRequest request, CancellationToken ct) =>
        Ok(await _desk.DecideApprovalAsync(id, Me, request, ct));

    [HttpGet("portal")]
    public async Task<ActionResult> ListPortals(CancellationToken ct) =>
        Ok(await _desk.ListPortalsAsync(Me, ct));

    [HttpGet("portal/{slug}")]
    public async Task<ActionResult> GetPortal(string slug, CancellationToken ct) =>
        Ok(await _desk.GetPortalAsync(slug, Me, ct));

    [HttpGet("portal/{slug}/requests")]
    public async Task<ActionResult> MyRequests(string slug, CancellationToken ct) =>
        Ok(await _desk.MyRequestsAsync(Me, slug, ct));

    [HttpGet("portal/requests/mine")]
    public async Task<ActionResult> AllMyRequests(CancellationToken ct) =>
        Ok(await _desk.MyRequestsAsync(Me, null, ct));

    [HttpPost("portal/{slug}/request-types/{typeId:guid}/requests")]
    public async Task<ActionResult> CreateRequest(string slug, Guid typeId, [FromBody] CreatePortalRequestRequest request, CancellationToken ct) =>
        Ok(await _desk.CreatePortalRequestAsync(slug, typeId, Me, request, ct));

    [HttpGet("portal/{slug}/requests/{questId:guid}")]
    public async Task<ActionResult> GetRequest(string slug, Guid questId, CancellationToken ct) =>
        Ok(await _desk.GetPortalRequestAsync(slug, questId, Me, ct));

    [HttpPost("portal/{slug}/requests/{questId:guid}/comments")]
    public async Task<ActionResult> AddComment(string slug, Guid questId, [FromBody] ServiceDeskPortalCommentRequest request, CancellationToken ct) =>
        Ok(await _desk.AddPortalCommentAsync(slug, questId, Me, request, ct));
}
