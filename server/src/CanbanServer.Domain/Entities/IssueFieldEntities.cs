namespace CanbanServer.Domain.Entities;

public class IssueTypeDefinition
{
    public Guid Id { get; set; }
    public Guid TeamId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>Hierarchy level and behaviour: Epic, a standard type, or Subtask.</summary>
    public IssueType BaseType { get; set; } = IssueType.Task;
    public string Icon { get; set; } = "📌";
    public string Color { get; set; } = "#4bade8";
    public DateTime CreatedAt { get; set; }
}

public class CustomFieldDefinition
{
    public Guid Id { get; set; }
    public Guid TeamId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string FieldType { get; set; } = "text";
    public string OptionsJson { get; set; } = "[]";
    /// <summary>Comma-separated board ids; empty applies to every space of the team.</summary>
    public string Boards { get; set; } = string.Empty;
    /// <summary>Comma-separated base type numbers or custom type ids; empty applies to every type.</summary>
    public string IssueTypes { get; set; } = string.Empty;
    public bool Required { get; set; }
    public int Order { get; set; }
    public DateTime CreatedAt { get; set; }
}
