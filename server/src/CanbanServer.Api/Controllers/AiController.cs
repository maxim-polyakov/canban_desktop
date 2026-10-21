using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

public sealed record AiLanguageRequest(string? Language = null);

[ApiController]
[Authorize]
[Route("api/ai")]
public class AiController : ControllerBase
{
    private readonly AiService _ai;

    public AiController(AiService ai) => _ai = ai;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet("status")]
    public ActionResult Status() => Ok(new { enabled = _ai.IsEnabled });

    [HttpPost("quests/{questId:guid}/summary")]
    public async Task<ActionResult> Summary(Guid questId, [FromBody] AiLanguageRequest? request, CancellationToken ct) =>
        Ok(new { text = await _ai.SummarizeIssueAsync(questId, Me, request?.Language, ct) });

    [HttpPost("description")]
    public async Task<ActionResult> Description([FromBody] AiDescriptionRequest request, CancellationToken ct) =>
        Ok(new { text = await _ai.DraftDescriptionAsync(request, Me, ct) });

    [HttpPost("jql")]
    public async Task<ActionResult> Jql([FromBody] AiJqlRequest request, CancellationToken ct) =>
        Ok(await _ai.ToJqlAsync(request, Me, ct));
}
