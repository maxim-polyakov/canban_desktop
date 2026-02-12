using Microsoft.AspNetCore.Mvc;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AchievementsController : ControllerBase
{
    private readonly IAchievementService _achievementService;

    public AchievementsController(IAchievementService achievementService) => _achievementService = achievementService;

    [HttpGet]
    public async Task<ActionResult<List<AchievementDto>>> GetAll(CancellationToken ct)
    {
        var list = await _achievementService.GetAllAsync(ct);
        return Ok(list);
    }

    [HttpGet("me")]
    public async Task<ActionResult<List<UserAchievementDto>>> GetMy(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        var list = await _achievementService.GetUserAchievementsAsync(userId, ct);
        return Ok(list);
    }

    private static Guid GetCurrentUserId() => Guid.Empty;
}
