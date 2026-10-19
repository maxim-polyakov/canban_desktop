using Microsoft.AspNetCore.Mvc;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BoardsController : ControllerBase
{
    private readonly IBoardService _boardService;
    private readonly IProjectAccessService _access;

    public BoardsController(IBoardService boardService, IProjectAccessService access) { _boardService = boardService; _access = access; }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<BoardDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        var access = await _access.GetBoardAccessAsync(id, userId.Value, ct); if (access.Status != ProjectAccessStatus.Success) return Forbid();
        var board = await _boardService.GetByIdAsync(id, ct);
        return board == null ? NotFound() : Ok(board);
    }

    [HttpGet("team/{teamId:guid}")]
    public async Task<ActionResult<List<BoardDto>>> GetByTeam(Guid teamId, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        var access = await _access.GetTeamAccessAsync(teamId, userId.Value, ct); if (access.Status != ProjectAccessStatus.Success) return Forbid();
        var list = await _boardService.GetByTeamIdAsync(teamId, ct);
        return Ok(list);
    }

    [HttpPost]
    public async Task<ActionResult<BoardDto>> Create([FromBody] CreateBoardRequest request, CancellationToken ct)
    {
        var createdByUserId = User.GetUserId();
        if (!createdByUserId.HasValue) return Unauthorized();
        var access = await _access.GetTeamAccessAsync(request.TeamId, createdByUserId.Value, ct);
        if (access.Status != ProjectAccessStatus.Success || access.Permission < BoardPermission.Manage) return Forbid();
        var board = await _boardService.CreateAsync(request, createdByUserId, ct);
        return CreatedAtAction(nameof(Get), new { id = board.Id }, board);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<BoardDto>> Update(Guid id, [FromBody] UpdateBoardRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        var access = await _access.GetBoardAccessAsync(id, userId.Value, ct);
        if (access.Status != ProjectAccessStatus.Success || access.Permission < BoardPermission.Manage) return Forbid();
        var board = await _boardService.UpdateAsync(id, request, ct);
        return board == null ? NotFound() : Ok(board);
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        var currentUserId = User.GetUserId();
        var result = await _boardService.DeleteAsync(id, currentUserId, ct);
        if (result == null) return NotFound();
        if (result == false) return Forbid();
        return NoContent();
    }
}
