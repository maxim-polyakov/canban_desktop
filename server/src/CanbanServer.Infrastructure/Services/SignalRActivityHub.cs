using Microsoft.AspNetCore.SignalR;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Infrastructure.Hubs;

namespace CanbanServer.Infrastructure.Services;

public class SignalRActivityHub : IActivityHub
{
    private readonly IHubContext<ActivityFeedHub> _hubContext;

    public SignalRActivityHub(IHubContext<ActivityFeedHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public async Task PushToTeamAsync(Guid teamId, ActivityDto activity, CancellationToken ct = default)
    {
        await _hubContext.Clients
            .Group(ActivityFeedHub.GroupPrefix + teamId)
            .SendAsync("Activity", activity, ct);
    }
}
