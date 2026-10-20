namespace CanbanServer.Domain.Entities;

/// <summary>Administrative change recorded for a team. Kept without foreign keys so entries outlive deleted objects and users.</summary>
public class AuditEvent
{
    public Guid Id { get; set; }
    public Guid TeamId { get; set; }
    public Guid? BoardId { get; set; }
    public string? BoardName { get; set; }
    public Guid? ActorId { get; set; }
    public string ActorName { get; set; } = "";
    /// <summary>Dotted code, e.g. "workflow.transition.update"; the first segment is the category.</summary>
    public string Action { get; set; } = "";
    public string Category { get; set; } = "";
    public string? ObjectType { get; set; }
    public Guid? ObjectId { get; set; }
    public string? ObjectName { get; set; }
    public string? DetailsJson { get; set; }
    public string? IpAddress { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>Per-team audit log settings.</summary>
public class AuditSetting
{
    public Guid TeamId { get; set; }
    public int RetentionDays { get; set; } = 365;
}
