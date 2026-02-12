using CanbanServer.Domain.Entities;

namespace CanbanServer.Application.DTOs;

public record QuestDto(
    Guid Id,
    Guid ColumnId,
    Guid BoardId,
    string Title,
    string? Description,
    Guid? AssigneeId,
    string? AssigneeName,
    int Order,
    DateTime? DueDate,
    DateTime CreatedAt,
    DateTime? CompletedAt,
    QuestCategory Category,
    int XpReward,
    bool IsEpic,
    Guid? ParentEpicId
);
public record CreateQuestRequest(string Title, string? Description, Guid ColumnId, Guid? AssigneeId, DateTime? DueDate, QuestCategory Category, int XpReward, bool IsEpic, Guid? ParentEpicId);
public record UpdateQuestRequest(string? Title, string? Description, Guid? AssigneeId, DateTime? DueDate, QuestCategory? Category, int? XpReward);
/// <summary>Запрос на перемещение квеста (drag-n-drop): новая колонка и порядок.</summary>
public record MoveQuestRequest(Guid QuestId, Guid TargetColumnId, int NewOrder);
public record ReorderQuestsRequest(Guid ColumnId, List<Guid> QuestIdsInOrder);
