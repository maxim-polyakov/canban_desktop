using Microsoft.AspNetCore.Mvc;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TeamsController : ControllerBase
{
    private readonly ITeamService _teamService;

    public TeamsController(ITeamService teamService) => _teamService = teamService;

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<TeamDto>> Get(Guid id, CancellationToken ct)
    {
        var team = await _teamService.GetByIdAsync(id, ct);
        return team == null ? NotFound() : Ok(team);
    }

    [HttpGet("{teamId:guid}/members")]
    public async Task<ActionResult<List<TeamMemberDto>>> GetMembers(Guid teamId, CancellationToken ct)
    {
        var list = await _teamService.GetMembersAsync(teamId, ct);
        return Ok(list);
    }

    [HttpPost]
    public async Task<ActionResult<TeamDto>> Create([FromBody] CreateTeamRequest request, CancellationToken ct)
    {
        var ownerId = GetCurrentUserId();
        var team = await _teamService.CreateAsync(request, ownerId, ct);
        return CreatedAtAction(nameof(Get), new { id = team.Id }, team);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<TeamDto>> Update(Guid id, [FromBody] UpdateTeamRequest request, CancellationToken ct)
    {
        var team = await _teamService.UpdateAsync(id, request, ct);
        return team == null ? NotFound() : Ok(team);
    }

    [HttpPost("{teamId:guid}/members/{userId:guid}")]
    public async Task<ActionResult> AddMember(Guid teamId, Guid userId, CancellationToken ct)
    {
        var added = await _teamService.AddMemberAsync(teamId, userId, ct);
        return added ? NoContent() : BadRequest();
    }

    [HttpDelete("{teamId:guid}/members/{userId:guid}")]
    public async Task<ActionResult> RemoveMember(Guid teamId, Guid userId, CancellationToken ct)
    {
        var removed = await _teamService.RemoveMemberAsync(teamId, userId, ct);
        return removed ? NoContent() : NotFound();
    }

    private static Guid GetCurrentUserId() => Guid.Empty;
}
