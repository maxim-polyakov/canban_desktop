using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface IColumnService
{
    Task<ColumnDto?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<ColumnSummaryDto>> GetByBoardIdAsync(Guid boardId, CancellationToken ct = default);
    Task<ColumnSummaryDto> CreateAsync(Guid boardId, CreateColumnRequest request, CancellationToken ct = default);
    Task<ColumnSummaryDto?> UpdateAsync(Guid id, UpdateColumnRequest request, CancellationToken ct = default);
    Task ReorderAsync(Guid boardId, ReorderColumnsRequest request, CancellationToken ct = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct = default);
}
