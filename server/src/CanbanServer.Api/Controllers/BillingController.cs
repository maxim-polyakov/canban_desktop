using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

public record ChangeBillingPlanRequest(string Plan, string? Cycle);

[ApiController]
[Authorize]
[Route("api/billing")]
public class BillingController : ControllerBase
{
    private readonly BillingService _billing;

    public BillingController(BillingService billing) => _billing = billing;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet]
    public async Task<ActionResult> Get(CancellationToken ct) => Ok(await _billing.GetAsync(Me, ct));

    [HttpGet("quote")]
    public async Task<ActionResult> Quote([FromQuery] string plan, [FromQuery] string? cycle, CancellationToken ct) =>
        Ok(await _billing.QuoteAsync(Me, plan, cycle ?? "monthly", ct));

    [HttpPut("plan")]
    public async Task<ActionResult> Change([FromBody] ChangeBillingPlanRequest request, CancellationToken ct) =>
        Ok(await _billing.ChangeAsync(Me, request.Plan, request.Cycle ?? "monthly", ct));
}
