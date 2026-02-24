using Microsoft.AspNetCore.SignalR;
using CanbanServer.Application.Contracts;
using CanbanServer.Infrastructure.Hubs;

namespace CanbanServer.Infrastructure.Services;

public class SignalRBoardHub : IBoardHub
{
    private readonly IHubContext<BoardHub> _hubContext;

    public SignalRBoardHub(IHubContext<BoardHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public async Task NotifyBoardUpdatedAsync(Guid boardId, CancellationToken ct = default)
    {
        await _hubContext.Clients
            .Group(BoardHub.GroupPrefix + boardId)
            .SendAsync("BoardUpdated", ct);
    }
}
