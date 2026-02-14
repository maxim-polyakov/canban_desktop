namespace CanbanServer.Application.DTOs;

public record UserDto(Guid Id, string Email, string DisplayName, string? AvatarUrl, DateTime CreatedAt);
/// <summary>Публичные данные пользователя для отображения профиля (без email).</summary>
public record PublicUserDto(Guid Id, string DisplayName, string? AvatarUrl);
