namespace CanbanServer.Domain.Entities;

public class Column
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public string Title { get; set; } = string.Empty;
    public int Order { get; set; }
    public ColumnKind Kind { get; set; }
    public DateTime CreatedAt { get; set; }

    public Board Board { get; set; } = null!;
    public ICollection<Quest> Quests { get; set; } = new List<Quest>();
}

/// <summary>
/// Тип колонки: обычная или «Готово» (влияет на начисление XP при переносе).
/// </summary>
public enum ColumnKind
{
    Backlog = 0,
    InProgress = 1,
    Review = 2,
    Done = 3,
    Custom = 4,
    Archive = 5
}
