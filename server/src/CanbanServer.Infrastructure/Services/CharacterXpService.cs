using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

public class CharacterXpService : ICharacterXpService
{
    private readonly CanbanDbContext _db;

    public CharacterXpService(CanbanDbContext db)
    {
        _db = db;
    }

    public async Task<(int XpGained, bool LevelUp, int NewLevel)> AwardQuestCompletedAsync(Guid userId, Quest quest, CancellationToken ct = default)
    {
        var character = await _db.Characters.Include(c => c.Level).FirstOrDefaultAsync(c => c.UserId == userId, ct);
        if (character == null) return (0, false, 0);
        var xp = quest.XpReward;
        if (quest.DueDate.HasValue && quest.CompletedAt.HasValue && quest.CompletedAt.Value <= quest.DueDate.Value)
            xp += (int)(quest.XpReward * 0.2); // бонус за дедлайн
        return await AddXpAsync(character, xp, XpSource.QuestCompleted, $"Квест: {quest.Title}", quest.Id, null, ct);
    }

    public async Task<(int XpGained, bool LevelUp, int NewLevel)> AwardDeadlineMetAsync(Guid userId, Quest quest, int bonusXp, CancellationToken ct = default)
    {
        var character = await _db.Characters.Include(c => c.Level).FirstOrDefaultAsync(c => c.UserId == userId, ct);
        if (character == null) return (0, false, 0);
        return await AddXpAsync(character, bonusXp, XpSource.DeadlineMet, $"Дедлайн: {quest.Title}", quest.Id, null, ct);
    }

    public async Task<(int XpGained, bool LevelUp, int NewLevel)> AwardPeerReviewAsync(Guid assigneeUserId, int xpAmount, Guid? questId, CancellationToken ct = default)
    {
        var character = await _db.Characters.Include(c => c.Level).FirstOrDefaultAsync(c => c.UserId == assigneeUserId, ct);
        if (character == null) return (0, false, 0);
        return await AddXpAsync(character, xpAmount, XpSource.PeerReview, "Оценка коллег", questId, null, ct);
    }

    private async Task<(int XpGained, bool LevelUp, int NewLevel)> AddXpAsync(Character character, int amount, XpSource source, string description, Guid? questId, Guid? reviewId, CancellationToken ct)
    {
        if (amount <= 0) return (0, false, character.Level?.LevelNumber ?? 1);
        var tx = new XpTransaction
        {
            Id = Guid.NewGuid(),
            CharacterId = character.Id,
            Amount = amount,
            Source = source,
            Description = description,
            RelatedQuestId = questId,
            RelatedReviewId = reviewId,
            CreatedAt = DateTime.UtcNow
        };
        _db.XpTransactions.Add(tx);
        character.TotalXp += amount;
        character.UpdatedAt = DateTime.UtcNow;

        var levels = await _db.Levels.OrderBy(l => l.LevelNumber).ToListAsync(ct);
        var newLevel = character.LevelId;
        foreach (var l in levels)
        {
            if (character.TotalXp >= l.XpRequired)
                newLevel = l.Id;
        }
        var levelUp = newLevel != character.LevelId;
        character.LevelId = newLevel;
        var levelEntity = levels.FirstOrDefault(l => l.Id == newLevel);
        await _db.SaveChangesAsync(ct);
        return (amount, levelUp, levelEntity?.LevelNumber ?? 1);
    }
}
