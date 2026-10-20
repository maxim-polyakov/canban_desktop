using CanbanServer.Api.Extensions;
using CanbanServer.Application.DTOs;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/home")]
public class HomeController : ControllerBase
{
    private readonly HomeService _home;

    public HomeController(HomeService home) => _home = home;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet("updates")]
    public async Task<ActionResult> Feed([FromQuery] string? kind, [FromQuery] string? scope, CancellationToken ct) =>
        Ok(await _home.FeedAsync(Me, kind, scope, ct));

    [HttpGet("tags")]
    public async Task<ActionResult> Tags(CancellationToken ct) => Ok(await _home.TagsAsync(Me, ct));

    [HttpGet("{kind:regex(^(projects|goals)$)}")]
    public async Task<ActionResult> List(string kind, [FromQuery] bool archived, CancellationToken ct) =>
        Ok(await _home.ListAsync(kind, Me, archived, ct));

    [HttpPost("{kind:regex(^(projects|goals)$)}")]
    public async Task<ActionResult> Create(string kind, [FromBody] CreateHomeItemRequest request, CancellationToken ct) =>
        Ok(await _home.CreateAsync(kind, Me, request, ct));

    [HttpGet("items/{id:guid}")]
    public async Task<ActionResult> Get(Guid id, CancellationToken ct) => Ok(await _home.GetAsync(id, Me, ct));

    [HttpPut("items/{id:guid}")]
    public async Task<ActionResult> Update(Guid id, [FromBody] UpdateHomeItemRequest request, CancellationToken ct) =>
        Ok(await _home.UpdateAsync(id, Me, request, ct));

    [HttpDelete("items/{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct) { await _home.DeleteAsync(id, Me, ct); return NoContent(); }

    [HttpPost("items/{id:guid}/archive")]
    public async Task<ActionResult> Archive(Guid id, [FromBody] HomeArchiveRequest request, CancellationToken ct) =>
        Ok(await _home.ArchiveAsync(id, Me, request.Archived, ct));

    [HttpPost("items/{id:guid}/follow")]
    public async Task<ActionResult> Follow(Guid id, CancellationToken ct) { await _home.FollowAsync(id, Me, true, ct); return NoContent(); }

    [HttpDelete("items/{id:guid}/follow")]
    public async Task<ActionResult> Unfollow(Guid id, CancellationToken ct) { await _home.FollowAsync(id, Me, false, ct); return NoContent(); }

    [HttpPost("items/{id:guid}/followers")]
    public async Task<ActionResult> AddFollower(Guid id, [FromBody] HomeMemberRequest request, CancellationToken ct)
    { await _home.SetFollowerAsync(id, Me, request.UserId, true, ct); return NoContent(); }

    [HttpDelete("items/{id:guid}/followers/{userId:guid}")]
    public async Task<ActionResult> RemoveFollower(Guid id, Guid userId, CancellationToken ct)
    { await _home.SetFollowerAsync(id, Me, userId, false, ct); return NoContent(); }

    [HttpPost("items/{id:guid}/star")]
    public async Task<ActionResult> Star(Guid id, CancellationToken ct) { await _home.StarAsync(id, Me, true, ct); return NoContent(); }

    [HttpDelete("items/{id:guid}/star")]
    public async Task<ActionResult> Unstar(Guid id, CancellationToken ct) { await _home.StarAsync(id, Me, false, ct); return NoContent(); }

    [HttpPost("items/{id:guid}/clone")]
    public async Task<ActionResult> Clone(Guid id, CancellationToken ct) => Ok(await _home.CloneAsync(id, Me, ct));

    [HttpPost("items/{id:guid}/entries")]
    public async Task<ActionResult> AddEntry(Guid id, [FromBody] HomeEntryRequest request, CancellationToken ct) =>
        Ok(await _home.AddEntryAsync(id, Me, request, ct));

    [HttpPut("items/{id:guid}/entries/{entryId:guid}")]
    public async Task<ActionResult> UpdateEntry(Guid id, Guid entryId, [FromBody] UpdateHomeEntryRequest request, CancellationToken ct) =>
        Ok(await _home.UpdateEntryAsync(id, Me, entryId, request, ct));

    [HttpDelete("items/{id:guid}/entries/{entryId:guid}")]
    public async Task<ActionResult> DeleteEntry(Guid id, Guid entryId, CancellationToken ct)
    { await _home.DeleteEntryAsync(id, Me, entryId, ct); return NoContent(); }

    [HttpPost("items/{id:guid}/contributors")]
    public async Task<ActionResult> AddContributor(Guid id, [FromBody] HomeMemberRequest request, CancellationToken ct)
    { await _home.AddContributorAsync(id, Me, request.UserId, ct); return NoContent(); }

    [HttpDelete("items/{id:guid}/contributors/{userId:guid}")]
    public async Task<ActionResult> RemoveContributor(Guid id, Guid userId, CancellationToken ct)
    { await _home.RemoveContributorAsync(id, Me, userId, ct); return NoContent(); }

    [HttpPost("items/{id:guid}/links")]
    public async Task<ActionResult> Link(Guid id, [FromBody] HomeLinkRequest request, CancellationToken ct)
    { await _home.LinkAsync(id, Me, request.TargetId, true, ct); return NoContent(); }

    [HttpDelete("items/{id:guid}/links/{targetId:guid}")]
    public async Task<ActionResult> Unlink(Guid id, Guid targetId, CancellationToken ct)
    { await _home.LinkAsync(id, Me, targetId, false, ct); return NoContent(); }

    [HttpPost("items/{id:guid}/work")]
    public async Task<ActionResult> AddWork(Guid id, [FromBody] HomeWorkRequest request, CancellationToken ct) =>
        Ok(await _home.AddWorkAsync(id, Me, request, ct));

    [HttpDelete("items/{id:guid}/work/{questId:guid}")]
    public async Task<ActionResult> RemoveWork(Guid id, Guid questId, CancellationToken ct)
    { await _home.RemoveWorkAsync(id, Me, questId, ct); return NoContent(); }

    [HttpPost("items/{id:guid}/updates")]
    public async Task<ActionResult> AddUpdate(Guid id, [FromBody] HomeStatusUpdateRequest request, CancellationToken ct) =>
        Ok(await _home.AddUpdateAsync(id, Me, request, ct));

    [HttpDelete("items/{id:guid}/updates/{updateId:guid}")]
    public async Task<ActionResult> DeleteUpdate(Guid id, Guid updateId, CancellationToken ct)
    { await _home.DeleteUpdateAsync(id, Me, updateId, ct); return NoContent(); }
}
