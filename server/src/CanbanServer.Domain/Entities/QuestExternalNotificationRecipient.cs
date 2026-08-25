namespace CanbanServer.Domain.Entities;

public class QuestExternalNotificationRecipient
{
    public Guid Id { get; set; }
    public Guid QuestId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public Quest Quest { get; set; } = null!;
}
