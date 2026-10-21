namespace CanbanServer.Domain.Entities;

public class QuestComment
{
    public Guid Id { get; set; }
    public Guid QuestId { get; set; }
    public Guid AuthorUserId { get; set; }
    public string Text { get; set; } = string.Empty;
    public string? DocumentJson { get; set; }
    /// <summary>Internal notes are visible only to Service Desk agents, not to customers on the portal.</summary>
    public bool IsInternal { get; set; }
    public DateTime CreatedAt { get; set; }
    public Quest Quest { get; set; } = null!;
    public User AuthorUser { get; set; } = null!;
}
