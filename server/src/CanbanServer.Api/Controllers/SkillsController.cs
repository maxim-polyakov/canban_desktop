using Microsoft.AspNetCore.Mvc;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SkillsController : ControllerBase
{
    private readonly ISkillTreeService _skillTreeService;

    public SkillsController(ISkillTreeService skillTreeService) => _skillTreeService = skillTreeService;

    [HttpGet("tree")]
    public async Task<ActionResult<SkillTreeDto>> GetTree(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var tree = await _skillTreeService.GetTreeForUserAsync(userId.Value, ct);
        return Ok(tree);
    }

    [HttpGet("unlocked")]
    public async Task<ActionResult<List<SkillDto>>> GetUnlocked(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var list = await _skillTreeService.GetUnlockedSkillsAsync(userId.Value, ct);
        return Ok(list);
    }

    /// <summary>Дерево навыков для другого пользователя (для просмотра профиля).</summary>
    [HttpGet("user/{userId:guid}/tree")]
    public async Task<ActionResult<SkillTreeDto>> GetTreeByUser(Guid userId, CancellationToken ct)
    {
        var tree = await _skillTreeService.GetTreeForUserAsync(userId, ct);
        return Ok(tree);
    }

    /// <summary>Разблокированные навыки другого пользователя.</summary>
    [HttpGet("user/{userId:guid}/unlocked")]
    public async Task<ActionResult<List<SkillDto>>> GetUnlockedByUser(Guid userId, CancellationToken ct)
    {
        var list = await _skillTreeService.GetUnlockedSkillsAsync(userId, ct);
        return Ok(list);
    }
}
