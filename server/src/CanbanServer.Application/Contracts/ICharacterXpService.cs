using CanbanServer.Domain.Entities;

namespace CanbanServer.Application.Contracts;

/// <summary>
/// Внутренний сервис начисления XP: за закрытие квеста, дедлайн, ревью. Возвращает (xp, levelUp, newLevel).
/// </summary>
public interface ICharacterXpService
{
    Task<(int XpGained, bool LevelUp, int NewLevel)> AwardQuestCompletedAsync(Guid userId, Quest quest, CancellationToken ct = default);
    Task<(int XpGained, bool LevelUp, int NewLevel)> AwardDeadlineMetAsync(Guid userId, Quest quest, int bonusXp, CancellationToken ct = default);
    Task<(int XpGained, bool LevelUp, int NewLevel)> AwardPeerReviewAsync(Guid assigneeUserId, int xpAmount, Guid? questId, CancellationToken ct = default);
}
