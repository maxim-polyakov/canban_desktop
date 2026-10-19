using CanbanServer.Domain.Entities;

namespace CanbanServer.Application.Contracts;

public enum ProjectAccessStatus { Success, NotFound, Forbidden }

public interface IProjectAccessService
{
    Task<(ProjectAccessStatus Status, BoardPermission? Permission)> GetBoardAccessAsync(Guid boardId, Guid userId, CancellationToken ct = default);
    Task<(ProjectAccessStatus Status, BoardPermission? Permission)> GetQuestAccessAsync(Guid questId, Guid userId, CancellationToken ct = default);
    Task<(ProjectAccessStatus Status, BoardPermission? Permission)> GetTeamAccessAsync(Guid teamId, Guid userId, CancellationToken ct = default);
    Task EnsureBoardPermissionAsync(Guid boardId, Guid userId, BoardPermission required, CancellationToken ct = default);
    Task EnsureQuestPermissionAsync(Guid questId, Guid userId, BoardPermission required, CancellationToken ct = default);
    BoardPermission MapRole(TeamRole? role, bool isOwner);
}
