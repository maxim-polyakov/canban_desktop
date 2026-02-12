namespace CanbanServer.Application.DTOs;

/// <summary>
/// Рейтинг внутри команды за период (например, последняя неделя). Не общий — чтобы не демотивировать.
/// </summary>
public record TeamLeaderboardRequest(Guid TeamId, DateTime? From = null, DateTime? To = null, int Limit = 10);
public record LeaderboardEntryDto(int Rank, Guid UserId, string UserName, string? AvatarUrl, int TotalXpGained, int QuestsCompleted, int LevelNumber);
