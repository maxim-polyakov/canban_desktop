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

    /// <summary>Human-readable key, e.g. KAN-12.</summary>
    public string IssueKey { get; set; } = string.Empty;
    public int IssueNumber { get; set; }
    public IssueType IssueType { get; set; } = IssueType.Task;
    public IssuePriority Priority { get; set; } = IssuePriority.Medium;
    /// <summary>Comma-separated labels for filtering.</summary>
    public string Labels { get; set; } = string.Empty;
    public string? Component { get; set; }
    public string? FixVersion { get; set; }
    public int? StoryPoints { get; set; }
    public Guid? SprintId { get; set; }

    public Column Column { get; set; } = null!;
    public Board Board { get; set; } = null!;
    public User? Assignee { get; set; }
    public Quest? ParentEpic { get; set; }
    public Sprint? Sprint { get; set; }
    public ICollection<Quest> SubQuests { get; set; } = new List<Quest>();
    public ICollection<QuestAssignee> Assignees { get; set; } = new List<QuestAssignee>();
    public ICollection<QuestReview> Reviews { get; set; } = new List<QuestReview>();
    public ICollection<QuestAttachment> Attachments { get; set; } = new List<QuestAttachment>();
    public ICollection<QuestNotificationRecipient> NotificationRecipients { get; set; } = new List<QuestNotificationRecipient>();
    public ICollection<QuestExternalNotificationRecipient> ExternalNotificationRecipients { get; set; } = new List<QuestExternalNotificationRecipient>();
    public ICollection<QuestComment> Comments { get; set; } = new List<QuestComment>();
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

public enum IssueType
{
    Epic = 0,
    Story = 1,
    Task = 2,
    Bug = 3,
    Subtask = 4
}

public enum IssuePriority
{
    Lowest = 0,
    Low = 1,
    Medium = 2,
    High = 3,
    Highest = 4
}
