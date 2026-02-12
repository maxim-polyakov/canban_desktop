using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface ICharacterService
{
    Task<CharacterDto?> GetByUserIdAsync(Guid userId, CancellationToken ct = default);
    Task<List<LevelDto>> GetAllLevelsAsync(CancellationToken ct = default);
    Task<List<XpTransactionDto>> GetXpHistoryAsync(Guid userId, int limit = 50, CancellationToken ct = default);
}
