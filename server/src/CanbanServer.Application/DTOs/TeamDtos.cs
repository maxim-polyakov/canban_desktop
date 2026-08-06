namespace CanbanServer.Application.DTOs;

public record TeamDto(Guid Id, string Name, string? Description, DateTime CreatedAt, Guid? OwnerId);
public record TeamMemberDto(Guid UserId, string DisplayName, string Email, string? AvatarUrl, string Role, DateTime JoinedAt);
/// <summary>Команда пользователя с списком её досок.</summary>
public record TeamWithBoardsDto(TeamDto Team, List<BoardDto> Boards);
public record CreateTeamRequest(string Name, string? Description);
public record UpdateTeamRequest(string? Name, string? Description);
public record InviteMemberRequest(string Email);

/// <summary>Приглашение в команду (ожидает подтверждения пользователем).</summary>
public record TeamInviteDto(Guid Id, Guid TeamId, string TeamName, Guid InvitedByUserId, string InvitedByUserName, DateTime CreatedAt);
