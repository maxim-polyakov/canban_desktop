using Microsoft.AspNetCore.Mvc;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class LeaderboardController : ControllerBase
{
    private readonly ILeaderboardService _leaderboard;

    public LeaderboardController(ILeaderboardService leaderboard) => _leaderboard = leaderboard;

    /// <summary>Рейтинг внутри команды за период (по умолчанию — последняя неделя).</summary>
    [HttpGet("team/{teamId:guid}")]
    public async Task<ActionResult<List<LeaderboardEntryDto>>> GetTeamLeaderboard(
        Guid teamId,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] int limit = 10,
        CancellationToken ct = default)
    {
        var request = new TeamLeaderboardRequest(teamId, from, to, limit);
        var list = await _leaderboard.GetTeamLeaderboardAsync(request, ct);
        return Ok(list);
    }

    /// <summary>KPI команды по дням за период (для графиков: набранный XP и выполненные квесты).</summary>
    [HttpGet("team/{teamId:guid}/kpi")]
    public async Task<ActionResult<List<TeamKpiPointDto>>> GetTeamKpi(
        Guid teamId,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        CancellationToken ct = default)
    {
        var list = await _leaderboard.GetTeamKpiAsync(teamId, from, to, ct);
        return Ok(list);
    }
}
