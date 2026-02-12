using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

public class AchievementService : IAchievementService
{
    private readonly CanbanDbContext _db;

    public AchievementService(CanbanDbContext db) => _db = db;

    public async Task<List<AchievementDto>> GetAllAsync(CancellationToken ct = default)
    {
        var list = await _db.Achievements.OrderBy(a => a.Order).ToListAsync(ct);
        return list.Select(a => new AchievementDto(a.Id, a.Key, a.Name, a.Description, a.IconUrl, a.XpBonus, a.Order)).ToList();
    }

    public async Task<List<UserAchievementDto>> GetUserAchievementsAsync(Guid userId, CancellationToken ct = default)
    {
        var list = await _db.UserAchievements
            .Include(ua => ua.Achievement)
            .Where(ua => ua.UserId == userId)
            .OrderByDescending(ua => ua.UnlockedAt)
            .ToListAsync(ct);
        return list.Select(ua => new UserAchievementDto(ua.AchievementId, ua.Achievement.Key, ua.Achievement.Name, ua.Achievement.IconUrl, ua.UnlockedAt)).ToList();
    }
}
