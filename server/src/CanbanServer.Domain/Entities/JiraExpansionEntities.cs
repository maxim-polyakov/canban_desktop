namespace CanbanServer.Domain.Entities;

public enum BoardPermission { View, Work, Manage, Admin }
public enum QuestLinkType { Blocks, DependsOn, Duplicates, Relates }
public enum ReleaseStatus { Unreleased, Released, Archived }
public enum OutboxStatus { Pending, Processing, Completed, DeadLetter }
public enum AutomationTrigger { IssueCreated, IssueUpdated, IssueMoved, WorkLogged, SprintChanged, WebhookReceived }
public enum WebhookDeliveryStatus { Pending, Succeeded, DeadLetter }

public class WorkflowTransition
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public Guid SourceColumnId { get; set; }
    public Guid TargetColumnId { get; set; }
    public string AllowedIssueTypes { get; set; } = "";
    public string AllowedRoles { get; set; } = "";
    public string? ConditionsJson { get; set; }
    public bool Enabled { get; set; } = true;
    public string Name { get; set; } = "";
    /// <summary>Global transition: available from every status; SourceColumnId is then ignored.</summary>
    public bool FromAnyStatus { get; set; }
    public string? PostFunctionsJson { get; set; }
    public Board Board { get; set; } = null!;
}

public class QuestLink
{
    public Guid Id { get; set; }
    public Guid SourceQuestId { get; set; }
    public Guid TargetQuestId { get; set; }
    public QuestLinkType Type { get; set; }
    public DateTime CreatedAt { get; set; }
    public Guid CreatedByUserId { get; set; }
    public Quest SourceQuest { get; set; } = null!;
    public Quest TargetQuest { get; set; } = null!;
}

public class BoardComponent
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public Guid? LeadUserId { get; set; }
    public bool Archived { get; set; }
}

public class BoardRelease
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public ReleaseStatus Status { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? ReleaseDate { get; set; }
}

public class QuestComponent
{
    public Guid QuestId { get; set; }
    public Guid ComponentId { get; set; }
    public Quest Quest { get; set; } = null!;
    public BoardComponent Component { get; set; } = null!;
}

public class QuestRelease
{
    public Guid QuestId { get; set; }
    public Guid ReleaseId { get; set; }
    public Quest Quest { get; set; } = null!;
    public BoardRelease Release { get; set; } = null!;
}

public class WorkLog
{
    public Guid Id { get; set; }
    public Guid QuestId { get; set; }
    public Guid UserId { get; set; }
    public int TimeSpentMinutes { get; set; }
    public DateTime StartedAt { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class QuestChange
{
    public Guid Id { get; set; }
    public Guid QuestId { get; set; }
    public Guid? UserId { get; set; }
    public string ChangeType { get; set; } = "";
    public string? Field { get; set; }
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class AppNotification
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid? QuestId { get; set; }
    public string Type { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Body { get; set; }
    /// <summary>In-app path to open when the notification is not about an issue, e.g. a space document.</summary>
    public string? Link { get; set; }
    public bool Read { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class Kudos
{
    public Guid Id { get; set; }
    public Guid FromUserId { get; set; }
    public Guid ToUserId { get; set; }
    public string Kind { get; set; } = "thanks";
    public string Message { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}

public class SavedFilter
{
    public Guid Id { get; set; }
    public Guid OwnerUserId { get; set; }
    public Guid? BoardId { get; set; }
    public string Name { get; set; } = "";
    public string Jql { get; set; } = "";
    public bool Shared { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class OutboxMessage
{
    public Guid Id { get; set; }
    public string Type { get; set; } = "";
    public string PayloadJson { get; set; } = "{}";
    public OutboxStatus Status { get; set; }
    public int Attempts { get; set; }
    public DateTime AvailableAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ProcessedAt { get; set; }
    public string? LastError { get; set; }
}

public class AutomationRule
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public string Name { get; set; } = "";
    public AutomationTrigger Trigger { get; set; }
    public string? ConditionsJson { get; set; }
    public string ActionsJson { get; set; } = "[]";
    public bool Enabled { get; set; } = true;
}

public class OutboundWebhook
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public string Url { get; set; } = "";
    public string SecretConfigurationKey { get; set; } = "";
    public string Events { get; set; } = "";
    public bool Enabled { get; set; } = true;
}

public class WebhookDelivery
{
    public Guid Id { get; set; }
    public Guid WebhookId { get; set; }
    public Guid OutboxMessageId { get; set; }
    public WebhookDeliveryStatus Status { get; set; }
    public int Attempts { get; set; }
    public DateTime NextAttemptAt { get; set; }
    public int? LastStatusCode { get; set; }
    public string? LastError { get; set; }
}

public class GitHubIntegration
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public long InstallationId { get; set; }
    public string RepositoryOwner { get; set; } = "";
    public string RepositoryName { get; set; } = "";
    public string WebhookSecretConfigurationKey { get; set; } = "";
    public bool Enabled { get; set; } = true;
}

public class DevelopmentLink
{
    public Guid Id { get; set; }
    public Guid QuestId { get; set; }
    public Guid GitHubIntegrationId { get; set; }
    public string Kind { get; set; } = "";
    public string ExternalId { get; set; } = "";
    public string Url { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Status { get; set; }
    public string PayloadJson { get; set; } = "{}";
    public DateTime UpdatedAt { get; set; }
}

public class Dashboard
{
    public Guid Id { get; set; }
    public Guid OwnerUserId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    /// <summary>Legacy flag kept in sync with <see cref="Viewers"/> == "org".</summary>
    public bool Shared { get; set; }
    /// <summary>blank, space-team, devops or my-work.</summary>
    public string Template { get; set; } = "blank";
    /// <summary>private (owner only) or org (people who share a team with the owner).</summary>
    public string Viewers { get; set; } = "private";
    public string Editors { get; set; } = "private";
    public string LayoutJson { get; set; } = "[]";
    public string FiltersJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }
}

public class DashboardStar
{
    public Guid DashboardId { get; set; }
    public Guid UserId { get; set; }
    public DateTime CreatedAt { get; set; }
}
