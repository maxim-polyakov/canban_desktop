namespace CanbanServer.Domain.Entities;

/// <summary>
/// Узел дерева навыков. Открывается по достижению (ачивка) или по количеству квестов в категории.
/// Пример: «Выполнил 10 задач по фронтенду — открыл способность "Ускоренный код-ревью".»
/// </summary>
public class Skill
{
    public Guid Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? IconUrl { get; set; }
    public Guid? ParentSkillId { get; set; }
    public Guid? RequiredAchievementId { get; set; }
    /// <summary>Альтернатива ачивке: открыть по счётчику квестов, например "Frontend:10".</summary>
    public string? RequiredQuestCondition { get; set; }
    public int TreeOrder { get; set; }
    public int PositionX { get; set; }
    public int PositionY { get; set; }

    public Skill? ParentSkill { get; set; }
    public Achievement? RequiredAchievement { get; set; }
    public ICollection<Skill> Children { get; set; } = new List<Skill>();
    public ICollection<SkillUnlock> Unlocks { get; set; } = new List<SkillUnlock>();
}
