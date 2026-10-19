using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface ISprintService
{
    Task<List<SprintDto>> GetByBoardIdAsync(Guid boardId, CancellationToken ct = default);
    Task<SprintDto?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<SprintDto?> GetActiveByBoardIdAsync(Guid boardId, CancellationToken ct = default);
    Task<SprintDto> CreateAsync(Guid boardId, CreateSprintRequest request, CancellationToken ct = default);
    Task<SprintDto?> UpdateAsync(Guid id, UpdateSprintRequest request, CancellationToken ct = default);
    Task<SprintDto?> StartAsync(Guid id, StartSprintRequest request, CancellationToken ct = default);
    Task<SprintDto?> CompleteAsync(Guid id, CompleteSprintRequest request, CancellationToken ct = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct = default);
}
