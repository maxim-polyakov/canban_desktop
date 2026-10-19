using Microsoft.AspNetCore.Mvc;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ColumnsController : ControllerBase
{
    private readonly IColumnService _columnService;
    private readonly IQuestAttachmentService _attachmentService;
    private readonly IProjectAccessService _access;

    public ColumnsController(
        IColumnService columnService,
        IQuestAttachmentService attachmentService,
        IProjectAccessService access)
    {
        _columnService = columnService;
        _attachmentService = attachmentService;
        _access = access;
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ColumnDto>> Get(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        var status = await _attachmentService.CheckColumnAccessAsync(id, userId.Value, ct); if (status == QuestAttachmentOperationStatus.Forbidden) return Forbid();
        var col = await _columnService.GetByIdAsync(id, ct);
        return col == null ? NotFound() : Ok(col);
    }

    [HttpGet("board/{boardId:guid}")]
    public async Task<ActionResult<List<ColumnSummaryDto>>> GetByBoard(Guid boardId, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        var access = await _access.GetBoardAccessAsync(boardId, userId.Value, ct); if (access.Status != ProjectAccessStatus.Success) return Forbid();
        var list = await _columnService.GetByBoardIdAsync(boardId, ct);
        return Ok(list);
    }

    [HttpPost("board/{boardId:guid}")]
    public async Task<ActionResult<ColumnSummaryDto>> Create(Guid boardId, [FromBody] CreateColumnRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        var access = await _access.GetBoardAccessAsync(boardId, userId.Value, ct); if (access.Status != ProjectAccessStatus.Success || access.Permission < BoardPermission.Manage) return Forbid();
        var col = await _columnService.CreateAsync(boardId, request, ct);
        return CreatedAtAction(nameof(Get), new { id = col.Id }, col);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ColumnSummaryDto>> Update(Guid id, [FromBody] UpdateColumnRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        var existing = await _columnService.GetByIdAsync(id, ct); if (existing == null) return NotFound();
        var access = await _access.GetBoardAccessAsync(existing.BoardId, userId.Value, ct); if (access.Status != ProjectAccessStatus.Success || access.Permission < BoardPermission.Manage) return Forbid();
        var col = await _columnService.UpdateAsync(id, request, ct);
        return col == null ? NotFound() : Ok(col);
    }

    [HttpPut("board/{boardId:guid}/reorder")]
    public async Task<ActionResult> Reorder(Guid boardId, [FromBody] ReorderColumnsRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        var access = await _access.GetBoardAccessAsync(boardId, userId.Value, ct); if (access.Status != ProjectAccessStatus.Success || access.Permission < BoardPermission.Manage) return Forbid();
        await _columnService.ReorderAsync(boardId, request, ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var access = await _attachmentService.CheckColumnAccessAsync(id, userId.Value, ct);
        if (access == QuestAttachmentOperationStatus.NotFound) return NotFound();
        if (access == QuestAttachmentOperationStatus.Forbidden) return Forbid();

        var deleted = await _columnService.DeleteAsync(id, ct);
        return deleted ? NoContent() : NotFound();
    }
}
