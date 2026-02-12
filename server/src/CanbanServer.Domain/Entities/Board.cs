namespace CanbanServer.Domain.Entities;

public class Board
{
    public Guid Id { get; set; }
    public Guid TeamId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Order { get; set; }
    public DateTime CreatedAt { get; set; }

    public Team Team { get; set; } = null!;
    public ICollection<Column> Columns { get; set; } = new List<Column>();
}
