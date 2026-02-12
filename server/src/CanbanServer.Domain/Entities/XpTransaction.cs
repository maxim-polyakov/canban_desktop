namespace CanbanServer.Domain.Entities;

/// <summary>
/// Запись о начислении XP: за закрытие квеста, дедлайн, ревью.
/// </summary>
public class XpTransaction
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public int Amount { get; set; }
    public XpSource Source { get; set; }
    public string? Description { get; set; }
    public Guid? RelatedQuestId { get; set; }
    public Guid? RelatedReviewId { get; set; }
    public DateTime CreatedAt { get; set; }

    public Character Character { get; set; } = null!;
}

public enum XpSource
{
    QuestCompleted = 0,
    DeadlineMet = 1,
    PeerReview = 2,
    EpicClosed = 3,
    Bonus = 4
}
