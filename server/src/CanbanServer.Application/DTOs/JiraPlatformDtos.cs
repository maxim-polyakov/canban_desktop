using CanbanServer.Domain.Entities;

namespace CanbanServer.Application.DTOs;

public record WorkflowTransitionDto(Guid Id, Guid BoardId, Guid SourceColumnId, Guid TargetColumnId, string Name, string AllowedIssueTypes, string AllowedRoles, string? ConditionsJson, bool Enabled);
public record UpsertWorkflowTransitionRequest(Guid SourceColumnId, Guid TargetColumnId, string Name, string? AllowedIssueTypes, string? AllowedRoles, string? ConditionsJson, bool Enabled = true);

public record QuestLinkDto(Guid Id, Guid SourceQuestId, Guid TargetQuestId, QuestLinkType Type, string? SourceKey, string? TargetKey, string? SourceTitle, string? TargetTitle);
public record CreateQuestLinkRequest(Guid TargetQuestId, QuestLinkType Type);

public record BoardComponentDto(Guid Id, Guid BoardId, string Name, string? Description, Guid? LeadUserId, bool Archived);
public record UpsertBoardComponentRequest(string Name, string? Description, Guid? LeadUserId, bool Archived = false);
public record BoardReleaseDto(Guid Id, Guid BoardId, string Name, string? Description, ReleaseStatus Status, DateTime? StartDate, DateTime? ReleaseDate);
public record UpsertBoardReleaseRequest(string Name, string? Description, ReleaseStatus Status = ReleaseStatus.Unreleased, DateTime? StartDate = null, DateTime? ReleaseDate = null);

public record WorkLogDto(Guid Id, Guid QuestId, Guid UserId, string? UserName, int TimeSpentMinutes, DateTime StartedAt, string? Note);
public record UpsertWorkLogRequest(int TimeSpentMinutes, DateTime StartedAt, string? Note = null, int? RemainingEstimateMinutes = null);

public record QuestChangeDto(Guid Id, Guid QuestId, Guid? UserId, string? UserName, string ChangeType, string? Field, string? OldValue, string? NewValue, DateTime CreatedAt);
public record AppNotificationDto(Guid Id, Guid? QuestId, string Type, string Title, string? Body, bool Read, DateTime CreatedAt);

public record SavedFilterDto(Guid Id, Guid OwnerUserId, Guid? BoardId, string Name, string Jql, bool Shared, DateTime CreatedAt, DateTime UpdatedAt);
public record UpsertSavedFilterRequest(string Name, string Jql, Guid? BoardId = null, bool Shared = false);

public record JqlSearchResult(List<QuestDto> Items, int Total, int Page, int PageSize);

public record AutomationRuleDto(Guid Id, Guid BoardId, string Name, AutomationTrigger Trigger, string? ConditionsJson, string ActionsJson, bool Enabled);
public record UpsertAutomationRuleRequest(string Name, AutomationTrigger Trigger, string? ConditionsJson, string ActionsJson, bool Enabled = true);
public record OutboundWebhookDto(Guid Id, Guid BoardId, string Url, string SecretConfigurationKey, string Events, bool Enabled);
public record UpsertOutboundWebhookRequest(string Url, string SecretConfigurationKey, string Events, bool Enabled = true);
public record GitHubIntegrationDto(Guid Id, Guid BoardId, long InstallationId, string RepositoryOwner, string RepositoryName, string WebhookSecretConfigurationKey, bool Enabled);
public record UpsertGitHubIntegrationRequest(long InstallationId, string RepositoryOwner, string RepositoryName, string WebhookSecretConfigurationKey, bool Enabled = true);
public record DevelopmentLinkDto(Guid Id, Guid QuestId, string Kind, string ExternalId, string Url, string Title, string? Status);

public record BulkEditQuestsRequest(List<Guid> QuestIds, Guid? SprintId = null, bool SprintIdSet = false, Guid? ColumnId = null, List<Guid>? AssigneeIds = null, bool AssigneeIdsSet = false, string? Labels = null, IssuePriority? Priority = null, IssueType? IssueType = null);
public record BulkEditResult(int UpdatedCount);
public record CloneQuestRequest(bool IncludeLinks = true, bool IncludeWatchers = true, string? TitleSuffix = null);
public record CloneBoardRequest(string Name, bool IncludeQuests = false);
public record ImportPreviewRequest(string Format, string Content);
public record ImportPreviewResult(int ValidRows, int InvalidRows, List<string> Errors, List<Dictionary<string, string>> Sample);
public record ImportExecuteRequest(string Format, string Content, Guid BoardId, Guid ColumnId);
public record ImportExecuteResult(int CreatedCount, List<string> Errors);

public record DashboardDto(Guid Id, Guid OwnerUserId, string Name, bool Shared, string LayoutJson);
public record UpsertDashboardRequest(string Name, bool Shared, string LayoutJson);
