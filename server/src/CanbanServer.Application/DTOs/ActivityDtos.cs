namespace CanbanServer.Application.DTOs;

public record ActivityDto(Guid Id, Guid UserId, string UserName, string? UserAvatarUrl, string Type, string Title, string? Description, string? PayloadJson, DateTime CreatedAt);
public record ActivityFeedRequest(int Limit = 20, DateTime? Before = null);
