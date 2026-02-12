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
}
