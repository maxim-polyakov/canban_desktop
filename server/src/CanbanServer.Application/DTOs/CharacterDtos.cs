namespace CanbanServer.Application.DTOs;

public record CharacterDto(Guid Id, Guid UserId, string Name, int TotalXp, int LevelNumber, string? LevelTitle, string? BadgeUrl, DateTime UpdatedAt);
public record LevelDto(int Id, int LevelNumber, int XpRequired, string? Title, string? BadgeUrl);
public record XpTransactionDto(Guid Id, int Amount, string Source, string? Description, DateTime CreatedAt);
