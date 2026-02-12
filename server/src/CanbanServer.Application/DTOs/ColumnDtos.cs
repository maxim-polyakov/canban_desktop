using CanbanServer.Domain.Entities;

namespace CanbanServer.Application.DTOs;

public record ColumnDto(Guid Id, Guid BoardId, string Title, int Order, ColumnKind Kind, DateTime CreatedAt, List<QuestDto> Quests);
public record ColumnSummaryDto(Guid Id, Guid BoardId, string Title, int Order, ColumnKind Kind);
public record CreateColumnRequest(string Title, int Order, ColumnKind Kind);
public record UpdateColumnRequest(string? Title, int? Order, ColumnKind? Kind);
public record ReorderColumnsRequest(List<Guid> ColumnIdsInOrder);
