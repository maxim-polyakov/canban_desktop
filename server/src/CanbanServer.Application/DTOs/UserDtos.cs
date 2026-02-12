namespace CanbanServer.Application.DTOs;

public record UserDto(Guid Id, string Email, string DisplayName, string? AvatarUrl, DateTime CreatedAt);
