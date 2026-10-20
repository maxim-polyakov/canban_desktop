using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

public class SprintService : ISprintService
{
    private readonly CanbanDbContext _db;
    private readonly IBoardHub _boardHub;
    private readonly CacheService _cache;

    public SprintService(CanbanDbContext db, IBoardHub boardHub, CacheService cache)
    {
        _db = db;
        _boardHub = boardHub;
        _cache = cache;
    }

    public async Task<List<SprintDto>> GetByBoardIdAsync(Guid boardId, CancellationToken ct = default)
    {
        var sprints = await _db.Sprints
            .Where(s => s.BoardId == boardId)
            .OrderBy(s => s.Status == SprintStatus.Active ? 0 : s.Status == SprintStatus.Future ? 1 : 2)
            .ThenBy(s => s.Order)
            .ToListAsync(ct);
        var counts = await _db.Quests
            .Where(q => q.BoardId == boardId && q.SprintId != null)
            .GroupBy(q => q.SprintId!.Value)
            .Select(g => new { SprintId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.SprintId, x => x.Count, ct);
        return sprints.Select(s => Map(s, counts.GetValueOrDefault(s.Id))).ToList();
    }

    public async Task<SprintDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var sprint = await _db.Sprints.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (sprint == null) return null;
        var count = await _db.Quests.CountAsync(q => q.SprintId == id, ct);
        return Map(sprint, count);
    }

    public async Task<SprintDto?> GetActiveByBoardIdAsync(Guid boardId, CancellationToken ct = default)
    {
        var sprint = await _db.Sprints.FirstOrDefaultAsync(s => s.BoardId == boardId && s.Status == SprintStatus.Active, ct);
        if (sprint == null) return null;
        var count = await _db.Quests.CountAsync(q => q.SprintId == sprint.Id, ct);
        return Map(sprint, count);
    }

    public async Task<SprintDto> CreateAsync(Guid boardId, CreateSprintRequest request, CancellationToken ct = default)
    {
        var boardExists = await _db.Boards.AnyAsync(b => b.Id == boardId, ct);
        if (!boardExists) throw new ArgumentException("Board not found");
        var maxOrder = await _db.Sprints.Where(s => s.BoardId == boardId).MaxAsync(s => (int?)s.Order, ct) ?? -1;
        var sprint = new Sprint
        {
            Id = Guid.NewGuid(),
            BoardId = boardId,
            Name = request.Name.Trim(),
            Goal = request.Goal,
            Status = SprintStatus.Future,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            Order = maxOrder + 1,
            CreatedAt = DateTime.UtcNow
        };
        _db.Sprints.Add(sprint);
        await _db.SaveChangesAsync(ct);
        await InvalidateBoard(boardId, ct);
        return Map(sprint, 0);
    }

    public async Task<SprintDto?> UpdateAsync(Guid id, UpdateSprintRequest request, CancellationToken ct = default)
    {
        var sprint = await _db.Sprints.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (sprint == null) return null;
        if (request.Name != null) sprint.Name = request.Name.Trim();
        if (request.Goal != null) sprint.Goal = request.Goal;
        if (request.StartDate != null) sprint.StartDate = request.StartDate;
        if (request.EndDate != null) sprint.EndDate = request.EndDate;
        if (request.Order != null) sprint.Order = request.Order.Value;
        await _db.SaveChangesAsync(ct);
        await InvalidateBoard(sprint.BoardId, ct);
        var count = await _db.Quests.CountAsync(q => q.SprintId == id, ct);
        return Map(sprint, count);
    }

    public async Task<SprintDto?> StartAsync(Guid id, StartSprintRequest request, CancellationToken ct = default)
    {
        var sprint = await _db.Sprints.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (sprint == null) return null;
        if (sprint.Status == SprintStatus.Closed)
            throw new InvalidOperationException("Closed sprint cannot be started");

        if (sprint.Status == SprintStatus.Active)
            throw new InvalidOperationException("Спринт уже начат.");

        var name = request.Name?.Trim();
        if (request.Name != null && string.IsNullOrEmpty(name)) throw new ArgumentException("Укажите название спринта.");
        if (name is { Length: > 200 }) throw new ArgumentException("Название спринта не должно превышать 200 символов.");
        var start = request.StartDate ?? sprint.StartDate ?? DateTime.UtcNow;
        var end = request.EndDate ?? sprint.EndDate;
        if (end.HasValue && end <= start) throw new ArgumentException("Дата окончания должна быть позже даты начала.");
        if (request.AutoComplete && !end.HasValue) throw new ArgumentException("Чтобы завершать спринт автоматически, укажите дату окончания.");

        sprint.Status = SprintStatus.Active;
        sprint.StartDate = start;
        sprint.EndDate = end;
        if (!string.IsNullOrEmpty(name)) sprint.Name = name;
        if (request.Goal != null) sprint.Goal = string.IsNullOrWhiteSpace(request.Goal) ? null : request.Goal.Trim();
        sprint.AutoComplete = request.AutoComplete;
        await _db.SaveChangesAsync(ct);
        await InvalidateBoard(sprint.BoardId, ct);
        var count = await _db.Quests.CountAsync(q => q.SprintId == id, ct);
        return Map(sprint, count);
    }

    public async Task<SprintDto?> CompleteAsync(Guid id, CompleteSprintRequest request, CancellationToken ct = default)
    {
        var sprint = await _db.Sprints.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (sprint == null) return null;

        var incomplete = await _db.Quests
            .Include(q => q.Column)
            .Where(q => q.SprintId == id && q.Column.Kind != ColumnKind.Done && q.Column.Kind != ColumnKind.Archive)
            .ToListAsync(ct);

        if (request.MoveIncompleteToSprintId.HasValue)
        {
            var target = await _db.Sprints.FirstOrDefaultAsync(
                s => s.Id == request.MoveIncompleteToSprintId.Value && s.BoardId == sprint.BoardId, ct)
                ?? throw new ArgumentException("Target sprint not found");
            foreach (var quest in incomplete)
                quest.SprintId = target.Id;
        }
        else if (request.MoveIncompleteToBacklog)
        {
            foreach (var quest in incomplete)
                quest.SprintId = null;
        }

        sprint.Status = SprintStatus.Closed;
        sprint.EndDate ??= DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await InvalidateBoard(sprint.BoardId, ct);
        var count = await _db.Quests.CountAsync(q => q.SprintId == id, ct);
        return Map(sprint, count);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var sprint = await _db.Sprints.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (sprint == null) return false;
        if (sprint.Status == SprintStatus.Active)
            throw new InvalidOperationException("Active sprint cannot be deleted");
        var boardId = sprint.BoardId;
        var quests = await _db.Quests.Where(q => q.SprintId == id).ToListAsync(ct);
        foreach (var quest in quests)
            quest.SprintId = null;
        _db.Sprints.Remove(sprint);
        await _db.SaveChangesAsync(ct);
        await InvalidateBoard(boardId, ct);
        return true;
    }

    public async Task<int> CompleteDueAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var due = await _db.Sprints.Where(s => s.Status == SprintStatus.Active && s.AutoComplete && s.EndDate != null && s.EndDate <= now)
            .Select(s => s.Id).ToListAsync(ct);
        foreach (var id in due)
            await CompleteAsync(id, new CompleteSprintRequest(null, true), ct);
        return due.Count;
    }

    private async Task InvalidateBoard(Guid boardId, CancellationToken ct)
    {
        await _cache.InvalidateAsync("board:detail:" + boardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(boardId, ct);
    }

    private static SprintDto Map(Sprint sprint, int questCount) => new(
        sprint.Id,
        sprint.BoardId,
        sprint.Name,
        sprint.Goal,
        sprint.Status,
        sprint.StartDate,
        sprint.EndDate,
        sprint.Order,
        sprint.CreatedAt,
        questCount,
        sprint.AutoComplete);
}
