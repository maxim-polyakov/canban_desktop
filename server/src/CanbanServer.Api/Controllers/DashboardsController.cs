using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

public record CopyDashboardRequest(string? Name);

[ApiController]
[Authorize]
[Route("api/dashboards")]
public class DashboardsController : ControllerBase
{
    private readonly DashboardService _dashboards;

    public DashboardsController(DashboardService dashboards) => _dashboards = dashboards;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet]
    public async Task<ActionResult> List([FromQuery] bool trash = false, CancellationToken ct = default) =>
        Ok(await _dashboards.ListAsync(Me, trash, ct));

    [HttpPost]
    public async Task<ActionResult> Create([FromBody] CreateDashboardRequest request, CancellationToken ct) =>
        Ok(await _dashboards.CreateAsync(Me, request, ct));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult> Get(Guid id, CancellationToken ct) => Ok(await _dashboards.GetAsync(id, Me, ct));

    [HttpPut("{id:guid}")]
    public async Task<ActionResult> Update(Guid id, [FromBody] UpdateDashboardRequest request, CancellationToken ct) =>
        Ok(await _dashboards.UpdateAsync(id, Me, request, ct));

    [HttpGet("{id:guid}/data")]
    public async Task<ActionResult> Data(Guid id, CancellationToken ct) => Ok(await _dashboards.DataAsync(id, Me, ct));

    [HttpPost("{id:guid}/copy")]
    public async Task<ActionResult> Copy(Guid id, [FromBody] CopyDashboardRequest? request, CancellationToken ct) =>
        Ok(await _dashboards.CopyAsync(id, Me, request?.Name, ct));

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Trash(Guid id, CancellationToken ct)
    {
        await _dashboards.TrashAsync(id, Me, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/restore")]
    public async Task<ActionResult> Restore(Guid id, CancellationToken ct)
    {
        await _dashboards.RestoreAsync(id, Me, ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}/purge")]
    public async Task<ActionResult> Purge(Guid id, CancellationToken ct)
    {
        await _dashboards.PurgeAsync(id, Me, ct);
        return NoContent();
    }

    [HttpPut("{id:guid}/star")]
    public async Task<ActionResult> Star(Guid id, CancellationToken ct)
    {
        await _dashboards.StarAsync(id, Me, true, ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}/star")]
    public async Task<ActionResult> Unstar(Guid id, CancellationToken ct)
    {
        await _dashboards.StarAsync(id, Me, false, ct);
        return NoContent();
    }
}
