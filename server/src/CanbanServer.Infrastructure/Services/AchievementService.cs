using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

public class AchievementService : IAchievementService
{
    private readonly CanbanDbContext _db;
    private readonly ICharacterXpService _xpService;
    private readonly CacheService _cache;

    public AchievementService(CanbanDbContext db, ICharacterXpService xpService, CacheService cache)
    {
        _db = db;
        _xpService = xpService;
        _cache = cache;
    }

    public async Task<List<AchievementDto>> GetAllAsync(CancellationToken ct = default)
    {
        return (await _cache.GetOrCreateAsync(
            "achievements:all",
            TimeSpan.FromMinutes(15),
            async _ =>
            {
                var list = await _db.Achievements.OrderBy(a => a.Order).ToListAsync(ct);
                return list.Select(a => new AchievementDto(a.Id, a.Key, a.Name, a.Description, HowToObtainText(a.ConditionType, a.ConditionPayload), a.IconUrl, a.XpBonus, a.Order)).ToList();
            },
            ct)) ?? new List<AchievementDto>();
    }

    private static string? HowToObtainText(string conditionType, string? payload)
    {
        if (string.IsNullOrWhiteSpace(conditionType)) return null;
        return conditionType switch
        {
            "FirstQuest" => "Выполните первый квест (перенесите карточку в колонку «Готово»).",
            "CompleteQuests" when !string.IsNullOrEmpty(payload) && int.TryParse(payload, out var n) => $"Выполните {n} квестов (перенесите в колонку «Готово»).",
            "CompleteQuestsInCategory" when !string.IsNullOrEmpty(payload) => $"Выполните квесты в категории: {payload.Replace(":", " — ", StringComparison.Ordinal)}.",
            "LevelUp" when !string.IsNullOrEmpty(payload) && int.TryParse(payload, out var lvl) => $"Достигните {lvl} уровня.",
            "TeamMember" => "Вступите в команду или создайте её.",
            "InviteMember" => "Пригласите участника в команду по email.",
            _ => string.IsNullOrEmpty(payload) ? conditionType : $"{conditionType}: {payload}",
        };
    }

    public async Task<List<UserAchievementDto>> GetUserAchievementsAsync(Guid userId, CancellationToken ct = default)
    {
        return (await _cache.GetOrCreateAsync(
            "achievements:user:" + userId,
            TimeSpan.FromMinutes(5),
            async _ =>
            {
                var list = await _db.UserAchievements
            .Include(ua => ua.Achievement)
            .Where(ua => ua.UserId == userId)
            .OrderByDescending(ua => ua.UnlockedAt)
            .ToListAsync(ct);
                return list.Select(ua => new UserAchievementDto(ua.AchievementId, ua.Achievement.Key, ua.Achievement.Name, ua.Achievement.IconUrl, ua.UnlockedAt)).ToList();
            },
            ct)) ?? new List<UserAchievementDto>();
    }

    public async Task TryGrantAchievementsForUserAsync(Guid userId, CancellationToken ct = default)
    {
        if (userId == Guid.Empty) return;

        var unlockedIds = (await _db.UserAchievements
            .Where(ua => ua.UserId == userId)
            .Select(ua => ua.AchievementId)
            .ToListAsync(ct))
            .ToHashSet();

        var achievements = await _db.Achievements.ToListAsync(ct);
        var toUnlock = achievements.Where(a => !unlockedIds.Contains(a.Id)).ToList();
        if (toUnlock.Count == 0) return;

        var completedQuestCount = await _db.QuestAssignees
            .CountAsync(a => a.UserId == userId && a.Quest.CompletedAt != null, ct);
        var completedByCategory = await _db.QuestAssignees
            .Where(a => a.UserId == userId && a.Quest.CompletedAt != null)
            .GroupBy(a => a.Quest.Category)
            .Select(g => new { Category = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Category, x => x.Count, ct);

        var isInTeam = await _db.TeamMembers.AnyAsync(tm => tm.UserId == userId, ct);

        var invitedCount = await _db.TeamMembers.CountAsync(tm => tm.InvitedByUserId == userId, ct);

        var character = await _db.Characters
            .Include(c => c.Level)
            .FirstOrDefaultAsync(c => c.UserId == userId, ct);
        var levelNumber = character?.Level?.LevelNumber ?? 0;

        var now = DateTime.UtcNow;
        var grantedWithBonus = new List<(int XpBonus, string Name)>();
        var grantedAchievementIds = new List<Guid>();
        foreach (var a in toUnlock)
        {
            var granted = a.ConditionType switch
            {
                "FirstQuest" => completedQuestCount >= 1,
                "CompleteQuests" => !string.IsNullOrEmpty(a.ConditionPayload) && int.TryParse(a.ConditionPayload, out var n) && completedQuestCount >= n,
                "CompleteQuestsInCategory" => IsCategoryTargetMet(a.ConditionPayload, completedByCategory),
                "TeamMember" => isInTeam,
                "LevelUp" => !string.IsNullOrEmpty(a.ConditionPayload) && int.TryParse(a.ConditionPayload, out var lvl) && levelNumber >= lvl,
                "InviteMember" => invitedCount >= 1,
                _ => false
            };
            if (granted)
            {
                _db.UserAchievements.Add(new UserAchievement
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    AchievementId = a.Id,
                    UnlockedAt = now
                });
                grantedAchievementIds.Add(a.Id);
                if (a.XpBonus.HasValue && a.XpBonus.Value > 0)
                    grantedWithBonus.Add((a.XpBonus.Value, a.Name));
            }
        }

        if (grantedAchievementIds.Count > 0)
        {
            var skillsUnlockedByAchievements = await _db.Skills
                .Where(s => s.RequiredAchievementId != null && grantedAchievementIds.Contains(s.RequiredAchievementId!.Value))
                .ToListAsync(ct);
            var existingSkillUnlockIds = (await _db.SkillUnlocks
                .Where(su => su.UserId == userId)
                .Select(su => su.SkillId)
                .ToListAsync(ct))
                .ToHashSet();
            foreach (var skill in skillsUnlockedByAchievements)
            {
                if (!existingSkillUnlockIds.Contains(skill.Id))
                {
                    _db.SkillUnlocks.Add(new SkillUnlock
                    {
                        Id = Guid.NewGuid(),
                        UserId = userId,
                        SkillId = skill.Id,
                        UnlockedAt = now
                    });
                    existingSkillUnlockIds.Add(skill.Id);
                }
            }
        }

        await _db.SaveChangesAsync(ct);

        if (grantedAchievementIds.Count > 0)
        {
            await _cache.InvalidateAsync("achievements:user:" + userId, ct);
            await _cache.InvalidateAsync("skilltree:user:" + userId, ct);
            await _cache.InvalidateAsync("skilltree:unlocked:" + userId, ct);
        }

        foreach (var (xpBonus, name) in grantedWithBonus)
            await _xpService.AwardAchievementAsync(userId, xpBonus, name, ct);
    }

    private static bool IsCategoryTargetMet(string? payload, IReadOnlyDictionary<QuestCategory, int> completedByCategory)
    {
        var parts = payload?.Split(':', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts is { Length: 2 }
            && Enum.TryParse<QuestCategory>(parts[0], true, out var category)
            && int.TryParse(parts[1], out var target)
            && completedByCategory.GetValueOrDefault(category) >= target;
    }
}
