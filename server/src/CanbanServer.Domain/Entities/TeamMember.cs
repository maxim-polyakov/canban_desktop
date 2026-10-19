namespace CanbanServer.Domain.Entities;

public class TeamMember
{
    public Guid Id { get; set; }
    public Guid TeamId { get; set; }
    public Guid UserId { get; set; }
    public TeamRole Role { get; set; }
    public DateTime JoinedAt { get; set; }
    /// <summary>Кто пригласил по email (null если добавлен не через приглашение).</summary>
    public Guid? InvitedByUserId { get; set; }

    public Team Team { get; set; } = null!;
    public User User { get; set; } = null!;
}

public enum TeamRole
{
    Member = 0,
    Developer = Member,
    Lead = 1,
    ProjectLead = Lead,
    Admin = 2,
    Viewer = 3
}
