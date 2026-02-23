using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

/// <summary>
/// Тим-лидерборд: рейтинг внутри команды за период (не общий — чтобы не демотивировать).
/// </summary>
public class LeaderboardService : ILeaderboardService
{
    private readonly CanbanDbContext _db;
    private readonly CacheService _cache;

    public LeaderboardService(CanbanDbContext db, CacheService cache)
    {
        _db = db;
        _cache = cache;
    }

    public async Task<List<LeaderboardEntryDto>> GetTeamLeaderboardAsync(TeamLeaderboardRequest request, CancellationToken ct = default)
    {
        var to = request.To ?? DateTime.UtcNow;
        var from = request.From ?? to.AddDays(-7);
        var key = $"leaderboard:team:{request.TeamId}:{from:O}:{to:O}:{request.Limit}";
        return (await _cache.GetOrCreateAsync(key, TimeSpan.FromMinutes(2), _ => GetTeamLeaderboardCoreAsync(request, ct), ct)) ?? new List<LeaderboardEntryDto>();
    }

    private async Task<List<LeaderboardEntryDto>> GetTeamLeaderboardCoreAsync(TeamLeaderboardRequest request, CancellationToken ct)
    {
        var to = request.To ?? DateTime.UtcNow;
        var from = request.From ?? to.AddDays(-7);
        var memberIds = await _db.TeamMembers.Where(m => m.TeamId == request.TeamId).Select(m => m.UserId).ToListAsync(ct);
        var characterIds = await _db.Characters.Where(c => memberIds.Contains(c.UserId)).ToDictionaryAsync(c => c.UserId, c => c.Id, ct);
        var xpByUser = await _db.XpTransactions
            .Where(x => characterIds.Values.Contains(x.CharacterId) && x.CreatedAt >= from && x.CreatedAt <= to)
            .GroupBy(x => x.CharacterId)
            .Select(g => new { CharacterId = g.Key, Total = g.Sum(x => x.Amount) })
            .ToListAsync(ct);
        var userIdByCharacter = characterIds.ToDictionary(kv => kv.Value, kv => kv.Key); // CharacterId -> UserId
        var userXp = xpByUser.Select(x => new { UserId = userIdByCharacter.GetValueOrDefault(x.CharacterId), x.Total }).Where(x => x.UserId != Guid.Empty).ToList();
        var userIds = userXp.Select(x => x.UserId).Distinct().ToList();
        var users = await _db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);
        var characters = await _db.Characters.Include(c => c.Level).Where(c => userIds.Contains(c.UserId)).ToDictionaryAsync(c => c.UserId, ct);
        var completedCount = await _db.Quests
            .Where(q => q.AssigneeId != null && userIds.Contains(q.AssigneeId.Value) && q.CompletedAt >= from && q.CompletedAt <= to)
            .GroupBy(q => q.AssigneeId!.Value)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var completedByUser = completedCount.ToDictionary(x => x.UserId, x => x.Count);
        var ordered = userXp.OrderByDescending(x => x.Total).Take(request.Limit).ToList();
        var result = new List<LeaderboardEntryDto>();
        for (var i = 0; i < ordered.Count; i++)
        {
            var u = ordered[i];
            users.TryGetValue(u.UserId, out var user);
            characters.TryGetValue(u.UserId, out var character);
            result.Add(new LeaderboardEntryDto(
                i + 1,
                u.UserId,
                user?.DisplayName ?? "",
                user?.AvatarUrl,
                u.Total,
                completedByUser.GetValueOrDefault(u.UserId, 0),
                character?.Level?.LevelNumber ?? 1
            ));
        }
        return result;
    }

    public async Task<List<TeamKpiPointDto>> GetTeamKpiAsync(Guid teamId, DateTime? from, DateTime? to, CancellationToken ct = default)
    {
        var toDate = (to ?? DateTime.UtcNow).Date;
        var fromDate = (from ?? toDate.AddDays(-14)).Date;
        if (fromDate > toDate) fromDate = toDate;
        var key = $"leaderboard:kpi:{teamId}:{fromDate:O}:{toDate:O}";
        return (await _cache.GetOrCreateAsync(key, TimeSpan.FromMinutes(2), _ => GetTeamKpiCoreAsync(teamId, fromDate, toDate, ct), ct)) ?? new List<TeamKpiPointDto>();
    }

    private async Task<List<TeamKpiPointDto>> GetTeamKpiCoreAsync(Guid teamId, DateTime fromDate, DateTime toDate, CancellationToken ct)
    {
        var memberIds = await _db.TeamMembers.Where(m => m.TeamId == teamId).Select(m => m.UserId).ToListAsync(ct);
        if (memberIds.Count == 0) return new List<TeamKpiPointDto>();

        var characterIds = await _db.Characters.Where(c => memberIds.Contains(c.UserId)).Select(c => c.Id).ToListAsync(ct);
        var fromUtc = fromDate;
        var toUtc = toDate.AddDays(1);

        var xpList = await _db.XpTransactions
            .Where(x => characterIds.Contains(x.CharacterId) && x.CreatedAt >= fromUtc && x.CreatedAt < toUtc)
            .Select(x => new { x.CreatedAt, x.Amount })
            .ToListAsync(ct);
        var xpByDay = xpList
            .GroupBy(x => x.CreatedAt.Date)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));

        var completedQuests = await _db.Quests
            .Where(q => q.AssigneeId != null && memberIds.Contains(q.AssigneeId.Value) && q.CompletedAt >= fromUtc && q.CompletedAt < toUtc)
            .Select(q => q.CompletedAt!.Value)
            .ToListAsync(ct);
        var questsByDay = completedQuests
            .GroupBy(d => d.Date)
            .ToDictionary(g => g.Key, g => g.Count());

        var result = new List<TeamKpiPointDto>();
        for (var d = fromDate; d <= toDate; d = d.AddDays(1))
            result.Add(new TeamKpiPointDto(d, xpByDay.GetValueOrDefault(d, 0), questsByDay.GetValueOrDefault(d, 0)));
        return result;
    }
}
