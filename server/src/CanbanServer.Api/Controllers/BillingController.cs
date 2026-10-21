using System.Text.Json;
using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

public record ChangeBillingPlanRequest(string Plan, string? Cycle);
public record AutoRenewRequest(bool Enabled);

[ApiController]
[Authorize]
[Route("api/billing")]
public class BillingController : ControllerBase
{
    private readonly BillingService _billing;
    private readonly PlanAccessService _plans;
    private readonly ILogger<BillingController> _logger;

    public BillingController(BillingService billing, PlanAccessService plans, ILogger<BillingController> logger)
    {
        _billing = billing;
        _plans = plans;
        _logger = logger;
    }

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet]
    public async Task<ActionResult> Get(CancellationToken ct) => Ok(await _billing.GetAsync(Me, ct));

    /// <summary>Best plan available to the user through any of their teams.</summary>
    [HttpGet("access")]
    public async Task<ActionResult> Access(CancellationToken ct) => Ok(new { plan = await _plans.PlanForUserAsync(Me, ct) });

    [HttpGet("quote")]
    public async Task<ActionResult> Quote([FromQuery] string plan, [FromQuery] string? cycle, CancellationToken ct) =>
        Ok(await _billing.QuoteAsync(Me, plan, cycle ?? "monthly", ct));

    [HttpPut("plan")]
    public async Task<ActionResult> Change([FromBody] ChangeBillingPlanRequest request, CancellationToken ct) =>
        Ok(await _billing.ChangeAsync(Me, request.Plan, request.Cycle ?? "monthly", ct));

    [HttpGet("payments/{id:guid}")]
    public async Task<ActionResult> Payment(Guid id, CancellationToken ct) => Ok(await _billing.GetPaymentAsync(Me, id, ct));

    [HttpPut("auto-renew")]
    public async Task<ActionResult> AutoRenew([FromBody] AutoRenewRequest request, CancellationToken ct) =>
        Ok(await _billing.SetAutoRenewAsync(Me, request.Enabled, ct));

    /// <summary>YooKassa HTTP notifications (payment.succeeded, payment.canceled).</summary>
    [AllowAnonymous]
    [HttpPost("yookassa/webhook")]
    public async Task<ActionResult> YooKassaWebhook([FromBody] JsonElement body, CancellationToken ct)
    {
        var id = body.ValueKind == JsonValueKind.Object && body.TryGetProperty("object", out var obj) && obj.ValueKind == JsonValueKind.Object
            && obj.TryGetProperty("id", out var idElement) && idElement.ValueKind == JsonValueKind.String ? idElement.GetString() : null;
        if (id == null || id.Length > 64) return Ok();
        try
        {
            await _billing.HandleNotificationAsync(id, ct);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning("YooKassa notification for {Payment} failed: {Error}", id, ex.Message);
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }
        return Ok();
    }
}
