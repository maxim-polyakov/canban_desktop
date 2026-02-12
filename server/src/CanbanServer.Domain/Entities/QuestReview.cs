namespace CanbanServer.Domain.Entities;

/// <summary>
/// Оценка коллеги за задачу (код-ревью, ревью результата) — даёт XP исполнителю.
/// </summary>
public class QuestReview
{
    public Guid Id { get; set; }
    public Guid QuestId { get; set; }
    public Guid ReviewerId { get; set; }
    public int Rating { get; set; }
    public string? Comment { get; set; }
    public int XpAwarded { get; set; }
    public DateTime CreatedAt { get; set; }

    public Quest Quest { get; set; } = null!;
    public User Reviewer { get; set; } = null!;
}
