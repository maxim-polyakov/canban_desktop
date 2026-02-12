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

    public LeaderboardService(CanbanDbContext db) => _db = db;

    public async Task<List<LeaderboardEntryDto>> GetTeamLeaderboardAsync(TeamLeaderboardRequest request, CancellationToken ct = default)
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
}
