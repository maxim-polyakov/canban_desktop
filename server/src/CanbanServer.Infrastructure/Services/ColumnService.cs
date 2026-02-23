using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

public class ColumnService : IColumnService
{
    private readonly CanbanDbContext _db;
    private readonly IQuestService _questService;
    private readonly CacheService _cache;

    public ColumnService(CanbanDbContext db, IQuestService questService, CacheService cache)
    {
        _db = db;
        _questService = questService;
        _cache = cache;
    }

    public async Task<ColumnDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var c = await _db.Columns.Include(x => x.Quests).ThenInclude(q => q.Assignee).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c == null) return null;
        var quests = await _questService.GetByColumnIdAsync(id, ct);
        return new ColumnDto(c.Id, c.BoardId, c.Title, c.Order, c.Kind, c.CreatedAt, quests);
    }

    public async Task<List<ColumnSummaryDto>> GetByBoardIdAsync(Guid boardId, CancellationToken ct = default)
    {
        var list = await _db.Columns.Where(x => x.BoardId == boardId).OrderBy(x => x.Order).ToListAsync(ct);
        return list.Select(c => new ColumnSummaryDto(c.Id, c.BoardId, c.Title, c.Order, c.Kind)).ToList();
    }

    public async Task<ColumnSummaryDto> CreateAsync(Guid boardId, CreateColumnRequest request, CancellationToken ct = default)
    {
        var maxOrder = await _db.Columns.Where(c => c.BoardId == boardId).MaxAsync(c => (int?)c.Order, ct) ?? -1;
        var col = new Domain.Entities.Column
        {
            Id = Guid.NewGuid(),
            BoardId = boardId,
            Title = request.Title,
            Order = request.Order >= 0 ? request.Order : maxOrder + 1,
            Kind = request.Kind,
            CreatedAt = DateTime.UtcNow
        };
        _db.Columns.Add(col);
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + boardId, ct);
        return new ColumnSummaryDto(col.Id, col.BoardId, col.Title, col.Order, col.Kind);
    }

    public async Task<ColumnSummaryDto?> UpdateAsync(Guid id, UpdateColumnRequest request, CancellationToken ct = default)
    {
        var c = await _db.Columns.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c == null) return null;
        if (request.Title != null) c.Title = request.Title;
        if (request.Order != null) c.Order = request.Order.Value;
        if (request.Kind != null) c.Kind = request.Kind.Value;
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + c.BoardId, ct);
        return new ColumnSummaryDto(c.Id, c.BoardId, c.Title, c.Order, c.Kind);
    }

    public async Task ReorderAsync(Guid boardId, ReorderColumnsRequest request, CancellationToken ct = default)
    {
        for (var i = 0; i < request.ColumnIdsInOrder.Count; i++)
        {
            var col = await _db.Columns.FirstOrDefaultAsync(c => c.Id == request.ColumnIdsInOrder[i] && c.BoardId == boardId, ct);
            if (col != null) col.Order = i;
        }
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + boardId, ct);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var c = await _db.Columns.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c == null) return false;
        var boardId = c.BoardId;
        _db.Columns.Remove(c);
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + boardId, ct);
        return true;
    }
}
