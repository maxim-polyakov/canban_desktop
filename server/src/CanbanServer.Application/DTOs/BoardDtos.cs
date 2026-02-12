namespace CanbanServer.Application.DTOs;

public record BoardDto(Guid Id, Guid TeamId, string Name, string? Description, int Order, DateTime CreatedAt);
public record BoardDetailDto(Guid Id, Guid TeamId, string Name, string? Description, int Order, DateTime CreatedAt, List<ColumnDto> Columns);
public record CreateBoardRequest(string Name, string? Description, Guid TeamId);
public record UpdateBoardRequest(string? Name, string? Description, int? Order);
