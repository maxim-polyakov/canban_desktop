namespace CanbanServer.Domain.Entities;

/// <summary>Plan of a site owner; covers every team the user owns.</summary>
public class BillingSubscription
{
    public Guid UserId { get; set; }
    /// <summary>free, standard, premium or enterprise.</summary>
    public string Plan { get; set; } = "free";
    /// <summary>monthly or annual.</summary>
    public string Cycle { get; set; } = "monthly";
    public DateTime StartedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class BillingPlanChange
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string FromPlan { get; set; } = "free";
    public string ToPlan { get; set; } = "free";
    public string Cycle { get; set; } = "monthly";
    public int Users { get; set; }
    public decimal Amount { get; set; }
    public DateTime CreatedAt { get; set; }
}
