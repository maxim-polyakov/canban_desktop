namespace CanbanServer.Application.DTOs;

public record CreateHomeItemRequest(
    string? Name,
    string? Description = null,
    string? Icon = null,
    Guid? OwnerUserId = null,
    Guid? TeamId = null,
    Guid? ParentId = null,
    DateTime? StartDate = null,
    DateTime? TargetDate = null,
    List<string>? Tags = null,
    bool? IsPrivate = null,
    Guid? GoalId = null,
    List<Guid>? ContributorIds = null);

public record UpdateHomeItemRequest(
    string? Name = null,
    string? Description = null,
    string? Icon = null,
    Guid? OwnerUserId = null,
    Guid? TeamId = null,
    bool? ClearTeam = null,
    Guid? ParentId = null,
    bool? ClearParent = null,
    DateTime? StartDate = null,
    bool? ClearStartDate = null,
    DateTime? TargetDate = null,
    bool? ClearTargetDate = null,
    List<string>? Tags = null,
    bool? IsPrivate = null);

public record HomeArchiveRequest(bool Archived);

public record HomeMemberRequest(Guid UserId);

public record HomeLinkRequest(Guid TargetId);

public record HomeWorkRequest(Guid? QuestId, string? IssueKey);

public record HomeStatusUpdateRequest(string? Status, double? Score, DateTime? TargetDate, string? Summary);
