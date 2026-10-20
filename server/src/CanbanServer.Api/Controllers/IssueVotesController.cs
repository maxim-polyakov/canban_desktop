using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/quests/{questId:guid}/votes")]
public class IssueVotesController : ControllerBase
{
    private readonly IssueVoteService _votes;

    public IssueVotesController(IssueVoteService votes) => _votes = votes;

    private Guid RequireUser() => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet]
    public async Task<ActionResult<IssueVotesDto>> Get(Guid questId, CancellationToken ct) =>
        Ok(await _votes.GetAsync(questId, RequireUser(), ct));

    [HttpPost]
    public async Task<ActionResult<IssueVotesDto>> Vote(Guid questId, CancellationToken ct) =>
        Ok(await _votes.SetAsync(questId, RequireUser(), true, ct));

    [HttpDelete]
    public async Task<ActionResult<IssueVotesDto>> Unvote(Guid questId, CancellationToken ct) =>
        Ok(await _votes.SetAsync(questId, RequireUser(), false, ct));
}
