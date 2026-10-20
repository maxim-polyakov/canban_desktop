namespace CanbanServer.Domain.Entities;

public class Board
{
    public Guid Id { get; set; }
    public Guid TeamId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Order { get; set; }
    public DateTime CreatedAt { get; set; }
    /// <summary>User who created the board; only they can delete it.</summary>
    public Guid? CreatedByUserId { get; set; }
    /// <summary>Prefix for issue keys, e.g. KAN.</summary>
    public string KeyPrefix { get; set; } = "KAN";
    public int NextIssueNumber { get; set; } = 1;
    /// <summary>Space template the board was created from, e.g. kanban, scrum, recruitment.</summary>
    public string Template { get; set; } = "kanban";
    /// <summary>"team" (team-managed) or "company" (company-managed).</summary>
    public string ManagementType { get; set; } = "team";
    /// <summary>Who outside the team can use the space: "private", "limited" (view) or "open" (view and work).</summary>
    public string Access { get; set; } = "private";
    /// <summary>Comma-separated enabled views; empty means the legacy default set.</summary>
    public string Features { get; set; } = "";
    /// <summary>Uploaded image URL or a built-in avatar as "preset:&lt;name&gt;"; null shows the default tile.</summary>
    public string? AvatarUrl { get; set; }

    public Team Team { get; set; } = null!;
    public ICollection<Column> Columns { get; set; } = new List<Column>();
    public ICollection<Sprint> Sprints { get; set; } = new List<Sprint>();
}
