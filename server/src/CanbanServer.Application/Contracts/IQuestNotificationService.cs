namespace CanbanServer.Application.Contracts;

public interface IQuestNotificationService
{
    /// <param name="eventKey">Notification scheme event, e.g. ISSUE_UPDATED.</param>
    Task NotifyAsync(Guid questId, Guid actorUserId, string eventTitle, string details, CancellationToken ct = default, string eventKey = "ISSUE_UPDATED");
}
