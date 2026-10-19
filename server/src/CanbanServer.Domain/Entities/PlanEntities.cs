namespace CanbanServer.Domain.Entities;

/// <summary>Advanced plan: a cross-space timeline built from boards and saved filters.</summary>
public class Plan
{
    public Guid Id { get; set; }
    public Guid OwnerUserId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    /// <summary>"private" — only the owner; "open" — anyone can view.</summary>
    public string Access { get; set; } = "private";
    /// <summary>Done items completed more than this many days ago are hidden; null shows all.</summary>
    public int? ExcludeDoneAfterDays { get; set; } = 30;
    /// <summary>Comma-separated <see cref="IssueType"/> numbers to hide.</summary>
    public string ExcludedIssueTypes { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public ICollection<PlanSource> Sources { get; set; } = new List<PlanSource>();
    public ICollection<PlanTeam> Teams { get; set; } = new List<PlanTeam>();
    public ICollection<PlanScenario> Scenarios { get; set; } = new List<PlanScenario>();
    public ICollection<PlanExclusion> Exclusions { get; set; } = new List<PlanExclusion>();
}

public class PlanSource
{
    public Guid Id { get; set; }
    public Guid PlanId { get; set; }
    /// <summary>"board" or "filter".</summary>
    public string Kind { get; set; } = "board";
    public Guid? BoardId { get; set; }
    public Guid? FilterId { get; set; }
}

public class PlanTeam
{
    public Guid Id { get; set; }
    public Guid PlanId { get; set; }
    public string Name { get; set; } = "";
    public Guid? TeamId { get; set; }
    /// <summary>Story points the team can deliver per iteration.</summary>
    public int Capacity { get; set; } = 30;
    public int IterationDays { get; set; } = 14;
    public int Position { get; set; }
}

public class PlanScenario
{
    public Guid Id { get; set; }
    public Guid PlanId { get; set; }
    public string Name { get; set; } = "";
    public string Color { get; set; } = "#0c66e4";
    public bool IsDefault { get; set; }
    public DateTime CreatedAt { get; set; }
    public ICollection<PlanScheduleItem> Items { get; set; } = new List<PlanScheduleItem>();
}

/// <summary>Scenario-specific dates and team for an item; real issues change only when the scenario is applied.</summary>
public class PlanScheduleItem
{
    public Guid ScenarioId { get; set; }
    public Guid QuestId { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? DueDate { get; set; }
    public Guid? PlanTeamId { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class PlanExclusion
{
    public Guid PlanId { get; set; }
    public Guid QuestId { get; set; }
}
