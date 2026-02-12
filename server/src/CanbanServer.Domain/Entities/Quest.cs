namespace CanbanServer.Domain.Entities;

/// <summary>
/// Задача как «квест»: при закрытии даёт опыт, учитывается в ачивках и дереве навыков.
/// </summary>
public class Quest
{
    public Guid Id { get; set; }
    public Guid ColumnId { get; set; }
    public Guid BoardId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid? AssigneeId { get; set; }
    public int Order { get; set; }
    public DateTime? DueDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    /// <summary>Категория для дерева навыков: Frontend, Backend, DevOps и т.д.</summary>
    public QuestCategory Category { get; set; }
    public int XpReward { get; set; }
    /// <summary>Эпик: закрытие за N дней даёт бонус в ленту активности.</summary>
    public bool IsEpic { get; set; }
    public Guid? ParentEpicId { get; set; }

    public Column Column { get; set; } = null!;
    public Board Board { get; set; } = null!;
    public User? Assignee { get; set; }
    public Quest? ParentEpic { get; set; }
    public ICollection<Quest> SubQuests { get; set; } = new List<Quest>();
    public ICollection<QuestReview> Reviews { get; set; } = new List<QuestReview>();
}

public enum QuestCategory
{
    Frontend = 0,
    Backend = 1,
    DevOps = 2,
    Design = 3,
    QA = 4,
    Other = 5
}
