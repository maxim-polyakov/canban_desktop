using CanbanServer.Application.DTOs;

namespace CanbanServer.Application.Contracts;

/// <summary>
/// Публикация событий в реалтайм-ленту (SignalR). Вызывается при уровне, закрытии квеста, ачивке и т.д.
/// </summary>
public interface IActivityHub
{
    Task PushToTeamAsync(Guid teamId, ActivityDto activity, CancellationToken ct = default);
}
