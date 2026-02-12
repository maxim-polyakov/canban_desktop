using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface IAchievementService
{
    Task<List<AchievementDto>> GetAllAsync(CancellationToken ct = default);
    Task<List<UserAchievementDto>> GetUserAchievementsAsync(Guid userId, CancellationToken ct = default);
}
