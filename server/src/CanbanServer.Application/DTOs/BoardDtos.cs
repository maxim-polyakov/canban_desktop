namespace CanbanServer.Application.DTOs;

public record BoardDto(Guid Id, Guid TeamId, string Name, string? Description, int Order, DateTime CreatedAt, Guid? CreatedByUserId, string KeyPrefix = "KAN");
public record BoardDetailDto(Guid Id, Guid TeamId, string Name, string? Description, int Order, DateTime CreatedAt, List<ColumnDto> Columns, Guid? CreatedByUserId, string KeyPrefix = "KAN");
public record CreateBoardRequest(string Name, string? Description, Guid TeamId, string? KeyPrefix = null);
public record UpdateBoardRequest(string? Name, string? Description, int? Order, string? KeyPrefix = null);
