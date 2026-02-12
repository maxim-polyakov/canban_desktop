using Microsoft.AspNetCore.Mvc;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ColumnsController : ControllerBase
{
    private readonly IColumnService _columnService;

    public ColumnsController(IColumnService columnService) => _columnService = columnService;

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ColumnDto>> Get(Guid id, CancellationToken ct)
    {
        var col = await _columnService.GetByIdAsync(id, ct);
        return col == null ? NotFound() : Ok(col);
    }

    [HttpGet("board/{boardId:guid}")]
    public async Task<ActionResult<List<ColumnSummaryDto>>> GetByBoard(Guid boardId, CancellationToken ct)
    {
        var list = await _columnService.GetByBoardIdAsync(boardId, ct);
        return Ok(list);
    }

    [HttpPost("board/{boardId:guid}")]
    public async Task<ActionResult<ColumnSummaryDto>> Create(Guid boardId, [FromBody] CreateColumnRequest request, CancellationToken ct)
    {
        var col = await _columnService.CreateAsync(boardId, request, ct);
        return CreatedAtAction(nameof(Get), new { id = col.Id }, col);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ColumnSummaryDto>> Update(Guid id, [FromBody] UpdateColumnRequest request, CancellationToken ct)
    {
        var col = await _columnService.UpdateAsync(id, request, ct);
        return col == null ? NotFound() : Ok(col);
    }

    [HttpPut("board/{boardId:guid}/reorder")]
    public async Task<ActionResult> Reorder(Guid boardId, [FromBody] ReorderColumnsRequest request, CancellationToken ct)
    {
        await _columnService.ReorderAsync(boardId, request, ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        var deleted = await _columnService.DeleteAsync(id, ct);
        return deleted ? NoContent() : NotFound();
    }
}
