namespace CanbanServer.Domain.Entities;

/// <summary>
/// Достижение: условие разблокировки (например, 10 квестов по фронту) и награда.
/// </summary>
public class Achievement
{
    public Guid Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? IconUrl { get; set; }
    public int? XpBonus { get; set; }
    /// <summary>Условие: например "CompleteQuestsInCategory:Frontend:10".</summary>
    public string ConditionType { get; set; } = string.Empty;
    public string? ConditionPayload { get; set; }
    public int Order { get; set; }

    public ICollection<UserAchievement> UserAchievements { get; set; } = new List<UserAchievement>();
    public ICollection<Skill> UnlocksSkills { get; set; } = new List<Skill>();
}
