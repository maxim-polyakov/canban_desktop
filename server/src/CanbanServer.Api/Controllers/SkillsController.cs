using Microsoft.AspNetCore.Mvc;
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
        var userId = GetCurrentUserId();
        var tree = await _skillTreeService.GetTreeForUserAsync(userId, ct);
        return Ok(tree);
    }

    [HttpGet("unlocked")]
    public async Task<ActionResult<List<SkillDto>>> GetUnlocked(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        var list = await _skillTreeService.GetUnlockedSkillsAsync(userId, ct);
        return Ok(list);
    }

    private static Guid GetCurrentUserId() => Guid.Empty;
}
