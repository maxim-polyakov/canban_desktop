namespace CanbanServer.Application.Contracts;

/// <summary>
/// Реалтайм-обновления доски: при создании/изменении/удалении квеста или колонки все клиенты, смотрящие эту доску, получают событие.
/// </summary>
public interface IBoardHub
{
    Task NotifyBoardUpdatedAsync(Guid boardId, CancellationToken ct = default);
}
