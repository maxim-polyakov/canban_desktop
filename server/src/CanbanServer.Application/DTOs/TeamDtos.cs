namespace CanbanServer.Application.DTOs;

public record TeamDto(Guid Id, string Name, string? Description, DateTime CreatedAt);
public record TeamMemberDto(Guid UserId, string DisplayName, string? AvatarUrl, string Role, DateTime JoinedAt);
public record CreateTeamRequest(string Name, string? Description);
public record UpdateTeamRequest(string? Name, string? Description);
