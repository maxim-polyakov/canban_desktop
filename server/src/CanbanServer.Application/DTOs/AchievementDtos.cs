namespace CanbanServer.Application.DTOs;

public record AchievementDto(Guid Id, string Key, string Name, string? Description, string? IconUrl, int? XpBonus, int Order);
public record UserAchievementDto(Guid AchievementId, string Key, string Name, string? IconUrl, DateTime UnlockedAt);
