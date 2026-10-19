using CanbanServer.Domain.Entities;

namespace CanbanServer.Application.DTOs;

public record TeamDto(Guid Id, string Name, string? Description, DateTime CreatedAt, Guid? OwnerId, string Key = "KAN");
public record TeamMemberDto(Guid UserId, string DisplayName, string Email, string? AvatarUrl, string Role, DateTime JoinedAt);
/// <summary>Команда пользователя с списком её досок.</summary>
public record TeamWithBoardsDto(TeamDto Team, List<BoardDto> Boards);
public record CreateTeamRequest(string Name, string? Description, string? Key = null);
public record UpdateTeamRequest(string? Name, string? Description, string? Key = null);
public record InviteMemberRequest(string Email);

public record SetTeamMemberRoleRequest(TeamRole Role);

/// <summary>Приглашение в команду (ожидает подтверждения пользователем).</summary>
public record TeamInviteDto(Guid Id, Guid TeamId, string TeamName, Guid InvitedByUserId, string InvitedByUserName, DateTime CreatedAt);
