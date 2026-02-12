using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface IBoardService
{
    Task<BoardDetailDto?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<BoardDto>> GetByTeamIdAsync(Guid teamId, CancellationToken ct = default);
    Task<BoardDto> CreateAsync(CreateBoardRequest request, CancellationToken ct = default);
    Task<BoardDto?> UpdateAsync(Guid id, UpdateBoardRequest request, CancellationToken ct = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct = default);
}
