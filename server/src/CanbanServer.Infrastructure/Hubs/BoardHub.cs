using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace CanbanServer.Infrastructure.Hubs;

/// <summary>
/// Хаб доски: клиенты подписываются на группу доски и получают BoardUpdated при любых изменениях (квест, колонка).
/// </summary>
[Authorize]
public class BoardHub : Hub
{
    public const string GroupPrefix = "board_";

    public async Task JoinBoard(string boardId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupPrefix + boardId);
    }

    public async Task LeaveBoard(string boardId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupPrefix + boardId);
    }
}
