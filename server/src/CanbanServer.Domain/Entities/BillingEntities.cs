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
    /// <summary>End of the paid period; null for free plans and subscriptions created before online payments.</summary>
    public DateTime? PaidUntil { get; set; }
    /// <summary>YooKassa saved payment method used for automatic renewals.</summary>
    public string? PaymentMethodId { get; set; }
    public string? PaymentMethodTitle { get; set; }
    public bool AutoRenew { get; set; } = true;
}

/// <summary>An online payment for a plan period.</summary>
public class BillingPayment
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Provider { get; set; } = "yookassa";
    public string? ProviderPaymentId { get; set; }
    public string Plan { get; set; } = "standard";
    public string Cycle { get; set; } = "monthly";
    public int Users { get; set; }
    public decimal Amount { get; set; }
    /// <summary>pending, succeeded or canceled.</summary>
    public string Status { get; set; } = "pending";
    /// <summary>purchase (user checkout) or renewal (charged with the saved method).</summary>
    public string Kind { get; set; } = "purchase";
    public string? ConfirmationUrl { get; set; }
    public string? Error { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? PaidAt { get; set; }
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
