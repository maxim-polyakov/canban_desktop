using Microsoft.AspNetCore.Mvc;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SprintsController : ControllerBase
{
    private readonly ISprintService _sprintService;

    public SprintsController(ISprintService sprintService) => _sprintService = sprintService;

    [HttpGet("board/{boardId:guid}")]
    public async Task<ActionResult<List<SprintDto>>> GetByBoard(Guid boardId, CancellationToken ct)
        => Ok(await _sprintService.GetByBoardIdAsync(boardId, ct));

    [HttpGet("board/{boardId:guid}/active")]
    public async Task<ActionResult<SprintDto>> GetActive(Guid boardId, CancellationToken ct)
    {
        var sprint = await _sprintService.GetActiveByBoardIdAsync(boardId, ct);
        return sprint == null ? NotFound() : Ok(sprint);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SprintDto>> Get(Guid id, CancellationToken ct)
    {
        var sprint = await _sprintService.GetByIdAsync(id, ct);
        return sprint == null ? NotFound() : Ok(sprint);
    }

    [HttpPost("board/{boardId:guid}")]
    public async Task<ActionResult<SprintDto>> Create(Guid boardId, [FromBody] CreateSprintRequest request, CancellationToken ct)
    {
        try
        {
            var sprint = await _sprintService.CreateAsync(boardId, request, ct);
            return CreatedAtAction(nameof(Get), new { id = sprint.Id }, sprint);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<SprintDto>> Update(Guid id, [FromBody] UpdateSprintRequest request, CancellationToken ct)
    {
        var sprint = await _sprintService.UpdateAsync(id, request, ct);
        return sprint == null ? NotFound() : Ok(sprint);
    }

    [HttpPost("{id:guid}/start")]
    public async Task<ActionResult<SprintDto>> Start(Guid id, [FromBody] StartSprintRequest? request, CancellationToken ct)
    {
        try
        {
            var sprint = await _sprintService.StartAsync(id, request ?? new StartSprintRequest(null, null), ct);
            return sprint == null ? NotFound() : Ok(sprint);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPost("{id:guid}/complete")]
    public async Task<ActionResult<SprintDto>> Complete(Guid id, [FromBody] CompleteSprintRequest? request, CancellationToken ct)
    {
        try
        {
            var sprint = await _sprintService.CompleteAsync(
                id,
                request ?? new CompleteSprintRequest(null, true),
                ct);
            return sprint == null ? NotFound() : Ok(sprint);
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        try
        {
            var deleted = await _sprintService.DeleteAsync(id, ct);
            return deleted ? NoContent() : NotFound();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }
}
