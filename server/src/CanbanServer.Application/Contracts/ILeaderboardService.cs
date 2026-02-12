using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface ILeaderboardService
{
    /// <summary>Рейтинг внутри команды за период (например, последняя неделя).</summary>
    Task<List<LeaderboardEntryDto>> GetTeamLeaderboardAsync(TeamLeaderboardRequest request, CancellationToken ct = default);
}
