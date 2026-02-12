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

    public AuthService(CanbanDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
        if (await _db.Users.AnyAsync(u => u.Email == request.Email, ct))
            throw new InvalidOperationException("Пользователь с таким email уже зарегистрирован.");

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = request.Email.Trim().ToLowerInvariant(),
            DisplayName = request.DisplayName.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            CreatedAt = DateTime.UtcNow
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

        var userDto = new UserDto(user.Id, user.Email, user.DisplayName, user.AvatarUrl, user.CreatedAt);
        var token = GenerateJwt(user);
        var expiresIn = GetExpiresInSeconds();
        return new AuthResponse(token, "Bearer", expiresIn, userDto);
    }

    public async Task<AuthResponse?> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email.Trim().ToLowerInvariant(), ct);
        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return null;

        var userDto = new UserDto(user.Id, user.Email, user.DisplayName, user.AvatarUrl, user.CreatedAt);
        var token = GenerateJwt(user);
        var expiresIn = GetExpiresInSeconds();
        return new AuthResponse(token, "Bearer", expiresIn, userDto);
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
