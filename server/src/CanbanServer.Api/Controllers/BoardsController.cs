using Microsoft.AspNetCore.Mvc;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BoardsController : ControllerBase
{
    private readonly IBoardService _boardService;

    public BoardsController(IBoardService boardService) => _boardService = boardService;

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<BoardDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var board = await _boardService.GetByIdAsync(id, ct);
        return board == null ? NotFound() : Ok(board);
    }

    [HttpGet("team/{teamId:guid}")]
    public async Task<ActionResult<List<BoardDto>>> GetByTeam(Guid teamId, CancellationToken ct)
    {
        var list = await _boardService.GetByTeamIdAsync(teamId, ct);
        return Ok(list);
    }

    [HttpPost]
    public async Task<ActionResult<BoardDto>> Create([FromBody] CreateBoardRequest request, CancellationToken ct)
    {
        var board = await _boardService.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = board.Id }, board);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<BoardDto>> Update(Guid id, [FromBody] UpdateBoardRequest request, CancellationToken ct)
    {
        var board = await _boardService.UpdateAsync(id, request, ct);
        return board == null ? NotFound() : Ok(board);
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        var deleted = await _boardService.DeleteAsync(id, ct);
        return deleted ? NoContent() : NotFound();
    }
}
