using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public record UserGroupRequest(Guid TeamId, string? Name, string? Description);
public record UserGroupMembersRequest(List<Guid> UserIds);

/// <summary>Named sets of team members, used by group pickers and schemes.</summary>
public class UserGroupService
{
    private const int MaxGroupsPerTeam = 200;
    private const int MaxMembersPerGroup = 1000;

    private readonly CanbanDbContext _db;
    private readonly IProjectAccessService _access;

    public UserGroupService(CanbanDbContext db, IProjectAccessService access)
    {
        _db = db;
        _access = access;
    }

    public async Task<object> ListAsync(Guid userId, Guid teamId, CancellationToken ct)
    {
        var canManage = await AccessAsync(teamId, userId, ct);
        var groups = await _db.UserGroups.AsNoTracking().Where(g => g.TeamId == teamId).OrderBy(g => g.Name)
            .Select(g => new { g.Id, g.Name, g.Description, g.CreatedAt, Members = g.Members.Select(m => m.UserId).ToList() })
            .ToListAsync(ct);
        var userIds = groups.SelectMany(g => g.Members).Distinct().ToList();
        var users = await _db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.Email }).ToDictionaryAsync(u => u.Id, ct);
        return new
        {
            teamId,
            canManage,
            groups = groups.Select(g => new
            {
                id = g.Id,
                name = g.Name,
                description = g.Description,
                createdAt = g.CreatedAt,
                members = g.Members.Where(users.ContainsKey).Select(id => new { userId = id, displayName = users[id].DisplayName, email = users[id].Email })
                    .OrderBy(m => m.displayName),
            }),
        };
    }

    public async Task<object> CreateAsync(Guid userId, UserGroupRequest request, CancellationToken ct)
    {
        await EnsureAdminAsync(request.TeamId, userId, ct);
        if (await _db.UserGroups.CountAsync(g => g.TeamId == request.TeamId, ct) >= MaxGroupsPerTeam)
            throw new InvalidOperationException("Достигнут предел групп в команде");
        var group = new UserGroup { Id = Guid.NewGuid(), TeamId = request.TeamId, CreatedAt = DateTime.UtcNow };
        await ApplyAsync(group, request, ct);
        _db.UserGroups.Add(group);
        await _db.SaveChangesAsync(ct);
        return Dto(group, 0);
    }

    public async Task<object> UpdateAsync(Guid id, Guid userId, UserGroupRequest request, CancellationToken ct)
    {
        var group = await FindAsync(id, ct);
        await EnsureAdminAsync(group.TeamId, userId, ct);
        await ApplyAsync(group, request, ct);
        await _db.SaveChangesAsync(ct);
        return Dto(group, await _db.UserGroupMembers.CountAsync(m => m.GroupId == id, ct));
    }

    public async Task DeleteAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var group = await FindAsync(id, ct);
        await EnsureAdminAsync(group.TeamId, userId, ct);
        _db.UserGroups.Remove(group);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<object> SetMembersAsync(Guid id, Guid userId, List<Guid> userIds, CancellationToken ct)
    {
        var group = await FindAsync(id, ct);
        await EnsureAdminAsync(group.TeamId, userId, ct);
        var wanted = userIds.Distinct().ToList();
        if (wanted.Count > MaxMembersPerGroup) throw new ArgumentException($"В группе может быть не больше {MaxMembersPerGroup} участников");
        var teamUsers = await _db.Teams.Where(t => t.Id == group.TeamId)
            .Select(t => t.Members.Select(m => m.UserId).Append(t.OwnerId ?? Guid.Empty)).FirstAsync(ct);
        if (wanted.Except(teamUsers).Any()) throw new ArgumentException("Пользователь не состоит в команде");
        var current = await _db.UserGroupMembers.Where(m => m.GroupId == id).ToListAsync(ct);
        _db.UserGroupMembers.RemoveRange(current.Where(m => !wanted.Contains(m.UserId)));
        var now = DateTime.UtcNow;
        foreach (var add in wanted.Except(current.Select(m => m.UserId)))
            _db.UserGroupMembers.Add(new UserGroupMember { GroupId = id, UserId = add, AddedAt = now });
        await _db.SaveChangesAsync(ct);
        return Dto(group, wanted.Count);
    }

    private async Task ApplyAsync(UserGroup group, UserGroupRequest request, CancellationToken ct)
    {
        if (request.Name != null)
        {
            var name = request.Name.Trim();
            if (name.Length == 0) throw new ArgumentException("Введите название группы");
            if (name.Length > 100) throw new ArgumentException("Название группы — не больше 100 символов");
            var taken = await _db.UserGroups.Where(g => g.TeamId == group.TeamId && g.Id != group.Id).Select(g => g.Name).ToListAsync(ct);
            if (taken.Contains(name, StringComparer.OrdinalIgnoreCase)) throw new ArgumentException($"Группа «{name}» уже есть");
            group.Name = name;
        }
        else if (group.Name.Length == 0) throw new ArgumentException("Введите название группы");
        if (request.Description != null)
        {
            var description = request.Description.Trim();
            group.Description = description.Length == 0 ? null : description.Length > 500 ? description[..500] : description;
        }
    }

    private async Task<UserGroup> FindAsync(Guid id, CancellationToken ct) =>
        await _db.UserGroups.FirstOrDefaultAsync(g => g.Id == id, ct) ?? throw new KeyNotFoundException("Group not found");

    /// <summary>Any team member may see groups; returns whether the user can change them.</summary>
    private async Task<bool> AccessAsync(Guid teamId, Guid userId, CancellationToken ct)
    {
        var (status, permission) = await _access.GetTeamAccessAsync(teamId, userId, ct);
        if (status == ProjectAccessStatus.NotFound) throw new KeyNotFoundException("Team not found");
        if (status != ProjectAccessStatus.Success) throw new UnauthorizedAccessException("Нет доступа к команде");
        return permission == BoardPermission.Admin;
    }

    private async Task EnsureAdminAsync(Guid teamId, Guid userId, CancellationToken ct)
    {
        if (!await AccessAsync(teamId, userId, ct))
            throw new UnauthorizedAccessException("Управлять группами может только владелец или администратор команды");
    }

    private static object Dto(UserGroup g, int memberCount) => new
    {
        id = g.Id,
        teamId = g.TeamId,
        name = g.Name,
        description = g.Description,
        createdAt = g.CreatedAt,
        memberCount,
    };
}
