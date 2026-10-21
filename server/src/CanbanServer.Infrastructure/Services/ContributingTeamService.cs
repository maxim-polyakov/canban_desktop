using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public record ContributingTeamsRequest(List<Guid>? TeamIds);

/// <summary>Jira's «Участвующие команды»: teams linked to a space so everyone knows who to ask.</summary>
public class ContributingTeamService
{
    public const int MaxTeams = 20;
    private const int PreviewMembers = 4;

    private readonly CanbanDbContext _db;
    private readonly PermissionSchemeService _permissions;

    public ContributingTeamService(CanbanDbContext db, PermissionSchemeService permissions)
    {
        _db = db;
        _permissions = permissions;
    }

    public async Task<object> GetAsync(Guid boardId, Guid userId, CancellationToken ct)
    {
        await _permissions.EnsureAsync(boardId, userId, JiraPermissions.Browse, ct);
        return new
        {
            canEdit = await _permissions.HasAsync(boardId, userId, JiraPermissions.Administer, ct),
            teams = await DescribeAsync(await LinkedAsync(boardId, ct), ct),
        };
    }

    /// <summary>Teams the user belongs to, as in Jira's team picker; linked ones are excluded by the client.</summary>
    public async Task<object> SearchAsync(Guid boardId, Guid userId, string? query, CancellationToken ct)
    {
        await _permissions.EnsureAsync(boardId, userId, JiraPermissions.Browse, ct);
        var teams = VisibleTeams(userId);
        var needle = query?.Trim().ToLower();
        if (!string.IsNullOrEmpty(needle)) teams = teams.Where(t => t.Name.ToLower().Contains(needle));
        var ids = await teams.OrderBy(t => t.Name).Take(20).Select(t => t.Id).ToListAsync(ct);
        return new { teams = await DescribeAsync(ids, ct) };
    }

    public async Task<object> SetAsync(Guid boardId, Guid userId, List<Guid>? teamIds, CancellationToken ct)
    {
        await _permissions.EnsureAsync(boardId, userId, JiraPermissions.Administer, ct);
        var wanted = (teamIds ?? new List<Guid>()).Distinct().ToList();
        if (wanted.Count > MaxTeams) throw new ArgumentException($"К разделу можно привязать не больше {MaxTeams} команд.");
        var current = await _db.BoardContributingTeams.Where(x => x.BoardId == boardId).ToListAsync(ct);
        var linked = current.Select(x => x.TeamId).ToHashSet();
        var added = wanted.Where(id => !linked.Contains(id)).ToList();
        if (added.Count > 0)
        {
            var visible = await VisibleTeams(userId).Where(t => added.Contains(t.Id)).Select(t => t.Id).ToListAsync(ct);
            if (visible.Count != added.Count) throw new ArgumentException("Команда не найдена или вы в ней не состоите.");
        }

        _db.BoardContributingTeams.RemoveRange(current.Where(x => !wanted.Contains(x.TeamId)));
        var now = DateTime.UtcNow;
        for (var i = 0; i < added.Count; i++)
            _db.BoardContributingTeams.Add(new BoardContributingTeam { BoardId = boardId, TeamId = added[i], AddedAt = now.AddTicks(i) });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(boardId, userId, ct);
    }

    private IQueryable<Team> VisibleTeams(Guid userId) =>
        _db.Teams.AsNoTracking().Where(t => t.OwnerId == userId || t.Members.Any(m => m.UserId == userId));

    private Task<List<Guid>> LinkedAsync(Guid boardId, CancellationToken ct) =>
        _db.BoardContributingTeams.AsNoTracking().Where(x => x.BoardId == boardId).OrderBy(x => x.AddedAt).Select(x => x.TeamId).ToListAsync(ct);

    private async Task<List<object>> DescribeAsync(List<Guid> ids, CancellationToken ct)
    {
        if (ids.Count == 0) return new List<object>();
        var teams = await _db.Teams.AsNoTracking().Where(t => ids.Contains(t.Id))
            .Select(t => new
            {
                t.Id,
                t.Name,
                t.Description,
                t.OwnerId,
                Members = t.Members.Select(m => m.UserId).ToList(),
            })
            .ToDictionaryAsync(t => t.Id, ct);
        var people = teams.Values.ToDictionary(t => t.Id, t => (t.OwnerId.HasValue ? t.Members.Prepend(t.OwnerId.Value) : t.Members).Distinct().ToList());
        var previewIds = people.Values.SelectMany(p => p.Take(PreviewMembers)).Distinct().ToList();
        var users = await _db.Users.AsNoTracking().Where(u => previewIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.AvatarUrl }).ToDictionaryAsync(u => u.Id, ct);
        return ids.Where(teams.ContainsKey).Select(id => (object)new
        {
            id,
            name = teams[id].Name,
            description = teams[id].Description,
            memberCount = people[id].Count,
            members = people[id].Take(PreviewMembers).Where(users.ContainsKey)
                .Select(u => new { userId = u, displayName = users[u].DisplayName, avatarUrl = users[u].AvatarUrl }),
        }).ToList();
    }
}
