using Microsoft.AspNetCore.Mvc;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TeamsController : ControllerBase
{
    private readonly ITeamService _teamService;

    public TeamsController(ITeamService teamService) => _teamService = teamService;

    [HttpGet("my")]
    public async Task<ActionResult<List<TeamWithBoardsDto>>> GetMyTeamsWithBoards(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var list = await _teamService.GetMyTeamsWithBoardsAsync(userId.Value, ct);
        return Ok(list);
    }

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
        var ownerId = User.GetUserId();
        if (!ownerId.HasValue) return Unauthorized();
        var team = await _teamService.CreateAsync(request, ownerId.Value, ct);
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

    /// <summary>Отправить приглашение в команду по email. Приглашённый увидит его и сможет принять или отклонить.</summary>
    [HttpPost("{teamId:guid}/members/invite")]
    public async Task<ActionResult> InviteByEmail(Guid teamId, [FromBody] InviteMemberRequest? request, CancellationToken ct)
    {
        var inviterId = User.GetUserId();
        if (!inviterId.HasValue) return Unauthorized();
        if (request == null || string.IsNullOrWhiteSpace(request.Email))
            return BadRequest("Укажите email.");
        var result = await _teamService.InviteByEmailAsync(teamId, request.Email.Trim(), inviterId.Value, ct);
        if (result == null) return NotFound("Пользователь с таким email не найден.");
        if (result == false) return BadRequest("Пользователь уже в команде или приглашение уже отправлено.");
        return NoContent();
    }

    /// <summary>Список приглашений в команды для текущего пользователя.</summary>
    [HttpGet("invites/my")]
    public async Task<ActionResult<List<TeamInviteDto>>> GetMyInvites(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var list = await _teamService.GetPendingInvitesForUserAsync(userId.Value, ct);
        return Ok(list);
    }

    /// <summary>Принять приглашение в команду.</summary>
    [HttpPost("invites/{inviteId:guid}/accept")]
    public async Task<ActionResult> AcceptInvite(Guid inviteId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var result = await _teamService.AcceptInviteAsync(inviteId, userId.Value, ct);
        if (result == null) return NotFound();
        if (result == false) return Forbid();
        return NoContent();
    }

    /// <summary>Отклонить приглашение в команду.</summary>
    [HttpPost("invites/{inviteId:guid}/decline")]
    public async Task<ActionResult> DeclineInvite(Guid inviteId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var declined = await _teamService.DeclineInviteAsync(inviteId, userId.Value, ct);
        return declined ? NoContent() : NotFound();
    }

    [HttpDelete("{teamId:guid}/members/{userId:guid}")]
    public async Task<ActionResult> RemoveMember(Guid teamId, Guid userId, CancellationToken ct)
    {
        var currentUserId = User.GetUserId();
        var result = await _teamService.RemoveMemberAsync(teamId, userId, currentUserId, ct);
        if (result == null) return NotFound();
        if (result == false) return Forbid();
        return NoContent();
    }

    /// <summary>Выйти из команды (текущий пользователь исключает себя).</summary>
    [HttpPost("{teamId:guid}/leave")]
    public async Task<ActionResult> Leave(Guid teamId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var left = await _teamService.LeaveTeamAsync(teamId, userId.Value, ct);
        return left ? NoContent() : NotFound();
    }

    /// <summary>Удалить команду. Доступно только создателю команды.</summary>
    [HttpDelete("{teamId:guid}")]
    public async Task<ActionResult> Delete(Guid teamId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var deleted = await _teamService.DeleteAsync(teamId, userId.Value, ct);
        return deleted ? NoContent() : NotFound();
    }
}
