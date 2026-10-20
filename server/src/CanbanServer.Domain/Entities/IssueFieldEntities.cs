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
    /// <summary>Child options of a cascading select in the default context: parent option → children.</summary>
    public string CascadeJson { get; set; } = "{}";
    public string? DefaultValueJson { get; set; }
    /// <summary>Extra contexts: spaces and issue types with their own options and default value.</summary>
    public string ContextsJson { get; set; } = "[]";
    /// <summary>Comma-separated board ids; empty applies to every space of the team.</summary>
    public string Boards { get; set; } = string.Empty;
    /// <summary>Comma-separated base type numbers or custom type ids; empty applies to every type.</summary>
    public string IssueTypes { get; set; } = string.Empty;
    public bool Required { get; set; }
    public int Order { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Screens, screen schemes, issue type screen schemes, field configurations and field configuration schemes.
/// Kind tells which; DataJson holds the kind-specific layout.
/// </summary>
public class IssueLayoutObject
{
    public Guid Id { get; set; }
    public Guid TeamId { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string DataJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>Schemes a space uses; null means the system default (every field, nothing required).</summary>
public class BoardIssueLayout
{
    public Guid BoardId { get; set; }
    public Guid? FieldConfigurationSchemeId { get; set; }
    public Guid? IssueTypeScreenSchemeId { get; set; }
    /// <summary>Shared workflows by issue type; null keeps the space's own transitions.</summary>
    public Guid? WorkflowSchemeId { get; set; }
    /// <summary>Shared permission scheme; null uses the built-in default.</summary>
    public Guid? PermissionSchemeId { get; set; }
    /// <summary>Shared notification scheme; null uses the built-in default.</summary>
    public Guid? NotificationSchemeId { get; set; }
}

public class UserGroup
{
    public Guid Id { get; set; }
    public Guid TeamId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
    public ICollection<UserGroupMember> Members { get; set; } = new List<UserGroupMember>();
}

public class UserGroupMember
{
    public Guid GroupId { get; set; }
    public Guid UserId { get; set; }
    public DateTime AddedAt { get; set; }
}
