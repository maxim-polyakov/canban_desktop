using CanbanServer.Domain.Entities;

namespace CanbanServer.Application.DTOs;

public record BoardDto(Guid Id, Guid TeamId, string Name, string? Description, int Order, DateTime CreatedAt, Guid? CreatedByUserId, string KeyPrefix = "KAN",
    string Template = "kanban", string ManagementType = "team", string Access = "private", string Features = "")
{
    public static BoardDto From(Board b) =>
        new(b.Id, b.TeamId, b.Name, b.Description, b.Order, b.CreatedAt, b.CreatedByUserId, b.KeyPrefix, b.Template, b.ManagementType, b.Access, b.Features);
}

public record BoardDetailDto(Guid Id, Guid TeamId, string Name, string? Description, int Order, DateTime CreatedAt, List<ColumnDto> Columns, Guid? CreatedByUserId, string KeyPrefix = "KAN",
    string Template = "kanban", string ManagementType = "team", string Access = "private", string Features = "");

public record CreateBoardRequest(string Name, string? Description, Guid TeamId, string? KeyPrefix = null,
    string? Template = null, string? ManagementType = null, string? Access = null, Guid? CopySettingsFromBoardId = null);

public record UpdateBoardRequest(string? Name, string? Description, int? Order, string? KeyPrefix = null, string? Access = null, string? Features = null);
