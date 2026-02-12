using Microsoft.AspNetCore.Mvc;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ActivityController : ControllerBase
{
    private readonly IActivityFeedService _activityFeed;

    public ActivityController(IActivityFeedService activityFeed) => _activityFeed = activityFeed;

    [HttpGet("team/{teamId:guid}")]
    public async Task<ActionResult<List<ActivityDto>>> GetFeed(Guid teamId, [FromQuery] int limit = 20, [FromQuery] DateTime? before = null, CancellationToken ct = default)
    {
        var request = new ActivityFeedRequest(limit, before);
        var list = await _activityFeed.GetFeedAsync(teamId, request, ct);
        return Ok(list);
    }
}
