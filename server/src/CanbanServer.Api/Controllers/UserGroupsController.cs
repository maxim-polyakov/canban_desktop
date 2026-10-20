using CanbanServer.Api.Auditing;
using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/groups")]
public class UserGroupsController : ControllerBase
{
    private readonly UserGroupService _groups;

    public UserGroupsController(UserGroupService groups) => _groups = groups;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet]
    public async Task<ActionResult> List([FromQuery] Guid teamId, CancellationToken ct) => Ok(await _groups.ListAsync(Me, teamId, ct));

    [Audit("group.create", AuditTarget.Body, ObjectType = "group")]
    [HttpPost]
    public async Task<ActionResult> Create([FromBody] UserGroupRequest request, CancellationToken ct) =>
        Ok(await _groups.CreateAsync(Me, request, ct));

    [Audit("group.update", AuditTarget.UserGroup)]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult> Update(Guid id, [FromBody] UserGroupRequest request, CancellationToken ct) =>
        Ok(await _groups.UpdateAsync(id, Me, request, ct));

    [Audit("group.members", AuditTarget.UserGroup)]
    [HttpPut("{id:guid}/members")]
    public async Task<ActionResult> SetMembers(Guid id, [FromBody] UserGroupMembersRequest request, CancellationToken ct) =>
        Ok(await _groups.SetMembersAsync(id, Me, request.UserIds ?? new(), ct));

    [Audit("group.delete", AuditTarget.UserGroup)]
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _groups.DeleteAsync(id, Me, ct);
        return NoContent();
    }
}
