namespace CanbanServer.Domain.Entities;

public class SkillUnlock
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SkillId { get; set; }
    public DateTime UnlockedAt { get; set; }

    public User User { get; set; } = null!;
    public Skill Skill { get; set; } = null!;
}
