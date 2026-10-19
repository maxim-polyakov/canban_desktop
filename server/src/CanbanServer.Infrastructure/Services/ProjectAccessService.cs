using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public class ProjectAccessService : IProjectAccessService
{
    private readonly CanbanDbContext _db;

    public ProjectAccessService(CanbanDbContext db) => _db = db;

    public BoardPermission MapRole(TeamRole? role, bool isOwner)
    {
        if (isOwner) return BoardPermission.Admin;
        return role switch
        {
            TeamRole.Admin => BoardPermission.Admin,
            TeamRole.Lead => BoardPermission.Manage,
            TeamRole.Member => BoardPermission.Work,
            TeamRole.Viewer => BoardPermission.View,
            _ => BoardPermission.View
        };
    }

    private static bool HasAtLeast(BoardPermission actual, BoardPermission required) =>
        (int)actual >= (int)required;

    public async Task<(ProjectAccessStatus Status, BoardPermission? Permission)> GetTeamAccessAsync(
        Guid teamId, Guid userId, CancellationToken ct = default)
    {
        var team = await _db.Teams.AsNoTracking().FirstOrDefaultAsync(t => t.Id == teamId, ct);
        if (team == null) return (ProjectAccessStatus.NotFound, null);
        var member = await _db.TeamMembers.AsNoTracking()
            .FirstOrDefaultAsync(m => m.TeamId == teamId && m.UserId == userId, ct);
        var isOwner = team.OwnerId == userId;
        if (!isOwner && member == null) return (ProjectAccessStatus.Forbidden, null);
        return (ProjectAccessStatus.Success, MapRole(member?.Role, isOwner));
    }

    public async Task<(ProjectAccessStatus Status, BoardPermission? Permission)> GetBoardAccessAsync(
        Guid boardId, Guid userId, CancellationToken ct = default)
    {
        var teamId = await _db.Boards.AsNoTracking()
            .Where(b => b.Id == boardId)
            .Select(b => (Guid?)b.TeamId)
            .FirstOrDefaultAsync(ct);
        if (!teamId.HasValue) return (ProjectAccessStatus.NotFound, null);
        return await GetTeamAccessAsync(teamId.Value, userId, ct);
    }

    public async Task<(ProjectAccessStatus Status, BoardPermission? Permission)> GetQuestAccessAsync(
        Guid questId, Guid userId, CancellationToken ct = default)
    {
        var boardId = await _db.Quests.AsNoTracking()
            .Where(q => q.Id == questId)
            .Select(q => (Guid?)q.BoardId)
            .FirstOrDefaultAsync(ct);
        if (!boardId.HasValue) return (ProjectAccessStatus.NotFound, null);
        return await GetBoardAccessAsync(boardId.Value, userId, ct);
    }

    public async Task EnsureBoardPermissionAsync(Guid boardId, Guid userId, BoardPermission required, CancellationToken ct = default)
    {
        var (status, permission) = await GetBoardAccessAsync(boardId, userId, ct);
        if (status == ProjectAccessStatus.NotFound) throw new KeyNotFoundException("Board not found");
        if (status != ProjectAccessStatus.Success || permission == null || !HasAtLeast(permission.Value, required))
            throw new UnauthorizedAccessException("Insufficient board permission");
    }

    public async Task EnsureQuestPermissionAsync(Guid questId, Guid userId, BoardPermission required, CancellationToken ct = default)
    {
        var (status, permission) = await GetQuestAccessAsync(questId, userId, ct);
        if (status == ProjectAccessStatus.NotFound) throw new KeyNotFoundException("Quest not found");
        if (status != ProjectAccessStatus.Success || permission == null || !HasAtLeast(permission.Value, required))
            throw new UnauthorizedAccessException("Insufficient quest permission");
    }
}
