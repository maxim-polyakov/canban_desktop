namespace CanbanServer.Domain.Entities;

/// <summary>Personal API token. Only the SHA-256 hash is stored; the token itself is shown once on creation.</summary>
public class ApiToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = "";
    public string TokenHash { get; set; } = "";
    /// <summary>First characters of the token, shown so users can tell tokens apart.</summary>
    public string Hint { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public DateTime? LastUsedAt { get; set; }
    public string? LastUsedIp { get; set; }
    public DateTime? RevokedAt { get; set; }
    /// <summary>Comma-separated Atlassian-style scopes; null for a classic token with the user's full access.</summary>
    public string? Scopes { get; set; }
}
