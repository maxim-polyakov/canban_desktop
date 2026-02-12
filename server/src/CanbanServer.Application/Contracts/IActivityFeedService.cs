using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

public interface IActivityFeedService
{
    Task<List<ActivityDto>> GetFeedAsync(Guid teamId, ActivityFeedRequest request, CancellationToken ct = default);
    Task<ActivityDto> PublishAsync(Guid teamId, Guid userId, string type, string title, string? description = null, string? payloadJson = null, CancellationToken ct = default);
}
