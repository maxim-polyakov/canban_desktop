using Microsoft.EntityFrameworkCore;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Infrastructure.Data;

public static class SeedData
{
    public static async Task EnsureLevelsAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        if (await db.Levels.AnyAsync(ct)) return;
        var levels = new List<Level>();
        var xp = 0;
        for (var i = 1; i <= 50; i++)
        {
            xp += 100 * i;
            levels.Add(new Level { Id = i, LevelNumber = i, XpRequired = xp, Title = $"Уровень {i}" });
        }
        db.Levels.AddRange(levels);
        await db.SaveChangesAsync(ct);
    }

    public static async Task EnsureAchievementsAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        if (await db.Achievements.AnyAsync(ct)) return;
        var achievements = new List<Achievement>
        {
            new() { Id = Guid.NewGuid(), Key = "FirstQuest", Name = "Первый квест", Description = "Завершите первый квест на доске.", ConditionType = "FirstQuest", ConditionPayload = null, XpBonus = 10, Order = 0 },
            new() { Id = Guid.NewGuid(), Key = "Complete5Quests", Name = "Пять квестов", Description = "Выполните 5 квестов (перенесите в «Готово»).", ConditionType = "CompleteQuests", ConditionPayload = "5", XpBonus = 25, Order = 1 },
            new() { Id = Guid.NewGuid(), Key = "Complete10Quests", Name = "Десять квестов", Description = "Выполните 10 квестов.", ConditionType = "CompleteQuests", ConditionPayload = "10", XpBonus = 50, Order = 2 },
            new() { Id = Guid.NewGuid(), Key = "TeamMember", Name = "В команде", Description = "Создайте команду или вступите в неё.", ConditionType = "TeamMember", ConditionPayload = null, XpBonus = 15, Order = 3 },
            new() { Id = Guid.NewGuid(), Key = "InviteMember", Name = "Пригласитель", Description = "Пригласите участника в команду по email.", ConditionType = "InviteMember", ConditionPayload = null, XpBonus = 20, Order = 4 },
            new() { Id = Guid.NewGuid(), Key = "Level5", Name = "Пятый уровень", Description = "Достигните 5 уровня.", ConditionType = "LevelUp", ConditionPayload = "5", XpBonus = 30, Order = 5 },
        };
        db.Achievements.AddRange(achievements);
        await db.SaveChangesAsync(ct);
    }

    public static async Task EnsureSkillsAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        if (await db.Skills.AnyAsync(ct)) return;
        var firstQuest = await db.Achievements.FirstOrDefaultAsync(a => a.Key == "FirstQuest", ct);
        var complete5 = await db.Achievements.FirstOrDefaultAsync(a => a.Key == "Complete5Quests", ct);
        var complete10 = await db.Achievements.FirstOrDefaultAsync(a => a.Key == "Complete10Quests", ct);
        var teamMember = await db.Achievements.FirstOrDefaultAsync(a => a.Key == "TeamMember", ct);
        var inviteMember = await db.Achievements.FirstOrDefaultAsync(a => a.Key == "InviteMember", ct);

        var skills = new List<Skill>();
        if (firstQuest != null)
            skills.Add(new Skill { Id = Guid.NewGuid(), Key = "QuickLearner", Name = "Быстрое обучение", Description = "Повышает скорость освоения новых квестов.", RequiredAchievementId = firstQuest.Id, TreeOrder = 0, PositionX = 0, PositionY = 0 });
        if (complete5 != null)
            skills.Add(new Skill { Id = Guid.NewGuid(), Key = "Reliable", Name = "Надёжный", Description = "Меньше откладываете задачи на потом.", RequiredAchievementId = complete5.Id, TreeOrder = 1, PositionX = 1, PositionY = 0 });
        if (complete10 != null)
            skills.Add(new Skill { Id = Guid.NewGuid(), Key = "Productive", Name = "Продуктивный", Description = "Бонус к XP за серию выполненных квестов.", RequiredAchievementId = complete10.Id, TreeOrder = 2, PositionX = 2, PositionY = 0 });
        if (teamMember != null)
            skills.Add(new Skill { Id = Guid.NewGuid(), Key = "TeamPlayer", Name = "Командный игрок", Description = "Лучше работаете в команде.", RequiredAchievementId = teamMember.Id, TreeOrder = 3, PositionX = 0, PositionY = 1 });
        if (inviteMember != null)
            skills.Add(new Skill { Id = Guid.NewGuid(), Key = "Recruiter", Name = "Рекрутер", Description = "Приглашённые вами участники быстрее включаются в работу.", RequiredAchievementId = inviteMember.Id, TreeOrder = 4, PositionX = 1, PositionY = 1 });

        if (skills.Count > 0)
        {
            db.Skills.AddRange(skills);
            await db.SaveChangesAsync(ct);
        }
    }
}
