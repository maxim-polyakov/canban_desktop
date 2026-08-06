namespace CanbanServer.Application.Contracts;

public interface IQuestNotificationService
{
    Task NotifyAsync(Guid questId, Guid actorUserId, string eventTitle, string details, CancellationToken ct = default);
}
