using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct = default);
    Task<AuthResponse?> LoginAsync(LoginRequest request, CancellationToken ct = default);
    Task<UserDto?> GetUserByIdAsync(Guid userId, CancellationToken ct = default);
    /// <summary>Список всех зарегистрированных пользователей (почта, имя) для страницы участников. Только для авторизованных.</summary>
    Task<List<UserDto>> GetAllUsersAsync(CancellationToken ct = default);
    /// <summary>Публичные данные пользователя для просмотра профиля (без email).</summary>
    Task<PublicUserDto?> GetPublicUserAsync(Guid userId, CancellationToken ct = default);
    Task<UserDto?> UpdateProfileAsync(Guid userId, UpdateProfileRequest request, CancellationToken ct = default);
    /// <summary>Подтверждение email по коду из 6 цифр. При успехе возвращает AuthResponse для автоматического входа.</summary>
    Task<AuthResponse?> ConfirmEmailByCodeAsync(string email, string code, CancellationToken ct = default);
    /// <summary>Запрос сброса пароля: отправляет на email код из 6 цифр. Всегда возвращает true (не раскрывать наличие email).</summary>
    Task RequestPasswordResetAsync(string email, CancellationToken ct = default);
    /// <summary>Сброс пароля по коду из письма. Возвращает true при успехе.</summary>
    Task<bool> ResetPasswordAsync(string email, string code, string newPassword, CancellationToken ct = default);
}
