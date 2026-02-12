using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface ITeamService
{
    Task<TeamDto?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<TeamMemberDto>> GetMembersAsync(Guid teamId, CancellationToken ct = default);
    Task<TeamDto> CreateAsync(CreateTeamRequest request, Guid ownerId, CancellationToken ct = default);
    Task<TeamDto?> UpdateAsync(Guid id, UpdateTeamRequest request, CancellationToken ct = default);
    Task<bool> AddMemberAsync(Guid teamId, Guid userId, CancellationToken ct = default);
    Task<bool> RemoveMemberAsync(Guid teamId, Guid userId, CancellationToken ct = default);
}
