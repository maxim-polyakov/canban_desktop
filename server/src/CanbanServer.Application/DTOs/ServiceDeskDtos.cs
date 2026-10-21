using CanbanServer.Domain.Entities;

namespace CanbanServer.Application.DTOs;

public record ServiceDeskFieldDto(string Id, string Label, string Type, bool Required, IReadOnlyList<string>? Options = null);

public record ServiceDeskSettingsDto(
    Guid BoardId,
    string BoardName,
    bool Enabled,
    string PortalSlug,
    string WelcomeTitle,
    string? WelcomeText,
    bool IsAgent,
    bool CanManage);

public record UpsertServiceDeskSettingsRequest(bool Enabled, string? PortalSlug, string? WelcomeTitle, string? WelcomeText);

public record ServiceRequestTypeDto(
    Guid Id,
    Guid BoardId,
    string Name,
    string? Description,
    string Icon,
    IssueType IssueType,
    Guid? FormId,
    Guid? QueueId,
    Guid? SlaPolicyId,
    IReadOnlyList<ServiceDeskFieldDto> Fields,
    int Order,
    bool IsEnabled);

public record SaveServiceRequestTypeRequest(
    string Name,
    string? Description,
    string? Icon,
    IssueType? IssueType,
    Guid? FormId,
    Guid? QueueId,
    Guid? SlaPolicyId,
    IReadOnlyList<ServiceDeskFieldDto>? Fields,
    int? Order,
    bool? IsEnabled);

public record ServiceQueueDto(
    Guid Id,
    Guid BoardId,
    string Name,
    string? Description,
    string Jql,
    int Order,
    Guid? DefaultGroupId,
    int? IssueCount = null);

public record SaveServiceQueueRequest(string Name, string? Description, string? Jql, int? Order, Guid? DefaultGroupId);

public record SlaPolicyDto(
    Guid Id,
    Guid BoardId,
    string Name,
    int FirstResponseMinutes,
    int ResolutionMinutes,
    IReadOnlyList<string> PauseStatusTitles,
    string CalendarJson);

public record SaveSlaPolicyRequest(
    string Name,
    int FirstResponseMinutes,
    int ResolutionMinutes,
    IReadOnlyList<string>? PauseStatusTitles,
    string? CalendarJson);

public record SlaClockDto(
    Guid Id,
    Guid QuestId,
    string Metric,
    string Status,
    DateTime StartedAt,
    DateTime TargetAt,
    DateTime? PausedAt,
    DateTime? CompletedAt,
    DateTime? BreachedAt,
    int RemainingMinutes,
    string PolicyName);

public record CreatePortalRequestRequest(IReadOnlyDictionary<string, string>? Answers, string? Summary = null);

public record PortalCatalogDto(
    Guid BoardId,
    string BoardName,
    string PortalSlug,
    string WelcomeTitle,
    string? WelcomeText,
    IReadOnlyList<ServiceRequestTypeDto> RequestTypes);

public record PortalRequestDto(
    Guid Id,
    Guid BoardId,
    string BoardName,
    string IssueKey,
    string Title,
    string? Description,
    string StatusTitle,
    int StatusKind,
    DateTime CreatedAt,
    DateTime? CompletedAt,
    string? RequestTypeName,
    Guid? RequestTypeId,
    string? AssigneeName,
    IReadOnlyList<SlaClockDto> Sla,
    IReadOnlyList<QuestCommentDto> Comments,
    IReadOnlyList<ApprovalRequestDto> Approvals);

public record PortalRequestSummaryDto(
    Guid Id,
    Guid BoardId,
    string BoardName,
    string PortalSlug,
    string IssueKey,
    string Title,
    string StatusTitle,
    int StatusKind,
    DateTime CreatedAt,
    string? RequestTypeName,
    IReadOnlyList<SlaClockDto> Sla);

public record ApprovalDecisionDto(
    Guid Id,
    Guid? ApproverUserId,
    string? ApproverName,
    Guid? ApproverGroupId,
    string? ApproverGroupName,
    string Status,
    string? Comment,
    DateTime? DecidedAt);

public record ApprovalRequestDto(
    Guid Id,
    Guid QuestId,
    Guid BoardId,
    string Title,
    string Status,
    int RequiredApprovals,
    string? BlockedTransitionKey,
    DateTime CreatedAt,
    DateTime? DecidedAt,
    bool CanDecide,
    IReadOnlyList<ApprovalDecisionDto> Decisions);

public record CreateApprovalRequest(
    string? Title,
    int RequiredApprovals,
    IReadOnlyList<Guid>? ApproverUserIds,
    IReadOnlyList<Guid>? ApproverGroupIds,
    string? BlockedTransitionKey);

public record DecideApprovalRequest(bool Approve, string? Comment);

public record AssignQueueIssuesRequest(IReadOnlyList<Guid> QuestIds, Guid? AssigneeId);

public record ServiceDeskPortalCommentRequest(string Text, string? DocumentJson = null, bool IsInternal = false);
