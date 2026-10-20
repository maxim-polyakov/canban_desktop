using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public class FilterSubscriptionsController : ControllerBase
{
    private readonly FilterSubscriptionService _subscriptions;

    public FilterSubscriptionsController(FilterSubscriptionService subscriptions) => _subscriptions = subscriptions;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet("filterSubscriptions")]
    public async Task<ActionResult> List([FromQuery] Guid? filterId, CancellationToken ct) => Ok(await _subscriptions.ListAsync(Me, filterId, ct));

    [HttpGet("filterSubscriptions/groups")]
    public async Task<ActionResult> Groups(CancellationToken ct) => Ok(await _subscriptions.GroupsAsync(Me, ct));

    [HttpPost("savedFilters/{filterId:guid}/subscriptions")]
    public async Task<ActionResult> Create(Guid filterId, [FromBody] FilterSubscriptionRequest request, CancellationToken ct) =>
        Ok(await _subscriptions.CreateAsync(Me, filterId, request, ct));

    [HttpPut("filterSubscriptions/{id:guid}")]
    public async Task<ActionResult> Update(Guid id, [FromBody] FilterSubscriptionRequest request, CancellationToken ct) =>
        Ok(await _subscriptions.UpdateAsync(Me, id, request, ct));

    [HttpDelete("filterSubscriptions/{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _subscriptions.DeleteAsync(Me, id, ct);
        return NoContent();
    }

    [HttpPost("filterSubscriptions/{id:guid}/run")]
    public async Task<ActionResult> Run(Guid id, CancellationToken ct) => Ok(new { sent = await _subscriptions.RunNowAsync(Me, id, ct) });
}
