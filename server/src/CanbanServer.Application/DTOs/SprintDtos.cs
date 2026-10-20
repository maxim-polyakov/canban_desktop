using CanbanServer.Domain.Entities;

namespace CanbanServer.Application.DTOs;

public record SprintDto(
    Guid Id,
    Guid BoardId,
    string Name,
    string? Goal,
    SprintStatus Status,
    DateTime? StartDate,
    DateTime? EndDate,
    int Order,
    DateTime CreatedAt,
    int QuestCount,
    bool AutoComplete = false
);

public record CreateSprintRequest(string Name, string? Goal, DateTime? StartDate, DateTime? EndDate);
public record UpdateSprintRequest(string? Name, string? Goal, DateTime? StartDate, DateTime? EndDate, int? Order);
public record StartSprintRequest(DateTime? StartDate, DateTime? EndDate, string? Name = null, string? Goal = null, bool AutoComplete = false);
public record CompleteSprintRequest(Guid? MoveIncompleteToSprintId, bool MoveIncompleteToBacklog = true);
