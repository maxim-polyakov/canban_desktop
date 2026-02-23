using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

public class SkillTreeService : ISkillTreeService
{
    private readonly CanbanDbContext _db;
    private readonly CacheService _cache;

    public SkillTreeService(CanbanDbContext db, CacheService cache)
    {
        _db = db;
        _cache = cache;
    }

    public async Task<SkillTreeDto> GetTreeForUserAsync(Guid userId, CancellationToken ct = default)
    {
        return (await _cache.GetOrCreateAsync(
            "skilltree:user:" + userId,
            TimeSpan.FromMinutes(5),
            async _ =>
            {
                var skills = await _db.Skills.Include(s => s.RequiredAchievement).OrderBy(s => s.TreeOrder).ToListAsync(ct);
                var unlockedIds = await _db.SkillUnlocks.Where(su => su.UserId == userId).Select(su => su.SkillId).ToListAsync(ct);
                var skillDtos = skills.Select(s => new SkillDto(s.Id, s.Key, s.Name, s.Description, HowToUnlockText(s), s.IconUrl, s.ParentSkillId, s.TreeOrder, s.PositionX, s.PositionY, unlockedIds.Contains(s.Id))).ToList();
                var connections = skills.Where(s => s.ParentSkillId.HasValue).Select(s => new SkillNodeConnection(s.ParentSkillId!.Value, s.Id)).ToList();
                return new SkillTreeDto(skillDtos, connections);
            },
            ct)) ?? new SkillTreeDto(new List<SkillDto>(), new List<SkillNodeConnection>());
    }

    public async Task<List<SkillDto>> GetUnlockedSkillsAsync(Guid userId, CancellationToken ct = default)
    {
        return (await _cache.GetOrCreateAsync(
            "skilltree:unlocked:" + userId,
            TimeSpan.FromMinutes(5),
            async _ =>
            {
                var list = await _db.SkillUnlocks
            .Include(su => su.Skill).ThenInclude(s => s!.RequiredAchievement)
            .Where(su => su.UserId == userId)
            .OrderByDescending(su => su.UnlockedAt)
            .Select(su => su.Skill)
            .ToListAsync(ct);
                return list.Select(s => new SkillDto(s.Id, s.Key, s.Name, s.Description, HowToUnlockText(s), s.IconUrl, s.ParentSkillId, s.TreeOrder, s.PositionX, s.PositionY, true)).ToList();
            },
            ct)) ?? new List<SkillDto>();
    }

    private static string? HowToUnlockText(Skill s)
    {
        if (s.RequiredAchievement != null) return $"Получите достижение «{s.RequiredAchievement.Name}».";
        if (!string.IsNullOrWhiteSpace(s.RequiredQuestCondition)) return $"Условие: {s.RequiredQuestCondition}.";
        return null;
    }
}
