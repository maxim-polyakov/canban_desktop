using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

public class TeamService : ITeamService
{
    private readonly CanbanDbContext _db;

    public TeamService(CanbanDbContext db) => _db = db;

    public async Task<TeamDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var t = await _db.Teams.FirstOrDefaultAsync(x => x.Id == id, ct);
        return t == null ? null : new TeamDto(t.Id, t.Name, t.Description, t.CreatedAt);
    }

    public async Task<List<TeamMemberDto>> GetMembersAsync(Guid teamId, CancellationToken ct = default)
    {
        var list = await _db.TeamMembers.Include(m => m.User).Where(m => m.TeamId == teamId).ToListAsync(ct);
        return list.Select(m => new TeamMemberDto(m.UserId, m.User.DisplayName, m.User.AvatarUrl, m.Role.ToString(), m.JoinedAt)).ToList();
    }

    public async Task<TeamDto> CreateAsync(CreateTeamRequest request, Guid ownerId, CancellationToken ct = default)
    {
        var team = new Team
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Description = request.Description,
            CreatedAt = DateTime.UtcNow
        };
        _db.Teams.Add(team);
        _db.TeamMembers.Add(new TeamMember
        {
            Id = Guid.NewGuid(),
            TeamId = team.Id,
            UserId = ownerId,
            Role = TeamRole.Admin,
            JoinedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(ct);
        return new TeamDto(team.Id, team.Name, team.Description, team.CreatedAt);
    }

    public async Task<TeamDto?> UpdateAsync(Guid id, UpdateTeamRequest request, CancellationToken ct = default)
    {
        var t = await _db.Teams.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t == null) return null;
        if (request.Name != null) t.Name = request.Name;
        if (request.Description != null) t.Description = request.Description;
        await _db.SaveChangesAsync(ct);
        return new TeamDto(t.Id, t.Name, t.Description, t.CreatedAt);
    }

    public async Task<bool> AddMemberAsync(Guid teamId, Guid userId, CancellationToken ct = default)
    {
        if (await _db.TeamMembers.AnyAsync(m => m.TeamId == teamId && m.UserId == userId, ct)) return false;
        _db.TeamMembers.Add(new TeamMember
        {
            Id = Guid.NewGuid(),
            TeamId = teamId,
            UserId = userId,
            Role = TeamRole.Member,
            JoinedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> RemoveMemberAsync(Guid teamId, Guid userId, CancellationToken ct = default)
    {
        var m = await _db.TeamMembers.FirstOrDefaultAsync(x => x.TeamId == teamId && x.UserId == userId, ct);
        if (m == null) return false;
        _db.TeamMembers.Remove(m);
        await _db.SaveChangesAsync(ct);
        return true;
    }
}
