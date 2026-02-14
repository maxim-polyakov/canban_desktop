using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface ILeaderboardService
{
    /// <summary>Рейтинг внутри команды за период (например, последняя неделя).</summary>
    Task<List<LeaderboardEntryDto>> GetTeamLeaderboardAsync(TeamLeaderboardRequest request, CancellationToken ct = default);
    /// <summary>KPI команды по дням за период (для графиков: XP и выполненные квесты).</summary>
    Task<List<TeamKpiPointDto>> GetTeamKpiAsync(Guid teamId, DateTime? from, DateTime? to, CancellationToken ct = default);
}
