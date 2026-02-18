namespace CanbanServer.Domain.Entities;

/// <summary>Приглашение в команду. Участник добавляется только после подтверждения (Accept).</summary>
public class TeamInvite
{
    public Guid Id { get; set; }
    public Guid TeamId { get; set; }
    public Guid InvitedUserId { get; set; }
    public Guid InvitedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }

    public Team Team { get; set; } = null!;
    public User InvitedUser { get; set; } = null!;
    public User InvitedByUser { get; set; } = null!;
}
