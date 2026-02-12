using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface ISkillTreeService
{
    Task<SkillTreeDto> GetTreeForUserAsync(Guid userId, CancellationToken ct = default);
    Task<List<SkillDto>> GetUnlockedSkillsAsync(Guid userId, CancellationToken ct = default);
}
