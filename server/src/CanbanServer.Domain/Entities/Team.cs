namespace CanbanServer.Domain.Entities;

public class Team
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
    /// <summary>Создатель команды — только он может удалить команду.</summary>
    public Guid? OwnerId { get; set; }
    /// <summary>Project key used for issue keys, e.g. KAN.</summary>
    public string Key { get; set; } = "KAN";

    public ICollection<TeamMember> Members { get; set; } = new List<TeamMember>();
    public ICollection<Board> Boards { get; set; } = new List<Board>();
}
