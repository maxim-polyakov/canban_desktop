namespace CanbanServer.Domain.Entities;

/// <summary>
/// Событие для реалтайм-ленты: «Анна получила уровень 5!», «Сергей закрыл эпик за 2 дня».
/// </summary>
public class Activity
{
    public Guid Id { get; set; }
    public Guid TeamId { get; set; }
    public Guid UserId { get; set; }
    public ActivityType Type { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? PayloadJson { get; set; }
    public DateTime CreatedAt { get; set; }

    public Team Team { get; set; } = null!;
    public User User { get; set; } = null!;
}

public enum ActivityType
{
    LevelUp = 0,
    QuestCompleted = 1,
    EpicClosed = 2,
    AchievementUnlocked = 3,
    SkillUnlocked = 4,
    ReviewReceived = 5
}
