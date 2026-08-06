namespace CanbanServer.Domain.Entities;

public class QuestComment
{
    public Guid Id { get; set; }
    public Guid QuestId { get; set; }
    public Guid AuthorUserId { get; set; }
    public string Text { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public Quest Quest { get; set; } = null!;
    public User AuthorUser { get; set; } = null!;
}
