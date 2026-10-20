using System.Text.Json;
using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public class BoardLayoutColumn
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public List<Guid> StatusIds { get; set; } = new();
}

public class BoardColumnLayoutData
{
    public List<BoardLayoutColumn> Columns { get; set; } = new();
}

public record BoardStatusInfo(Guid Id, string Title, ColumnKind Kind, int Order);

public record NewBoardStatusRequest(string Key, string Name, int Kind);

public record PublishLayoutColumnRequest(string? Id, string Name, List<string> StatusIds);

public record PublishColumnLayoutRequest(List<PublishLayoutColumnRequest> Columns, List<NewBoardStatusRequest>? NewStatuses);

public record BoardColumnLayoutDto(bool Configured, List<BoardLayoutColumn> Columns, List<Guid> Hidden, List<BoardStatusInfo> Statuses);

/// <summary>Jira-style board columns: each column shows one or more statuses, unmapped statuses are hidden.</summary>
public class BoardColumnLayoutService
{
    public const int MaxColumns = 30;
    public const int MaxName = 100;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<ColumnKind> NewStatusKinds = new() { ColumnKind.Backlog, ColumnKind.InProgress, ColumnKind.Review, ColumnKind.Done, ColumnKind.Custom };

    private readonly CanbanDbContext _db;
    private readonly IBoardHub _boardHub;
    private readonly CacheService _cache;

    public BoardColumnLayoutService(CanbanDbContext db, IBoardHub boardHub, CacheService cache)
    {
        _db = db;
        _boardHub = boardHub;
        _cache = cache;
    }

    public static BoardColumnLayoutData? Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize<BoardColumnLayoutData>(json, Json); }
        catch (JsonException) { return null; }
    }

    /// <summary>Drops deleted statuses and columns left without statuses; no layout means one column per status.</summary>
    public static BoardColumnLayoutDto Resolve(BoardColumnLayoutData? data, IReadOnlyList<BoardStatusInfo> statuses)
    {
        var ordered = statuses.OrderBy(s => s.Order).ToList();
        if (data == null || data.Columns.Count == 0)
        {
            var single = ordered.Select(s => new BoardLayoutColumn { Id = s.Id, Name = s.Title, StatusIds = new() { s.Id } }).ToList();
            return new BoardColumnLayoutDto(false, single, new(), ordered);
        }
        var known = ordered.Select(s => s.Id).ToHashSet();
        var used = new HashSet<Guid>();
        var columns = new List<BoardLayoutColumn>();
        foreach (var column in data.Columns)
        {
            var ids = column.StatusIds.Where(id => known.Contains(id) && used.Add(id)).ToList();
            if (ids.Count > 0) columns.Add(new BoardLayoutColumn { Id = column.Id, Name = column.Name, StatusIds = ids });
        }
        var hidden = ordered.Where(s => !used.Contains(s.Id)).Select(s => s.Id).ToList();
        return new BoardColumnLayoutDto(true, columns, hidden, ordered);
    }

    /// <summary>Validates a draft; returns the layout with new statuses referenced by their keys.</summary>
    public static (BoardColumnLayoutData Layout, List<(string Key, string Name, ColumnKind Kind)> NewStatuses) Normalize(
        PublishColumnLayoutRequest request, IReadOnlyList<BoardStatusInfo> statuses, Func<string, Guid> idForKey)
    {
        var newStatuses = new List<(string Key, string Name, ColumnKind Kind)>();
        var names = statuses.Select(s => s.Title.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var item in request.NewStatuses ?? new())
        {
            var key = (item.Key ?? "").Trim();
            var name = (item.Name ?? "").Trim();
            if (key.Length == 0 || newStatuses.Any(n => n.Key == key)) throw new ArgumentException("Некорректный ключ нового статуса");
            if (name.Length == 0) throw new ArgumentException("Укажите имя статуса");
            if (name.Length > MaxName) throw new ArgumentException($"Имя статуса длиннее {MaxName} символов");
            if (!names.Add(name)) throw new ArgumentException($"Статус «{name}» уже существует");
            if (!Enum.IsDefined(typeof(ColumnKind), item.Kind) || !NewStatusKinds.Contains((ColumnKind)item.Kind)) throw new ArgumentException("Некорректная категория статуса");
            newStatuses.Add((key, name, (ColumnKind)item.Kind));
        }

        var columns = request.Columns ?? new();
        if (columns.Count == 0) throw new ArgumentException("На доске должен быть хотя бы один столбец");
        if (columns.Count > MaxColumns) throw new ArgumentException($"На доске может быть не больше {MaxColumns} столбцов");
        var existing = statuses.Select(s => s.Id).ToHashSet();
        var used = new HashSet<Guid>();
        var columnIds = new HashSet<Guid>();
        var layout = new BoardColumnLayoutData();
        foreach (var column in columns)
        {
            var name = (column.Name ?? "").Trim();
            if (name.Length == 0) throw new ArgumentException("Укажите название столбца");
            if (name.Length > MaxName) throw new ArgumentException($"Название столбца длиннее {MaxName} символов");
            var refs = column.StatusIds ?? new();
            if (refs.Count == 0) throw new ArgumentException("Столбцы должны иметь хотя бы по одному статусу");
            var ids = new List<Guid>();
            foreach (var reference in refs)
            {
                Guid id;
                if (Guid.TryParse(reference, out var parsed) && existing.Contains(parsed)) id = parsed;
                else if (newStatuses.Any(n => n.Key == reference)) id = idForKey(reference);
                else throw new ArgumentException("Статус не найден на этой доске");
                if (!used.Add(id)) throw new ArgumentException("Статус может быть только в одном столбце");
                ids.Add(id);
            }
            var columnId = Guid.TryParse(column.Id, out var given) && columnIds.Add(given) ? given : Guid.NewGuid();
            columnIds.Add(columnId);
            layout.Columns.Add(new BoardLayoutColumn { Id = columnId, Name = name, StatusIds = ids });
        }
        return (layout, newStatuses);
    }

    private async Task<List<BoardStatusInfo>> StatusesAsync(Guid boardId, CancellationToken ct) =>
        await _db.Columns.AsNoTracking()
            .Where(c => c.BoardId == boardId && c.Kind != ColumnKind.Archive)
            .OrderBy(c => c.Order)
            .Select(c => new BoardStatusInfo(c.Id, c.Title, c.Kind, c.Order))
            .ToListAsync(ct);

    public async Task<BoardColumnLayoutDto> GetAsync(Guid boardId, CancellationToken ct = default)
    {
        var json = await _db.BoardIssueLayouts.AsNoTracking().Where(a => a.BoardId == boardId).Select(a => a.ColumnLayout).FirstOrDefaultAsync(ct);
        return Resolve(Parse(json), await StatusesAsync(boardId, ct));
    }

    public async Task<BoardColumnLayoutDto> PublishAsync(Guid boardId, PublishColumnLayoutRequest request, CancellationToken ct = default)
    {
        if (!await _db.Boards.AnyAsync(b => b.Id == boardId, ct)) throw new KeyNotFoundException("Доска не найдена");
        var statuses = await StatusesAsync(boardId, ct);
        var keys = new Dictionary<string, Guid>();
        var (layout, newStatuses) = Normalize(request, statuses, key => keys.TryGetValue(key, out var id) ? id : keys[key] = Guid.NewGuid());

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        var columns = await _db.Columns.Where(c => c.BoardId == boardId).ToListAsync(ct);
        foreach (var status in newStatuses)
        {
            var id = keys.TryGetValue(status.Key, out var known) ? known : Guid.NewGuid();
            var column = new Column { Id = id, BoardId = boardId, Title = status.Name, Kind = status.Kind, CreatedAt = DateTime.UtcNow };
            _db.Columns.Add(column);
            columns.Add(column);
        }

        var order = 0;
        var placed = new HashSet<Guid>();
        foreach (var id in layout.Columns.SelectMany(c => c.StatusIds))
        {
            columns.First(c => c.Id == id).Order = order++;
            placed.Add(id);
        }
        foreach (var column in columns.Where(c => c.Kind != ColumnKind.Archive && !placed.Contains(c.Id)).OrderBy(c => c.Order).ThenBy(c => c.CreatedAt).ToList())
            column.Order = order++;
        foreach (var column in columns.Where(c => c.Kind == ColumnKind.Archive))
            column.Order = order++;

        var row = await _db.BoardIssueLayouts.FirstOrDefaultAsync(a => a.BoardId == boardId, ct);
        if (row == null) _db.BoardIssueLayouts.Add(row = new BoardIssueLayout { BoardId = boardId });
        row.ColumnLayout = JsonSerializer.Serialize(layout, Json);
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        await ChangedAsync(boardId, ct);
        return await GetAsync(boardId, ct);
    }

    public async Task<BoardColumnLayoutDto> ResetAsync(Guid boardId, CancellationToken ct = default)
    {
        var row = await _db.BoardIssueLayouts.FirstOrDefaultAsync(a => a.BoardId == boardId, ct);
        if (row?.ColumnLayout != null)
        {
            row.ColumnLayout = null;
            await _db.SaveChangesAsync(ct);
            await ChangedAsync(boardId, ct);
        }
        return await GetAsync(boardId, ct);
    }

    private async Task ChangedAsync(Guid boardId, CancellationToken ct)
    {
        await _cache.InvalidateAsync("board:detail:" + boardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(boardId, ct);
    }
}
