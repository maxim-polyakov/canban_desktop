namespace CanbanServer.Domain.Entities;

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public DateTime CreatedAt { get; set; }

    public Character Character { get; set; } = null!;
    public ICollection<TeamMember> TeamMemberships { get; set; } = new List<TeamMember>();
    public ICollection<Quest> AssignedQuests { get; set; } = new List<Quest>();
    public ICollection<QuestReview> ReviewsGiven { get; set; } = new List<QuestReview>();
    public ICollection<UserAchievement> Achievements { get; set; } = new List<UserAchievement>();
    public ICollection<SkillUnlock> SkillUnlocks { get; set; } = new List<SkillUnlock>();
}
