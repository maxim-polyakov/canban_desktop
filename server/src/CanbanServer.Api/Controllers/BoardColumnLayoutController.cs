using CanbanServer.Api.Auditing;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/boards/{boardId:guid}/column-layout")]
public class BoardColumnLayoutController : ControllerBase
{
    private readonly BoardColumnLayoutService _layouts;
    private readonly IProjectAccessService _access;

    public BoardColumnLayoutController(BoardColumnLayoutService layouts, IProjectAccessService access)
    {
        _layouts = layouts;
        _access = access;
    }

    private async Task<bool> AllowedAsync(Guid boardId, BoardPermission level, CancellationToken ct)
    {
        var userId = User.GetUserId() ?? throw new UnauthorizedAccessException();
        var access = await _access.GetBoardAccessAsync(boardId, userId, ct);
        return access.Status == ProjectAccessStatus.Success && access.Permission >= level;
    }

    [HttpGet]
    public async Task<ActionResult<BoardColumnLayoutDto>> Get(Guid boardId, CancellationToken ct)
    {
        if (!await AllowedAsync(boardId, BoardPermission.View, ct)) return Forbid();
        return Ok(await _layouts.GetAsync(boardId, ct));
    }

    [Audit("board.columns.publish", AuditTarget.Board, "boardId", ObjectType = "board")]
    [HttpPut]
    public async Task<ActionResult<BoardColumnLayoutDto>> Publish(Guid boardId, [FromBody] PublishColumnLayoutRequest request, CancellationToken ct)
    {
        if (!await AllowedAsync(boardId, BoardPermission.Manage, ct)) return Forbid();
        return Ok(await _layouts.PublishAsync(boardId, request, ct));
    }

    [Audit("board.columns.reset", AuditTarget.Board, "boardId", ObjectType = "board")]
    [HttpDelete]
    public async Task<ActionResult<BoardColumnLayoutDto>> Reset(Guid boardId, CancellationToken ct)
    {
        if (!await AllowedAsync(boardId, BoardPermission.Manage, ct)) return Forbid();
        return Ok(await _layouts.ResetAsync(boardId, ct));
    }
}
