namespace CanbanServer.Application.DTOs;

public record RegisterRequest(string Email, string Password, string DisplayName);
public record LoginRequest(string Email, string Password);
public record AuthResponse(string AccessToken, string TokenType, int ExpiresInSeconds, UserDto User);

/// <summary>Обновление профиля (имя, аватар). Передаются только те поля, которые нужно изменить.</summary>
public record UpdateProfileRequest(string? DisplayName, string? AvatarUrl);
