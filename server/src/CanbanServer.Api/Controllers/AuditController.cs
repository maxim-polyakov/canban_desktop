using System.Text;
using CanbanServer.Api.Auditing;
using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/audit")]
public class AuditController : ControllerBase
{
    private readonly AuditLogService _audit;

    public AuditController(AuditLogService audit) => _audit = audit;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet]
    public async Task<ActionResult> List(
        [FromQuery] Guid? teamId, [FromQuery] string? category, [FromQuery] Guid? actorId, [FromQuery] string? search,
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int page = 1, [FromQuery] int pageSize = 50,
        CancellationToken ct = default) =>
        Ok(await _audit.ListAsync(Me, new AuditQuery(teamId, category, actorId, search, from, to, page, pageSize), ct));

    [HttpGet("export")]
    public async Task<ActionResult> Export(
        [FromQuery] Guid? teamId, [FromQuery] string? category, [FromQuery] Guid? actorId, [FromQuery] string? search,
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct = default)
    {
        var csv = await _audit.ExportCsvAsync(Me, new AuditQuery(teamId, category, actorId, search, from, to), ct);
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv)).ToArray();
        return File(bytes, "text/csv; charset=utf-8", $"audit-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
    }

    [HttpGet("settings/{teamId:guid}")]
    public async Task<ActionResult> Settings(Guid teamId, CancellationToken ct) => Ok(await _audit.GetSettingsAsync(Me, teamId, ct));

    [HttpPut("settings/{teamId:guid}")]
    [Audit("audit.retention", AuditTarget.Team, "teamId", ObjectType = "auditsettings", ObjectKey = "teamId")]
    public async Task<ActionResult> SaveSettings(Guid teamId, [FromBody] AuditSettingsRequest request, CancellationToken ct) =>
        Ok(await _audit.SetRetentionAsync(Me, teamId, request.RetentionDays, ct));
}

public sealed record AuditSettingsRequest(int RetentionDays);
