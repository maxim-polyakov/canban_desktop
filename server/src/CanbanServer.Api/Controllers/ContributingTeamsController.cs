using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/boards/{boardId:guid}/contributing-teams")]
public class ContributingTeamsController : ControllerBase
{
    private readonly ContributingTeamService _teams;

    public ContributingTeamsController(ContributingTeamService teams) => _teams = teams;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet]
    public async Task<ActionResult> Get(Guid boardId, CancellationToken ct) => Ok(await _teams.GetAsync(boardId, Me, ct));

    [HttpGet("search")]
    public async Task<ActionResult> Search(Guid boardId, [FromQuery] string? q, CancellationToken ct) =>
        Ok(await _teams.SearchAsync(boardId, Me, q, ct));

    [HttpPut]
    public async Task<ActionResult> Set(Guid boardId, [FromBody] ContributingTeamsRequest request, CancellationToken ct) =>
        Ok(await _teams.SetAsync(boardId, Me, request.TeamIds, ct));
}
