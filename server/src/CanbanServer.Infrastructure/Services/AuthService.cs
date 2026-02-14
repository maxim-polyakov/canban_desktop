using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly CanbanDbContext _db;
    private readonly IConfiguration _config;
    private readonly IEmailSender _emailSender;

    public AuthService(CanbanDbContext db, IConfiguration config, IEmailSender emailSender)
    {
        _db = db;
        _config = config;
        _emailSender = emailSender;
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
        if (await _db.Users.AnyAsync(u => u.Email == request.Email, ct))
            throw new InvalidOperationException("Пользователь с таким email уже зарегистрирован.");

        var confirmationCode = Random.Shared.Next(100000, 999999).ToString();
        var codeExpiresAt = DateTime.UtcNow.AddMinutes(15);

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = request.Email.Trim().ToLowerInvariant(),
            DisplayName = request.DisplayName.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            CreatedAt = DateTime.UtcNow,
            EmailConfirmed = false,
            EmailConfirmationToken = confirmationCode,
            EmailConfirmationTokenExpiresAt = codeExpiresAt
        };
        _db.Users.Add(user);

        var character = new Character
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Name = user.DisplayName,
            TotalXp = 0,
            LevelId = 1,
            UpdatedAt = DateTime.UtcNow
        };
        _db.Characters.Add(character);

        await _db.SaveChangesAsync(ct);

        _ = SendRegistrationConfirmationAsync(user.Email, user.DisplayName, confirmationCode, ct);

        var userDto = new UserDto(user.Id, user.Email, user.DisplayName, user.AvatarUrl, user.CreatedAt);
        return new AuthResponse("", "Bearer", 0, userDto);
    }

    private async Task SendRegistrationConfirmationAsync(string email, string displayName, string confirmationCode, CancellationToken ct)
    {
        var appName = _config["Smtp:AppName"]?.Trim() ?? "Canban";
        var subject = $"Код подтверждения — {appName}";
        var body = $@"
<!DOCTYPE html>
<html>
<head><meta charset=""utf-8""></head>
<body style=""font-family: sans-serif; line-height: 1.5;"">
  <h2>Код подтверждения</h2>
  <p>Здравствуйте, <strong>{System.Net.WebUtility.HtmlEncode(displayName)}</strong>.</p>
  <p>Вы зарегистрировались в <strong>{System.Net.WebUtility.HtmlEncode(appName)}</strong>. Введите этот код в форме на сайте:</p>
  <p style=""font-size: 1.5rem; letter-spacing: 0.2em; font-weight: 600;"">{System.Net.WebUtility.HtmlEncode(confirmationCode)}</p>
  <p style=""color: #6b7280; font-size: 0.9em;"">Код действителен 15 минут. Это письмо отправлено автоматически, не отвечайте на него.</p>
</body>
</html>";
        await _emailSender.SendAsync(email, displayName, subject, body.Trim(), ct);
    }

    public async Task RequestPasswordResetAsync(string email, CancellationToken ct = default)
    {
        var normalizedEmail = email?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(normalizedEmail)) return;
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail, ct);
        if (user == null) return;
        var code = Random.Shared.Next(100000, 999999).ToString();
        user.PasswordResetToken = code;
        user.PasswordResetTokenExpiresAt = DateTime.UtcNow.AddMinutes(15);
        await _db.SaveChangesAsync(ct);
        _ = SendPasswordResetAsync(normalizedEmail, user.DisplayName, code, ct);
    }

    private async Task SendPasswordResetAsync(string email, string displayName, string code, CancellationToken ct)
    {
        var appName = _config["Smtp:AppName"]?.Trim() ?? "Canban";
        var subject = $"Сброс пароля — {appName}";
        var body = $@"
<!DOCTYPE html>
<html>
<head><meta charset=""utf-8""></head>
<body style=""font-family: sans-serif; line-height: 1.5;"">
  <h2>Сброс пароля</h2>
  <p>Здравствуйте, <strong>{System.Net.WebUtility.HtmlEncode(displayName)}</strong>.</p>
  <p>Запрошен сброс пароля в <strong>{System.Net.WebUtility.HtmlEncode(appName)}</strong>. Введите этот код на странице сброса пароля:</p>
  <p style=""font-size: 1.5rem; letter-spacing: 0.2em; font-weight: 600;"">{System.Net.WebUtility.HtmlEncode(code)}</p>
  <p style=""color: #6b7280; font-size: 0.9em;"">Код действителен 15 минут. Если вы не запрашивали сброс, проигнорируйте это письмо.</p>
</body>
</html>";
        await _emailSender.SendAsync(email, displayName, subject, body.Trim(), ct);
    }

    public async Task<bool> ResetPasswordAsync(string email, string code, string newPassword, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(newPassword))
            return false;
        if (newPassword.Length < 6) return false;
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var cleanCode = code.Trim();
        if (cleanCode.Length != 6) return false;
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail, ct);
        if (user == null) return false;
        if (user.PasswordResetToken != cleanCode) return false;
        if (user.PasswordResetTokenExpiresAt.HasValue && user.PasswordResetTokenExpiresAt.Value < DateTime.UtcNow)
            return false;
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        user.PasswordResetToken = null;
        user.PasswordResetTokenExpiresAt = null;
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<AuthResponse?> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email.Trim().ToLowerInvariant(), ct);
        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return null;
        if (!user.EmailConfirmed)
        {
            if (user.EmailConfirmationToken == null && user.EmailConfirmationTokenExpiresAt == null)
            {
                user.EmailConfirmed = true;
                await _db.SaveChangesAsync(ct);
            }
            else
                throw new InvalidOperationException("EMAIL_NOT_CONFIRMED");
        }

        var userDto = new UserDto(user.Id, user.Email, user.DisplayName, user.AvatarUrl, user.CreatedAt);
        var token = GenerateJwt(user);
        var expiresIn = GetExpiresInSeconds();
        return new AuthResponse(token, "Bearer", expiresIn, userDto);
    }

    public async Task<AuthResponse?> ConfirmEmailByCodeAsync(string email, string code, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(code)) return null;
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var cleanCode = code.Trim();
        if (cleanCode.Length != 6) return null;
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail, ct);
        if (user == null) return null;
        if (user.EmailConfirmationToken != cleanCode) return null;
        if (user.EmailConfirmationTokenExpiresAt.HasValue && user.EmailConfirmationTokenExpiresAt.Value < DateTime.UtcNow)
            return null;
        user.EmailConfirmed = true;
        user.EmailConfirmationToken = null;
        user.EmailConfirmationTokenExpiresAt = null;
        await _db.SaveChangesAsync(ct);
        var userDto = new UserDto(user.Id, user.Email, user.DisplayName, user.AvatarUrl, user.CreatedAt);
        var token = GenerateJwt(user);
        var expiresIn = GetExpiresInSeconds();
        return new AuthResponse(token, "Bearer", expiresIn, userDto);
    }

    public async Task<UserDto?> GetUserByIdAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _db.Users.FindAsync(new object[] { userId }, ct);
        return user == null ? null : new UserDto(user.Id, user.Email, user.DisplayName, user.AvatarUrl, user.CreatedAt);
    }

    public async Task<UserDto?> UpdateProfileAsync(Guid userId, UpdateProfileRequest request, CancellationToken ct = default)
    {
        var user = await _db.Users.FindAsync(new object[] { userId }, ct);
        if (user == null) return null;
        if (request.DisplayName != null) user.DisplayName = request.DisplayName.Trim();
        if (request.AvatarUrl != null) user.AvatarUrl = request.AvatarUrl.Trim();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.UserId == userId, ct);
        if (character != null && request.DisplayName != null) character.Name = request.DisplayName.Trim();
        await _db.SaveChangesAsync(ct);
        return new UserDto(user.Id, user.Email, user.DisplayName, user.AvatarUrl, user.CreatedAt);
    }

    private string GenerateJwt(User user)
    {
        var key = _config["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key не задан в конфигурации.");
        var issuer = _config["Jwt:Issuer"] ?? "CanbanServer";
        var audience = _config["Jwt:Audience"] ?? "CanbanClient";
        var expiresMinutes = int.TryParse(_config["Jwt:ExpirationMinutes"], out var m) ? m : 60;

        var keyBytes = Encoding.UTF8.GetBytes(key);
        var signingKey = new SymmetricSecurityKey(keyBytes);
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.DisplayName)
        };

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiresMinutes),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private int GetExpiresInSeconds()
    {
        var expiresMinutes = int.TryParse(_config["Jwt:ExpirationMinutes"], out var m) ? m : 60;
        return expiresMinutes * 60;
    }
}
