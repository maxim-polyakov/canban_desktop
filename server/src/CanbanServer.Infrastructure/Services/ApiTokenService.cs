using System.Security.Cryptography;
using System.Text;
using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

public sealed record CreateApiTokenRequest(string? Name, int? ExpiresInDays, List<string>? Scopes = null);

public sealed record ApiTokenDto(Guid Id, string Name, string Hint, DateTime CreatedAt, DateTime? ExpiresAt, DateTime? LastUsedAt, string? LastUsedIp, bool Expired, List<string>? Scopes);

public sealed record CreatedApiTokenDto(ApiTokenDto Token, string Secret);

public sealed record ApiTokenOwner(Guid UserId, Guid TokenId, string Email, string DisplayName, IReadOnlyList<string>? Scopes);

public class ApiTokenService
{
    public const string Prefix = "kbn_";
    public const int SecretLength = 40;
    public const int MaxActivePerUser = 20;
    public const int MaxLifetimeDays = 365;
    public const string ReadWork = "read:jira-work";
    public const string WriteWork = "write:jira-work";
    public const string ReadUser = "read:jira-user";
    public const string ManageConfiguration = "manage:jira-configuration";
    public static readonly string[] AllScopes = { ReadWork, WriteWork, ReadUser, ManageConfiguration };
    private const string Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private static readonly TimeSpan UsageWriteInterval = TimeSpan.FromMinutes(1);

    private readonly CanbanDbContext _db;
    private readonly IEmailSender _email;
    private readonly IConfiguration _config;
    private readonly ILogger<ApiTokenService> _logger;

    public ApiTokenService(CanbanDbContext db, IEmailSender email, IConfiguration config, ILogger<ApiTokenService> logger)
    {
        _db = db;
        _email = email;
        _config = config;
        _logger = logger;
    }

    public static string Generate()
    {
        var chars = new char[SecretLength];
        for (var i = 0; i < chars.Length; i++) chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return Prefix + new string(chars);
    }

    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    private static class HttpMethods
    {
        public static bool IsGet(string m) => string.Equals(m, "GET", StringComparison.OrdinalIgnoreCase);
        public static bool IsHead(string m) => string.Equals(m, "HEAD", StringComparison.OrdinalIgnoreCase);
        public static bool IsOptions(string m) => string.Equals(m, "OPTIONS", StringComparison.OrdinalIgnoreCase);
    }

    public static bool LooksLikeToken(string? value) =>
        value is { Length: > 0 } v && v.Length == Prefix.Length + SecretLength && v.StartsWith(Prefix, StringComparison.Ordinal)
        && v.Skip(Prefix.Length).All(c => Alphabet.Contains(c));

    public async Task<List<ApiTokenDto>> ListAsync(Guid userId, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var tokens = await _db.ApiTokens.AsNoTracking().Where(t => t.UserId == userId && t.RevokedAt == null)
            .OrderByDescending(t => t.CreatedAt).ToListAsync(ct);
        return tokens.Select(t => ToDto(t, now)).ToList();
    }

    public async Task<CreatedApiTokenDto> CreateAsync(Guid userId, CreateApiTokenRequest request, CancellationToken ct)
    {
        var name = request.Name?.Trim() ?? "";
        if (name.Length == 0) throw new ArgumentException("Введите название токена");
        if (name.Length > 100) throw new ArgumentException("Название токена — не больше 100 символов");
        if (request.ExpiresInDays is not { } days || days < 1 || days > MaxLifetimeDays)
            throw new ArgumentException($"Срок действия — от 1 до {MaxLifetimeDays} дней");
        string? scopes = null;
        if (request.Scopes is { } requested)
        {
            var normalized = requested.Select(x => x?.Trim().ToLowerInvariant() ?? "").Where(x => x.Length > 0).Distinct().ToList();
            if (normalized.Count == 0) throw new ArgumentException("Выберите хотя бы одну область доступа");
            var unknown = normalized.FirstOrDefault(x => !AllScopes.Contains(x));
            if (unknown != null) throw new ArgumentException($"Неизвестная область доступа: {unknown}");
            scopes = string.Join(",", AllScopes.Where(normalized.Contains));
        }

        var now = DateTime.UtcNow;
        var active = await _db.ApiTokens.CountAsync(t => t.UserId == userId && t.RevokedAt == null && (t.ExpiresAt == null || t.ExpiresAt > now), ct);
        if (active >= MaxActivePerUser) throw new InvalidOperationException($"Можно создать не больше {MaxActivePerUser} действующих токенов. Отзовите ненужные.");
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct) ?? throw new KeyNotFoundException("Пользователь не найден");

        var secret = Generate();
        var token = new ApiToken
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = name,
            TokenHash = Hash(secret),
            Hint = secret[..(Prefix.Length + 4)],
            CreatedAt = now,
            ExpiresAt = now.AddDays(days),
            Scopes = scopes,
        };
        _db.ApiTokens.Add(token);
        await _db.SaveChangesAsync(ct);
        await NotifyCreatedAsync(user, token, ct);
        return new CreatedApiTokenDto(ToDto(token, now), secret);
    }

    public async Task RevokeAsync(Guid userId, Guid id, CancellationToken ct)
    {
        var token = await _db.ApiTokens.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId && t.RevokedAt == null, ct)
            ?? throw new KeyNotFoundException("Токен не найден");
        token.RevokedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    public async Task<int> RevokeAllAsync(Guid userId, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var tokens = await _db.ApiTokens.Where(t => t.UserId == userId && t.RevokedAt == null).ToListAsync(ct);
        foreach (var token in tokens) token.RevokedAt = now;
        await _db.SaveChangesAsync(ct);
        return tokens.Count;
    }

    public async Task<ApiTokenOwner?> AuthenticateAsync(string secret, string? ipAddress, CancellationToken ct)
    {
        if (!LooksLikeToken(secret)) return null;
        var hash = Hash(secret);
        var now = DateTime.UtcNow;
        var row = await (from t in _db.ApiTokens
                         join u in _db.Users on t.UserId equals u.Id
                         where t.TokenHash == hash && t.RevokedAt == null && (t.ExpiresAt == null || t.ExpiresAt > now)
                         select new { Token = t, u.Email, u.DisplayName }).FirstOrDefaultAsync(ct);
        if (row is null) return null;
        if (row.Token.LastUsedAt is not { } last || now - last > UsageWriteInterval || row.Token.LastUsedIp != ipAddress)
        {
            row.Token.LastUsedAt = now;
            row.Token.LastUsedIp = ipAddress is { Length: > 64 } ip ? ip[..64] : ipAddress;
            try { await _db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) { _logger.LogWarning(ex, "Could not record API token usage"); }
        }
        return new ApiTokenOwner(row.Token.UserId, row.Token.Id, row.Email, row.DisplayName, ParseScopes(row.Token.Scopes));
    }

    private static ApiTokenDto ToDto(ApiToken t, DateTime now) =>
        new(t.Id, t.Name, t.Hint + "…", t.CreatedAt, t.ExpiresAt, t.LastUsedAt, t.LastUsedIp, t.ExpiresAt is { } e && e <= now, ParseScopes(t.Scopes)?.ToList());

    public static IReadOnlyList<string>? ParseScopes(string? value) =>
        value is null ? null : value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    /// <summary>Scopes a request needs, or null when any token may call it.</summary>
    public static string[] RequiredScopes(string method, string path, bool configurationChange)
    {
        if (configurationChange) return new[] { ManageConfiguration };
        var read = HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);
        if (!read) return new[] { WriteWork };
        var userPath = path.StartsWith("/api/users", StringComparison.OrdinalIgnoreCase) || path.StartsWith("/api/people", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/api/auth/me", StringComparison.OrdinalIgnoreCase) || path.StartsWith("/api/me/people", StringComparison.OrdinalIgnoreCase);
        return userPath ? new[] { ReadUser, ReadWork } : new[] { ReadWork };
    }

    public static bool Allows(IReadOnlyList<string>? granted, string[] required) =>
        granted is null || required.Any(granted.Contains);

    private async Task NotifyCreatedAsync(User user, ApiToken token, CancellationToken ct)
    {
        try
        {
            var appName = _config["Smtp:AppName"]?.Trim() ?? "Kanban";
            var site = EmailLayout.SiteUrl(_config);
            var expires = $"до {token.ExpiresAt:dd.MM.yyyy}";
            var body = EmailLayout.Render(site, EmailLayout.LogoUrl(_config), "Создан API-токен", $"""
                <p style="margin:0 0 12px">Здравствуйте, <strong>{EmailLayout.Encode(user.DisplayName)}</strong>.</p>
                <p style="margin:0 0 12px">В вашей учётной записи {EmailLayout.Encode(appName)} создан API-токен <strong>{EmailLayout.Encode(token.Name)}</strong> ({EmailLayout.Encode(expires)}).</p>
                <p style="margin:0;color:#6b778c">Если это были не вы, сразу отзовите токен и смените пароль.</p>
                """, "Открыть API-токены", $"{site}/settings/personal/security");
            await _email.SendAsync(user.Email, user.DisplayName, $"Создан API-токен — {appName}", body, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not send API token notification");
        }
    }
}
