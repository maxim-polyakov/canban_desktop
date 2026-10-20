using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Application.Contracts;

public interface ITeamService
{
    Task<TeamDto?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<TeamWithBoardsDto>> GetMyTeamsWithBoardsAsync(Guid userId, CancellationToken ct = default);
    Task<List<TeamMemberDto>> GetMembersAsync(Guid teamId, CancellationToken ct = default);
    Task<TeamDto> CreateAsync(CreateTeamRequest request, Guid ownerId, CancellationToken ct = default);
    Task<TeamDto?> UpdateAsync(Guid id, UpdateTeamRequest request, CancellationToken ct = default);
    Task<bool> AddMemberAsync(Guid teamId, Guid userId, CancellationToken ct = default);
    /// <returns>true — роль изменена, false — нет прав (только создатель или админ команды), null — участник не найден</returns>
    Task<bool?> SetMemberRoleAsync(Guid teamId, Guid userId, TeamRole role, Guid? requestedByUserId, CancellationToken ct = default);
    /// <returns>true — owner or team admin, false — no rights, null — team not found</returns>
    Task<bool?> CanManageAsync(Guid teamId, Guid userId, CancellationToken ct = default);
    /// <summary>Stores the new avatar and returns the previous value so an uploaded file can be removed.</summary>
    Task<string?> SetAvatarAsync(Guid teamId, string? avatarUrl, CancellationToken ct = default);
    /// <summary>Отправить приглашение в команду по email. Создаёт запись приглашения; пользователь подтверждает сам.</summary>
    /// <returns>true — приглашение отправлено, false — уже в команде или приглашение уже отправлено, null — пользователь не найден</returns>
    Task<bool?> InviteByEmailAsync(Guid teamId, string email, Guid inviterUserId, CancellationToken ct = default);
    /// <returns>true — приглашение отправлено, false — уже в команде или приглашение уже отправлено, null — пользователь не найден</returns>
    Task<bool?> InviteUserAsync(Guid teamId, Guid userId, Guid inviterUserId, CancellationToken ct = default);
    Task<List<TeamInviteDto>> GetPendingInvitesForUserAsync(Guid userId, CancellationToken ct = default);
    Task<bool?> AcceptInviteAsync(Guid inviteId, Guid userId, CancellationToken ct = default);
    Task<bool> DeclineInviteAsync(Guid inviteId, Guid userId, CancellationToken ct = default);
    /// <returns>true — исключён, false — нет прав (только создатель может кикать), null — участник не найден</returns>
    Task<bool?> RemoveMemberAsync(Guid teamId, Guid userId, Guid? requestedByUserId, CancellationToken ct = default);
    /// <summary>Выйти из команды (текущий пользователь удаляет себя). Если был владелец — владельцем становится другой админ или null.</summary>
    Task<bool> LeaveTeamAsync(Guid teamId, Guid userId, CancellationToken ct = default);
    /// <summary>Удалить команду. Только создатель (OwnerId) может удалить.</summary>
    Task<bool> DeleteAsync(Guid teamId, Guid userId, CancellationToken ct = default);
}
