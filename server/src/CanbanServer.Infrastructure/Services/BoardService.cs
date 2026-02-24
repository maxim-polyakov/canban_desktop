using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

public class BoardService : IBoardService
{
    private readonly CanbanDbContext _db;
    private readonly IBoardHub _boardHub;
    private readonly CacheService _cache;

    public BoardService(CanbanDbContext db, IBoardHub boardHub, CacheService cache)
    {
        _db = db;
        _boardHub = boardHub;
        _cache = cache;
    }

    public async Task<BoardDetailDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        return await _cache.GetOrCreateAsync(
            "board:detail:" + id,
            TimeSpan.FromMinutes(5),
            async _ =>
            {
                var b = await _db.Boards
                    .Include(x => x.Columns).ThenInclude(c => c.Quests).ThenInclude(q => q.Assignee)
                    .FirstOrDefaultAsync(x => x.Id == id, ct);
                if (b == null) return null;
                var columns = b.Columns.OrderBy(c => c.Order).Select(c => new ColumnDto(
                    c.Id, c.BoardId, c.Title, c.Order, c.Kind, c.CreatedAt,
                    c.Quests.OrderBy(q => q.Order).Select(q => MapQuest(q)).ToList())).ToList();
                return new BoardDetailDto(b.Id, b.TeamId, b.Name, b.Description, b.Order, b.CreatedAt, columns, b.CreatedByUserId);
            },
            ct);
    }

    public async Task<List<BoardDto>> GetByTeamIdAsync(Guid teamId, CancellationToken ct = default)
    {
        return (await _cache.GetOrCreateAsync(
            "board:team:" + teamId,
            TimeSpan.FromMinutes(5),
            async _ =>
            {
                var list = await _db.Boards.Where(x => x.TeamId == teamId).OrderBy(x => x.Order).ToListAsync(ct);
                return list.Select(b => new BoardDto(b.Id, b.TeamId, b.Name, b.Description, b.Order, b.CreatedAt, b.CreatedByUserId)).ToList();
            },
            ct)) ?? new List<BoardDto>();
    }

    public async Task<BoardDto> CreateAsync(CreateBoardRequest request, Guid? createdByUserId, CancellationToken ct = default)
    {
        var maxOrder = await _db.Boards.Where(b => b.TeamId == request.TeamId).MaxAsync(b => (int?)b.Order, ct) ?? -1;
        var board = new Board
        {
            Id = Guid.NewGuid(),
            TeamId = request.TeamId,
            Name = request.Name,
            Description = request.Description,
            Order = maxOrder + 1,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = createdByUserId
        };
        _db.Boards.Add(board);

        var now = DateTime.UtcNow;
        var defaultColumns = new[]
        {
            new Column { Id = Guid.NewGuid(), BoardId = board.Id, Title = "К выполнению", Order = 0, Kind = ColumnKind.Backlog, CreatedAt = now },
            new Column { Id = Guid.NewGuid(), BoardId = board.Id, Title = "В работе", Order = 1, Kind = ColumnKind.InProgress, CreatedAt = now },
            new Column { Id = Guid.NewGuid(), BoardId = board.Id, Title = "Готово", Order = 2, Kind = ColumnKind.Done, CreatedAt = now },
        };
        _db.Columns.AddRange(defaultColumns);

        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:team:" + request.TeamId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(board.Id, ct);
        return new BoardDto(board.Id, board.TeamId, board.Name, board.Description, board.Order, board.CreatedAt, board.CreatedByUserId);
    }

    public async Task<BoardDto?> UpdateAsync(Guid id, UpdateBoardRequest request, CancellationToken ct = default)
    {
        var b = await _db.Boards.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (b == null) return null;
        if (request.Name != null) b.Name = request.Name;
        if (request.Description != null) b.Description = request.Description;
        if (request.Order != null) b.Order = request.Order.Value;
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + id, ct);
        await _cache.InvalidateAsync("board:team:" + b.TeamId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(id, ct);
        return new BoardDto(b.Id, b.TeamId, b.Name, b.Description, b.Order, b.CreatedAt, b.CreatedByUserId);
    }

    public async Task<bool?> DeleteAsync(Guid id, Guid? currentUserId, CancellationToken ct = default)
    {
        var b = await _db.Boards.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (b == null) return null;
        if (b.CreatedByUserId == null || currentUserId != b.CreatedByUserId)
            return false;
        _db.Boards.Remove(b);
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + id, ct);
        await _cache.InvalidateAsync("board:team:" + b.TeamId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(id, ct);
        return true;
    }

    private static QuestDto MapQuest(Quest q) => new(q.Id, q.ColumnId, q.BoardId, q.Title, q.Description, q.AssigneeId, q.Assignee?.DisplayName, q.Assignee?.AvatarUrl, q.Order, q.DueDate, q.CreatedAt, q.CompletedAt, q.Category, q.XpReward, q.IsEpic, q.ParentEpicId);
}
