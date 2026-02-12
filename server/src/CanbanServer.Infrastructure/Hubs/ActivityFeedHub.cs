using Microsoft.AspNetCore.SignalR;

namespace CanbanServer.Infrastructure.Hubs;

/// <summary>
/// Реалтайм-лента: клиенты подписываются на группу команды и получают события «Анна получила уровень 5!» и т.д.
/// </summary>
public class ActivityFeedHub : Hub
{
    public const string GroupPrefix = "team_";

    public async Task JoinTeam(Guid teamId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupPrefix + teamId);
    }

    public async Task LeaveTeam(Guid teamId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupPrefix + teamId);
    }
}
