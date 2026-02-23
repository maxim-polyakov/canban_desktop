using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

public class ActivityFeedService : IActivityFeedService
{
    private readonly CanbanDbContext _db;
    private readonly CacheService _cache;

    public ActivityFeedService(CanbanDbContext db, CacheService cache)
    {
        _db = db;
        _cache = cache;
    }

    public async Task<List<ActivityDto>> GetFeedAsync(Guid teamId, ActivityFeedRequest request, CancellationToken ct = default)
    {
        var beforeKey = request.Before.HasValue ? request.Before.Value.Ticks.ToString() : "";
        var key = $"activity:feed:{teamId}:{request.Limit}:{beforeKey}";
        return (await _cache.GetOrCreateAsync(
            key,
            TimeSpan.FromSeconds(30),
            async _ =>
            {
                var query = _db.Activities
                    .Include(a => a.User)
                    .Where(a => a.TeamId == teamId);
                if (request.Before.HasValue)
                    query = query.Where(a => a.CreatedAt < request.Before.Value);
                var list = await query
                    .OrderByDescending(a => a.CreatedAt)
                    .Take(request.Limit)
                    .ToListAsync(ct);
                return list.Select(a => new ActivityDto(a.Id, a.UserId, a.User.DisplayName, a.User.AvatarUrl, a.Type.ToString(), a.Title, a.Description, a.PayloadJson, a.CreatedAt)).ToList();
            },
            ct)) ?? new List<ActivityDto>();
    }

    public async Task<ActivityDto> PublishAsync(Guid teamId, Guid userId, string type, string title, string? description = null, string? payloadJson = null, CancellationToken ct = default)
    {
        var user = await _db.Users.FindAsync(new object[] { userId }, ct);
        var activity = new Domain.Entities.Activity
        {
            Id = Guid.NewGuid(),
            TeamId = teamId,
            UserId = userId,
            Type = Enum.TryParse<Domain.Entities.ActivityType>(type, out var t) ? t : Domain.Entities.ActivityType.QuestCompleted,
            Title = title,
            Description = description,
            PayloadJson = payloadJson,
            CreatedAt = DateTime.UtcNow
        };
        _db.Activities.Add(activity);
        await _db.SaveChangesAsync(ct);
        return new ActivityDto(activity.Id, activity.UserId, user?.DisplayName ?? "", user?.AvatarUrl, activity.Type.ToString(), activity.Title, activity.Description, activity.PayloadJson, activity.CreatedAt);
    }
}
