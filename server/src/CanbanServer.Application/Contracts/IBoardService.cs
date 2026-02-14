using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface IBoardService
{
    Task<BoardDetailDto?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<BoardDto>> GetByTeamIdAsync(Guid teamId, CancellationToken ct = default);
    Task<BoardDto> CreateAsync(CreateBoardRequest request, Guid? createdByUserId, CancellationToken ct = default);
    Task<BoardDto?> UpdateAsync(Guid id, UpdateBoardRequest request, CancellationToken ct = default);
    /// <returns>true = deleted, false = forbidden (not creator), null = not found</returns>
    Task<bool?> DeleteAsync(Guid id, Guid? currentUserId, CancellationToken ct = default);
}
