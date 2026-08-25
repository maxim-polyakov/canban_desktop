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
    List<Guid> AssigneeIds
);
public record CreateQuestRequest(string Title, string? Description, Guid ColumnId, Guid? AssigneeId, DateTime? DueDate, QuestCategory Category, int XpReward, bool IsEpic, Guid? ParentEpicId, List<Guid>? NotificationRecipientIds, List<ExternalNotificationRecipientDto>? ExternalNotificationRecipients, List<Guid>? AssigneeIds);
/// <summary>AssigneeIds имеет приоритет над legacy AssigneeId. Set-флаги позволяют явно очистить список.</summary>
public record UpdateQuestRequest(string? Title, string? Description, Guid? AssigneeId, bool AssigneeIdSet, DateTime? DueDate, QuestCategory? Category, int? XpReward, List<Guid>? NotificationRecipientIds, List<ExternalNotificationRecipientDto>? ExternalNotificationRecipients, List<Guid>? AssigneeIds, bool AssigneeIdsSet);
/// <summary>Запрос на перемещение квеста (drag-n-drop): новая колонка и порядок.</summary>
public record MoveQuestRequest(Guid QuestId, Guid TargetColumnId, int NewOrder);
public record ReorderQuestsRequest(Guid ColumnId, List<Guid> QuestIdsInOrder);
public record ArchiveCompletedQuestsResult(int ArchivedCount);
public record UpdateQuestNotificationRecipientsRequest(List<Guid> UserIds, List<ExternalNotificationRecipientDto>? ExternalNotificationRecipients);
public record CreateQuestCommentRequest(string Text);
public record QuestCommentDto(Guid Id, Guid QuestId, Guid AuthorUserId, string AuthorName, string? AuthorAvatarUrl, string Text, DateTime CreatedAt);
