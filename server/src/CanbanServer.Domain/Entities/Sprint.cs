namespace CanbanServer.Domain.Entities;

public enum SprintStatus
{
    Future = 0,
    Active = 1,
    Closed = 2
}

public class Sprint
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Goal { get; set; }
    public SprintStatus Status { get; set; } = SprintStatus.Future;
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int Order { get; set; }
    /// <summary>Close the sprint automatically at its end date, returning unfinished issues to the backlog.</summary>
    public bool AutoComplete { get; set; }
    public DateTime CreatedAt { get; set; }

    public Board Board { get; set; } = null!;
    public ICollection<Quest> Quests { get; set; } = new List<Quest>();
}
