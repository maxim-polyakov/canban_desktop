using Microsoft.AspNetCore.Mvc;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class QuestsController : ControllerBase
{
    private readonly IQuestService _questService;

    public QuestsController(IQuestService questService) => _questService = questService;

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<QuestDto>> Get(Guid id, CancellationToken ct)
    {
        var quest = await _questService.GetByIdAsync(id, ct);
        return quest == null ? NotFound() : Ok(quest);
    }

    [HttpGet("column/{columnId:guid}")]
    public async Task<ActionResult<List<QuestDto>>> GetByColumn(Guid columnId, CancellationToken ct)
    {
        var list = await _questService.GetByColumnIdAsync(columnId, ct);
        return Ok(list);
    }

    [HttpPost]
    public async Task<ActionResult<QuestDto>> Create([FromBody] CreateQuestRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var quest = await _questService.CreateAsync(request, userId.Value, ct);
        return CreatedAtAction(nameof(Get), new { id = quest.Id }, quest);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<QuestDto>> Update(Guid id, [FromBody] UpdateQuestRequest request, CancellationToken ct)
    {
        var quest = await _questService.UpdateAsync(id, request, ct);
        return quest == null ? NotFound() : Ok(quest);
    }

    /// <summary>Перемещение квеста между колонками (drag-n-drop). При переносе в «Готово» начисляется XP.</summary>
    [HttpPost("move")]
    public async Task<ActionResult<QuestDto>> Move([FromBody] MoveQuestRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var quest = await _questService.MoveAsync(request, userId.Value, ct);
        return quest == null ? NotFound() : Ok(quest);
    }

    [HttpPut("reorder")]
    public async Task<ActionResult> Reorder([FromBody] ReorderQuestsRequest request, CancellationToken ct)
    {
        await _questService.ReorderAsync(request, ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        var deleted = await _questService.DeleteAsync(id, ct);
        return deleted ? NoContent() : NotFound();
    }

}
