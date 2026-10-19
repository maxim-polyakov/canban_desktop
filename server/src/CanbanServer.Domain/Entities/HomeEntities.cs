namespace CanbanServer.Domain.Entities;

/// <summary>Project or goal in the Home hub (Atlassian Home-style), tracked with weekly status updates.</summary>
public class HomeItem
{
    public Guid Id { get; set; }
    /// <summary>"project" or "goal".</summary>
    public string Kind { get; set; } = "project";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string Icon { get; set; } = "";
    public Guid OwnerUserId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public Guid? TeamId { get; set; }
    /// <summary>Parent goal; goals only.</summary>
    public Guid? ParentId { get; set; }
    /// <summary>pending, on_track, at_risk, off_track, paused, done, cancelled.</summary>
    public string Status { get; set; } = "pending";
    /// <summary>Goal score 0.0–1.0.</summary>
    public double? Score { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? TargetDate { get; set; }
    /// <summary>Comma-separated tags.</summary>
    public string Tags { get; set; } = "";
    /// <summary>Private items are visible only to the owner, creator, members and the item's team.</summary>
    public bool IsPrivate { get; set; }
    public bool IsArchived { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public DateTime? LastUpdateAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public ICollection<HomeItemMember> Members { get; set; } = new List<HomeItemMember>();
    public ICollection<HomeStatusUpdate> Updates { get; set; } = new List<HomeStatusUpdate>();
}

public class HomeItemMember
{
    public Guid ItemId { get; set; }
    public Guid UserId { get; set; }
    /// <summary>"contributor" or "follower".</summary>
    public string Role { get; set; } = "follower";
    public DateTime CreatedAt { get; set; }
}

/// <summary>A project contributing to a goal.</summary>
public class HomeItemLink
{
    public Guid GoalId { get; set; }
    public Guid ProjectId { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>A work item (issue/epic) attached to a project or goal.</summary>
public class HomeItemWork
{
    public Guid ItemId { get; set; }
    public Guid QuestId { get; set; }
    public DateTime CreatedAt { get; set; }
    public Quest Quest { get; set; } = null!;
}

public class HomeStatusUpdate
{
    public Guid Id { get; set; }
    public Guid ItemId { get; set; }
    public Guid AuthorUserId { get; set; }
    public string Status { get; set; } = "on_track";
    public double? Score { get; set; }
    public DateTime? TargetDate { get; set; }
    public DateTime? PreviousTargetDate { get; set; }
    public string? PreviousStatus { get; set; }
    public string Summary { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}
