using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

public class BoardService : IBoardService
{
    private readonly CanbanDbContext _db;
    private readonly IQuestAttachmentService _attachmentService;
    private readonly IBoardHub _boardHub;
    private readonly CacheService _cache;

    public BoardService(
        CanbanDbContext db,
        IQuestAttachmentService attachmentService,
        IBoardHub boardHub,
        CacheService cache)
    {
        _db = db;
        _attachmentService = attachmentService;
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
                    .Include(x => x.Columns).ThenInclude(c => c.Quests).ThenInclude(q => q.Assignees).ThenInclude(a => a.User)
                    .Include(x => x.Columns).ThenInclude(c => c.Quests).ThenInclude(q => q.NotificationRecipients)
                    .Include(x => x.Columns).ThenInclude(c => c.Quests).ThenInclude(q => q.ExternalNotificationRecipients)
                    .Include(x => x.Columns).ThenInclude(c => c.Quests).ThenInclude(q => q.Sprint)
                    .Include(x => x.Columns).ThenInclude(c => c.Quests).ThenInclude(q => q.QuestComponents)
                    .Include(x => x.Columns).ThenInclude(c => c.Quests).ThenInclude(q => q.QuestReleases)
                    .FirstOrDefaultAsync(x => x.Id == id, ct);
                if (b == null) return null;
                var columns = b.Columns.OrderBy(c => c.Order).Select(c => new ColumnDto(
                    c.Id, c.BoardId, c.Title, c.Order, c.Kind, c.CreatedAt,
                    c.Quests.OrderBy(q => q.Order).Select(q => MapQuest(q)).ToList())).ToList();
                return new BoardDetailDto(b.Id, b.TeamId, b.Name, b.Description, b.Order, b.CreatedAt, columns, b.CreatedByUserId, b.KeyPrefix,
                    b.Template, b.ManagementType, b.Access, b.Features, b.AvatarUrl);
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
                return list.Select(BoardDto.From).ToList();
            },
            ct)) ?? new List<BoardDto>();
    }

    public async Task<BoardDto> CreateAsync(CreateBoardRequest request, Guid? createdByUserId, CancellationToken ct = default)
    {
        var team = await _db.Teams.FirstOrDefaultAsync(t => t.Id == request.TeamId, ct)
            ?? throw new ArgumentException("Team not found");
        var maxOrder = await _db.Boards.Where(b => b.TeamId == request.TeamId).MaxAsync(b => (int?)b.Order, ct) ?? -1;
        var keyPrefix = NormalizeKey(request.KeyPrefix ?? team.Key);
        var template = SpaceTemplates.Find(request.Template);
        var management = SpaceTemplates.ManagementTypes.Contains(request.ManagementType) ? request.ManagementType! : "team";
        var access = SpaceTemplates.AccessLevels.Contains(request.Access) ? request.Access! : "private";
        var board = new Board
        {
            Id = Guid.NewGuid(),
            TeamId = request.TeamId,
            Name = request.Name,
            Description = request.Description,
            Order = maxOrder + 1,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = createdByUserId,
            KeyPrefix = keyPrefix,
            NextIssueNumber = 1,
            Template = template.Id,
            ManagementType = management,
            Access = access,
            Features = SpaceTemplates.NormalizeFeatures(template.Features),
        };
        _db.Boards.Add(board);

        var now = DateTime.UtcNow;
        var columns = template.Columns.Select(c => (c.Title, c.Kind)).ToList();
        if (request.CopySettingsFromBoardId is Guid sourceId)
        {
            var source = await _db.Boards.AsNoTracking().Include(b => b.Columns).FirstOrDefaultAsync(b => b.Id == sourceId, ct)
                ?? throw new ArgumentException("Space to copy settings from was not found");
            columns = source.Columns.Where(c => c.Kind != ColumnKind.Archive).OrderBy(c => c.Order).Select(c => (c.Title, c.Kind)).ToList();
            board.Features = string.IsNullOrEmpty(source.Features) ? SpaceTemplates.NormalizeFeatures(SpaceTemplates.LegacyFeatures) : source.Features;
            board.Template = source.Template;
        }
        _db.Columns.AddRange(columns.Select((c, i) => new Column { Id = Guid.NewGuid(), BoardId = board.Id, Title = c.Title, Order = i, Kind = c.Kind, CreatedAt = now }));

        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:team:" + request.TeamId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(board.Id, ct);
        return BoardDto.From(board);
    }

    public async Task<BoardDto?> UpdateAsync(Guid id, UpdateBoardRequest request, CancellationToken ct = default)
    {
        var b = await _db.Boards.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (b == null) return null;
        if (request.Name != null) b.Name = request.Name;
        if (request.Description != null) b.Description = request.Description;
        if (request.Order != null) b.Order = request.Order.Value;
        if (request.KeyPrefix != null) b.KeyPrefix = NormalizeKey(request.KeyPrefix);
        if (request.Access != null)
        {
            if (!SpaceTemplates.AccessLevels.Contains(request.Access)) throw new ArgumentException("Unknown access level");
            b.Access = request.Access;
        }
        if (request.Features != null) b.Features = SpaceTemplates.NormalizeFeatures(request.Features.Split(',', StringSplitOptions.RemoveEmptyEntries));
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + id, ct);
        await _cache.InvalidateAsync("board:team:" + b.TeamId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(id, ct);
        return BoardDto.From(b);
    }

    public async Task<(BoardDto Board, string? Previous)?> SetAvatarAsync(Guid id, string? avatarUrl, CancellationToken ct = default)
    {
        var b = await _db.Boards.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (b == null) return null;
        var previous = b.AvatarUrl;
        b.AvatarUrl = avatarUrl;
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + id, ct);
        await _cache.InvalidateAsync("board:team:" + b.TeamId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(id, ct);
        return (BoardDto.From(b), previous);
    }

    public async Task<bool?> DeleteAsync(Guid id, Guid? currentUserId, CancellationToken ct = default)
    {
        var b = await _db.Boards.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (b == null) return null;
        if (b.CreatedByUserId == null || currentUserId != b.CreatedByUserId)
            return false;
        var questIds = await _db.Quests
            .Where(q => q.BoardId == id)
            .Select(q => q.Id)
            .ToListAsync(ct);
        await _attachmentService.DeleteFilesForQuestIdsAsync(questIds, ct);
        _db.Boards.Remove(b);
        await _db.SaveChangesAsync(ct);
        await _cache.InvalidateAsync("board:detail:" + id, ct);
        await _cache.InvalidateAsync("board:team:" + b.TeamId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(id, ct);
        return true;
    }

    internal static QuestDto MapQuest(Quest q) => new(
        q.Id, q.ColumnId, q.BoardId, q.Title, q.Description, q.AssigneeId,
        q.Assignee?.DisplayName, q.Assignee?.AvatarUrl, q.Order, q.DueDate, q.CreatedAt,
        q.CompletedAt, q.Category, q.XpReward, q.IsEpic, q.ParentEpicId,
        q.NotificationRecipients.Select(r => r.UserId).ToList(),
        q.ExternalNotificationRecipients.Select(r => new ExternalNotificationRecipientDto(r.Email, r.DisplayName)).ToList(),
        q.Assignees.OrderBy(a => a.Order)
            .Select(a => new QuestAssigneeDto(a.UserId, a.User.DisplayName, a.User.AvatarUrl)).ToList(),
        q.Assignees.OrderBy(a => a.Order).Select(a => a.UserId).ToList(),
        string.IsNullOrWhiteSpace(q.IssueKey) ? string.Empty : q.IssueKey,
        q.IssueNumber,
        q.IssueType,
        q.Priority,
        q.Labels ?? string.Empty,
        q.SprintId,
        q.Sprint?.Name,
        q.Component,
        q.FixVersion,
        q.StoryPoints,
        q.ParentQuestId ?? q.ParentEpicId,
        q.OriginalEstimateMinutes,
        q.RemainingEstimateMinutes,
        q.DescriptionDocumentJson,
        q.QuestComponents.Select(x => x.ComponentId).ToList(),
        q.QuestReleases.Select(x => x.ReleaseId).ToList());

    private static string NormalizeKey(string? key)
    {
        var value = (key ?? "KAN").Trim().ToUpperInvariant();
        value = new string(value.Where(char.IsLetterOrDigit).ToArray());
        if (string.IsNullOrWhiteSpace(value)) value = "KAN";
        return value.Length > 10 ? value[..10] : value;
    }
}
