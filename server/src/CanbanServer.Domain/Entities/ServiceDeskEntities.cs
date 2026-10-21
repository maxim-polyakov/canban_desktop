namespace CanbanServer.Domain.Entities;

/// <summary>Per-space Service Desk settings: portal slug and welcome text.</summary>
public class ServiceDeskSettings
{
    public Guid BoardId { get; set; }
    public bool Enabled { get; set; }
    public string PortalSlug { get; set; } = "";
    public string WelcomeTitle { get; set; } = "Центр поддержки";
    public string? WelcomeText { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Board Board { get; set; } = null!;
}

/// <summary>Portal request type: maps a customer form to an issue and optional queue/SLA.</summary>
public class ServiceRequestType
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string Icon { get; set; } = "help";
    public IssueType IssueType { get; set; } = IssueType.Task;
    public Guid? FormId { get; set; }
    public Guid? QueueId { get; set; }
    public Guid? SlaPolicyId { get; set; }
    public string FieldsJson { get; set; } = "[]";
    public int Order { get; set; }
    public bool IsEnabled { get; set; } = true;
    public Board Board { get; set; } = null!;
}

/// <summary>Agent queue backed by a JQL filter.</summary>
public class ServiceQueue
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string Jql { get; set; } = "statusCategory != Done ORDER BY created DESC";
    public int Order { get; set; }
    public Guid? DefaultGroupId { get; set; }
    public Board Board { get; set; } = null!;
}

/// <summary>SLA goals for first response and resolution.</summary>
public class SlaPolicy
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public string Name { get; set; } = "";
    public int FirstResponseMinutes { get; set; } = 240;
    public int ResolutionMinutes { get; set; } = 1440;
    /// <summary>JSON array of status titles that pause the clocks, e.g. ["Ожидает пользователя"].</summary>
    public string PauseStatusTitlesJson { get; set; } = "[\"Ожидает пользователя\"]";
    /// <summary>Working calendar JSON: {\"timezone\":\"Europe/Moscow\",\"weekdays\":[1,2,3,4,5],\"start\":\"09:00\",\"end\":\"18:00\"}.</summary>
    public string CalendarJson { get; set; } = "{\"timezone\":\"Europe/Moscow\",\"weekdays\":[1,2,3,4,5],\"start\":\"09:00\",\"end\":\"18:00\"}";
    public Board Board { get; set; } = null!;
}

public static class SlaMetrics
{
    public const string FirstResponse = "first_response";
    public const string Resolution = "resolution";
}

public static class SlaClockStatuses
{
    public const string Running = "running";
    public const string Paused = "paused";
    public const string Met = "met";
    public const string Breached = "breached";
}

/// <summary>Running or finished SLA clock for a request.</summary>
public class SlaClock
{
    public Guid Id { get; set; }
    public Guid QuestId { get; set; }
    public Guid PolicyId { get; set; }
    public string Metric { get; set; } = SlaMetrics.FirstResponse;
    public string Status { get; set; } = SlaClockStatuses.Running;
    public DateTime StartedAt { get; set; }
    public DateTime TargetAt { get; set; }
    public DateTime? PausedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime? BreachedAt { get; set; }
    public DateTime? WarnedAt { get; set; }
    public int ElapsedWorkingMinutes { get; set; }
    public Quest Quest { get; set; } = null!;
    public SlaPolicy Policy { get; set; } = null!;
}

public static class ApprovalStatuses
{
    public const string Pending = "pending";
    public const string Approved = "approved";
    public const string Rejected = "rejected";
    public const string Cancelled = "cancelled";
}

/// <summary>Multi-approver gate that can block a workflow transition.</summary>
public class ApprovalRequest
{
    public Guid Id { get; set; }
    public Guid QuestId { get; set; }
    public Guid BoardId { get; set; }
    public string Title { get; set; } = "Согласование";
    public string Status { get; set; } = ApprovalStatuses.Pending;
    public int RequiredApprovals { get; set; } = 1;
    public string? BlockedTransitionKey { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DecidedAt { get; set; }
    public Quest Quest { get; set; } = null!;
    public Board Board { get; set; } = null!;
    public ICollection<ApprovalDecision> Decisions { get; set; } = new List<ApprovalDecision>();
}

public class ApprovalDecision
{
    public Guid Id { get; set; }
    public Guid ApprovalRequestId { get; set; }
    public Guid? ApproverUserId { get; set; }
    public Guid? ApproverGroupId { get; set; }
    public string Status { get; set; } = ApprovalStatuses.Pending;
    public string? Comment { get; set; }
    public DateTime? DecidedAt { get; set; }
    public ApprovalRequest ApprovalRequest { get; set; } = null!;
}
