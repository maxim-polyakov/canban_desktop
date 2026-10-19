using CanbanServer.Domain.Entities;

namespace CanbanServer.Application.DTOs;

public record QuestAssigneeDto(Guid UserId, string DisplayName, string? AvatarUrl);
public record ExternalNotificationRecipientDto(string Email, string? DisplayName);

public record QuestDto(
    Guid Id,
    Guid ColumnId,
    Guid BoardId,
    string Title,
    string? Description,
    Guid? AssigneeId,
    string? AssigneeName,
    string? AssigneeAvatarUrl,
    int Order,
    DateTime? DueDate,
    DateTime CreatedAt,
    DateTime? CompletedAt,
    QuestCategory Category,
    int XpReward,
    bool IsEpic,
    Guid? ParentEpicId,
    List<Guid> NotificationRecipientIds,
    List<ExternalNotificationRecipientDto> ExternalNotificationRecipients,
    List<QuestAssigneeDto> Assignees,
    List<Guid> AssigneeIds,
    string IssueKey,
    int IssueNumber,
    IssueType IssueType,
    IssuePriority Priority,
    string Labels,
    Guid? SprintId,
    string? SprintName,
    string? Component,
    string? FixVersion,
    int? StoryPoints,
    Guid? ParentQuestId = null,
    int? OriginalEstimateMinutes = null,
    int? RemainingEstimateMinutes = null,
    string? DescriptionDocumentJson = null,
    List<Guid>? ComponentIds = null,
    List<Guid>? ReleaseIds = null
);

public record CreateQuestRequest(
    string Title,
    string? Description,
    Guid ColumnId,
    Guid? AssigneeId,
    DateTime? DueDate,
    QuestCategory Category,
    int XpReward,
    bool IsEpic,
    Guid? ParentEpicId,
    List<Guid>? NotificationRecipientIds,
    List<ExternalNotificationRecipientDto>? ExternalNotificationRecipients,
    List<Guid>? AssigneeIds,
    IssueType? IssueType = null,
    IssuePriority? Priority = null,
    string? Labels = null,
    Guid? SprintId = null,
    string? Component = null,
    string? FixVersion = null,
    int? StoryPoints = null,
    Guid? ParentQuestId = null,
    int? OriginalEstimateMinutes = null,
    int? RemainingEstimateMinutes = null,
    string? DescriptionDocumentJson = null,
    List<Guid>? ComponentIds = null,
    List<Guid>? ReleaseIds = null
);

/// <summary>AssigneeIds имеет приоритет над legacy AssigneeId. Set-флаги позволяют явно очистить список.</summary>
public record UpdateQuestRequest(
    string? Title,
    string? Description,
    Guid? AssigneeId,
    bool AssigneeIdSet,
    DateTime? DueDate,
    QuestCategory? Category,
    int? XpReward,
    List<Guid>? NotificationRecipientIds,
    List<ExternalNotificationRecipientDto>? ExternalNotificationRecipients,
    List<Guid>? AssigneeIds,
    bool AssigneeIdsSet,
    IssueType? IssueType = null,
    IssuePriority? Priority = null,
    string? Labels = null,
    Guid? SprintId = null,
    bool SprintIdSet = false,
    Guid? ParentEpicId = null,
    bool ParentEpicIdSet = false,
    bool? IsEpic = null,
    string? Component = null,
    string? FixVersion = null,
    int? StoryPoints = null,
    bool StoryPointsSet = false,
    Guid? ParentQuestId = null,
    bool ParentQuestIdSet = false,
    int? OriginalEstimateMinutes = null,
    bool OriginalEstimateMinutesSet = false,
    int? RemainingEstimateMinutes = null,
    bool RemainingEstimateMinutesSet = false,
    string? DescriptionDocumentJson = null,
    List<Guid>? ComponentIds = null,
    bool ComponentIdsSet = false,
    List<Guid>? ReleaseIds = null,
    bool ReleaseIdsSet = false
);

/// <summary>Запрос на перемещение квеста (drag-n-drop): новая колонка и порядок.</summary>
public record MoveQuestRequest(Guid QuestId, Guid TargetColumnId, int NewOrder);
public record ReorderQuestsRequest(Guid ColumnId, List<Guid> QuestIdsInOrder);
public record ArchiveCompletedQuestsResult(int ArchivedCount);
public record UpdateQuestNotificationRecipientsRequest(List<Guid> UserIds, List<ExternalNotificationRecipientDto>? ExternalNotificationRecipients);
public record CreateQuestCommentRequest(string Text, string? DocumentJson = null);
public record QuestCommentDto(Guid Id, Guid QuestId, Guid AuthorUserId, string AuthorName, string? AuthorAvatarUrl, string Text, DateTime CreatedAt, string? DocumentJson = null);

public record QuestFilterRequest(
    Guid? SprintId = null,
    bool? UnassignedSprint = null,
    IssueType? IssueType = null,
    IssuePriority? Priority = null,
    Guid? AssigneeId = null,
    string? Text = null,
    string? Label = null,
    string? Component = null,
    string? FixVersion = null,
    Guid? ColumnId = null,
    bool? BacklogOnly = null
);
