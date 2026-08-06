using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

public class TeamService : ITeamService
{
    private readonly CanbanDbContext _db;
    private readonly IAchievementService _achievementService;
    private readonly IQuestAttachmentService _attachmentService;

    public TeamService(
        CanbanDbContext db,
        IAchievementService achievementService,
        IQuestAttachmentService attachmentService)
    {
        _db = db;
        _achievementService = achievementService;
        _attachmentService = attachmentService;
    }

    public async Task<TeamDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var t = await _db.Teams
            .Include(x => x.Members.OrderBy(m => m.JoinedAt))
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t == null) return null;
        var ownerId = t.OwnerId ?? t.Members.FirstOrDefault(m => m.Role == TeamRole.Admin)?.UserId;
        return new TeamDto(t.Id, t.Name, t.Description, t.CreatedAt, ownerId);
    }

    public async Task<List<TeamWithBoardsDto>> GetMyTeamsWithBoardsAsync(Guid userId, CancellationToken ct = default)
    {
        var teamIds = await _db.TeamMembers.Where(m => m.UserId == userId).Select(m => m.TeamId).ToListAsync(ct);
        var teams = await _db.Teams
            .Include(t => t.Members.OrderBy(m => m.JoinedAt))
            .Where(t => teamIds.Contains(t.Id))
            .OrderBy(t => t.Name)
            .ToListAsync(ct);
        var boardsByTeam = await _db.Boards.Where(b => teamIds.Contains(b.TeamId)).OrderBy(b => b.Order).ToListAsync(ct);
        var boardsGrouped = boardsByTeam.GroupBy(b => b.TeamId).ToDictionary(g => g.Key, g => g.ToList());
        return teams.Select(t =>
        {
            var ownerId = t.OwnerId ?? t.Members.FirstOrDefault(m => m.Role == TeamRole.Admin)?.UserId;
            return new TeamWithBoardsDto(
                new TeamDto(t.Id, t.Name, t.Description, t.CreatedAt, ownerId),
                (boardsGrouped.GetValueOrDefault(t.Id) ?? new List<Board>()).Select(b => new BoardDto(b.Id, b.TeamId, b.Name, b.Description, b.Order, b.CreatedAt, b.CreatedByUserId)).OrderBy(b => b.Order).ToList()
            );
        }).ToList();
    }

    public async Task<List<TeamMemberDto>> GetMembersAsync(Guid teamId, CancellationToken ct = default)
    {
        var list = await _db.TeamMembers.Include(m => m.User).Where(m => m.TeamId == teamId).ToListAsync(ct);
        return list.Select(m => new TeamMemberDto(m.UserId, m.User.DisplayName, m.User.Email, m.User.AvatarUrl, m.Role.ToString(), m.JoinedAt)).ToList();
    }

    public async Task<TeamDto> CreateAsync(CreateTeamRequest request, Guid ownerId, CancellationToken ct = default)
    {
        var team = new Team
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Description = request.Description,
            CreatedAt = DateTime.UtcNow,
            OwnerId = ownerId
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
        return new TeamDto(team.Id, team.Name, team.Description, team.CreatedAt, team.OwnerId);
    }

    public async Task<TeamDto?> UpdateAsync(Guid id, UpdateTeamRequest request, CancellationToken ct = default)
    {
        var t = await _db.Teams.Include(x => x.Members.OrderBy(m => m.JoinedAt)).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (t == null) return null;
        if (request.Name != null) t.Name = request.Name;
        if (request.Description != null) t.Description = request.Description;
        await _db.SaveChangesAsync(ct);
        var ownerId = t.OwnerId ?? t.Members.FirstOrDefault(m => m.Role == TeamRole.Admin)?.UserId;
        return new TeamDto(t.Id, t.Name, t.Description, t.CreatedAt, ownerId);
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

    public async Task<bool?> RemoveMemberAsync(Guid teamId, Guid userId, Guid? requestedByUserId, CancellationToken ct = default)
    {
        var m = await _db.TeamMembers.FirstOrDefaultAsync(x => x.TeamId == teamId && x.UserId == userId, ct);
        if (m == null) return null;
        var team = await _db.Teams.FirstOrDefaultAsync(t => t.Id == teamId, ct);
        if (team == null) return null;
        var ownerId = team.OwnerId ?? await _db.TeamMembers.Where(x => x.TeamId == teamId && x.Role == TeamRole.Admin).Select(x => (Guid?)x.UserId).FirstOrDefaultAsync(ct);
        if (!requestedByUserId.HasValue || ownerId != requestedByUserId.Value)
            return false;
        _db.TeamMembers.Remove(m);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> LeaveTeamAsync(Guid teamId, Guid userId, CancellationToken ct = default)
    {
        var m = await _db.TeamMembers.FirstOrDefaultAsync(x => x.TeamId == teamId && x.UserId == userId, ct);
        if (m == null) return false;
        var team = await _db.Teams
            .Include(t => t.Members.OrderBy(mem => mem.JoinedAt))
            .FirstOrDefaultAsync(t => t.Id == teamId, ct);
        if (team == null) return false;
        var wasOwner = (team.OwnerId == userId) || (team.OwnerId == null && team.Members.FirstOrDefault(mem => mem.Role == TeamRole.Admin)?.UserId == userId);
        _db.TeamMembers.Remove(m);
        if (wasOwner)
        {
            var nextOwner = team.Members.Where(mem => mem.UserId != userId).FirstOrDefault(mem => mem.Role == TeamRole.Admin)?.UserId
                ?? team.Members.Where(mem => mem.UserId != userId).FirstOrDefault()?.UserId;
            team.OwnerId = nextOwner;
        }
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool?> InviteByEmailAsync(Guid teamId, string email, Guid inviterUserId, CancellationToken ct = default)
    {
        var normalized = email?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(normalized)) return null;
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.Email != null && u.Email.Trim().ToLower() == normalized, ct);
        if (user == null) return null;
        if (await _db.TeamMembers.AnyAsync(m => m.TeamId == teamId && m.UserId == user.Id, ct))
            return false;
        if (await _db.TeamInvites.AnyAsync(i => i.TeamId == teamId && i.InvitedUserId == user.Id, ct))
            return false;
        _db.TeamInvites.Add(new TeamInvite
        {
            Id = Guid.NewGuid(),
            TeamId = teamId,
            InvitedUserId = user.Id,
            InvitedByUserId = inviterUserId,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<List<TeamInviteDto>> GetPendingInvitesForUserAsync(Guid userId, CancellationToken ct = default)
    {
        var invites = await _db.TeamInvites
            .Include(i => i.Team)
            .Include(i => i.InvitedByUser)
            .Where(i => i.InvitedUserId == userId)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync(ct);
        return invites.Select(i => new TeamInviteDto(
            i.Id, i.TeamId, i.Team.Name, i.InvitedByUserId, i.InvitedByUser.DisplayName, i.CreatedAt)).ToList();
    }

    public async Task<bool?> AcceptInviteAsync(Guid inviteId, Guid userId, CancellationToken ct = default)
    {
        var invite = await _db.TeamInvites
            .Include(i => i.Team)
            .FirstOrDefaultAsync(i => i.Id == inviteId, ct);
        if (invite == null) return null;
        if (invite.InvitedUserId != userId) return false;
        if (await _db.TeamMembers.AnyAsync(m => m.TeamId == invite.TeamId && m.UserId == userId, ct))
        {
            _db.TeamInvites.Remove(invite);
            await _db.SaveChangesAsync(ct);
            return true;
        }
        _db.TeamMembers.Add(new TeamMember
        {
            Id = Guid.NewGuid(),
            TeamId = invite.TeamId,
            UserId = userId,
            Role = TeamRole.Member,
            JoinedAt = DateTime.UtcNow,
            InvitedByUserId = invite.InvitedByUserId
        });
        _db.TeamInvites.Remove(invite);
        await _db.SaveChangesAsync(ct);
        await _achievementService.TryGrantAchievementsForUserAsync(invite.InvitedByUserId, ct);
        return true;
    }

    public async Task<bool> DeclineInviteAsync(Guid inviteId, Guid userId, CancellationToken ct = default)
    {
        var invite = await _db.TeamInvites.FirstOrDefaultAsync(i => i.Id == inviteId, ct);
        if (invite == null) return false;
        if (invite.InvitedUserId != userId) return false;
        _db.TeamInvites.Remove(invite);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid teamId, Guid userId, CancellationToken ct = default)
    {
        var team = await _db.Teams
            .Include(t => t.Members.OrderBy(m => m.JoinedAt))
            .FirstOrDefaultAsync(t => t.Id == teamId, ct);
        if (team == null) return false;
        var ownerId = team.OwnerId ?? team.Members.FirstOrDefault(m => m.Role == TeamRole.Admin)?.UserId;
        if (ownerId != userId) return false;

        var members = await _db.TeamMembers.Where(m => m.TeamId == teamId).ToListAsync(ct);
        var teamBoards = await _db.Boards.Where(b => b.TeamId == teamId).ToListAsync(ct);
        var questIds = await _db.Quests
            .Where(q => q.Board.TeamId == teamId)
            .Select(q => q.Id)
            .ToListAsync(ct);
        await _attachmentService.DeleteFilesForQuestIdsAsync(questIds, ct);
        _db.TeamMembers.RemoveRange(members);
        _db.Boards.RemoveRange(teamBoards);
        _db.Teams.Remove(team);
        await _db.SaveChangesAsync(ct);
        return true;
    }
}
