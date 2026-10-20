namespace CanbanServer.Domain.Entities;

/// <summary>Jira-style filter subscription: emails the filter's results to its owner or a group on a schedule.</summary>
public class FilterSubscription
{
    public Guid Id { get; set; }
    public Guid FilterId { get; set; }
    public Guid OwnerUserId { get; set; }
    /// <summary>When set the email goes to every member of the group, otherwise to the owner.</summary>
    public Guid? GroupId { get; set; }
    /// <summary>daily, weekly, monthly or hourly.</summary>
    public string Frequency { get; set; } = "daily";
    public int Hour { get; set; } = 9;
    public int Minute { get; set; }
    /// <summary>ISO days for weekly schedules, Monday = 1 … Sunday = 7, comma separated.</summary>
    public string DaysOfWeek { get; set; } = "";
    public int DayOfMonth { get; set; } = 1;
    public int IntervalHours { get; set; } = 1;
    public string TimeZone { get; set; } = "UTC";
    public bool EmailWhenEmpty { get; set; }
    public DateTime? LastRunAt { get; set; }
    public DateTime NextRunAt { get; set; }
    public DateTime CreatedAt { get; set; }
}
