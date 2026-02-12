using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct = default);
    Task<AuthResponse?> LoginAsync(LoginRequest request, CancellationToken ct = default);
}
