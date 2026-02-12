using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface IQuestService
{
    Task<QuestDto?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<QuestDto>> GetByColumnIdAsync(Guid columnId, CancellationToken ct = default);
    Task<QuestDto> CreateAsync(CreateQuestRequest request, Guid userId, CancellationToken ct = default);
    Task<QuestDto?> UpdateAsync(Guid id, UpdateQuestRequest request, CancellationToken ct = default);
    /// <summary>Перемещение квеста между колонками (drag-n-drop). При переносе в Done начисляется XP.</summary>
    Task<QuestDto?> MoveAsync(MoveQuestRequest request, Guid userId, CancellationToken ct = default);
    Task ReorderAsync(ReorderQuestsRequest request, CancellationToken ct = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct = default);
}
