namespace CanbanServer.Domain.Entities;

public class QuestNotificationRecipient
{
    public Guid Id { get; set; }
    public Guid QuestId { get; set; }
    public Guid UserId { get; set; }
    public Quest Quest { get; set; } = null!;
    public User User { get; set; } = null!;
}
