using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct = default);
    Task<AuthResponse?> LoginAsync(LoginRequest request, CancellationToken ct = default);
    Task<UserDto?> GetUserByIdAsync(Guid userId, CancellationToken ct = default);
    Task<UserDto?> UpdateProfileAsync(Guid userId, UpdateProfileRequest request, CancellationToken ct = default);
    /// <summary>Подтверждение email по коду из 6 цифр. При успехе возвращает AuthResponse для автоматического входа.</summary>
    Task<AuthResponse?> ConfirmEmailByCodeAsync(string email, string code, CancellationToken ct = default);
}
