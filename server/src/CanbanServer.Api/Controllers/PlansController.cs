using CanbanServer.Api.Extensions;
using CanbanServer.Application.DTOs;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/plans")]
public class PlansController : ControllerBase
{
    private readonly PlanService _plans;

    public PlansController(PlanService plans) => _plans = plans;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet]
    public async Task<ActionResult> List(CancellationToken ct) => Ok(await _plans.ListAsync(Me, ct));

    [HttpPost]
    public async Task<ActionResult> Create([FromBody] CreatePlanRequest request, CancellationToken ct) => Ok(await _plans.CreateAsync(Me, request, ct));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult> Get(Guid id, CancellationToken ct) => Ok(await _plans.GetAsync(id, Me, ct));

    [HttpPut("{id:guid}")]
    public async Task<ActionResult> Update(Guid id, [FromBody] UpdatePlanRequest request, CancellationToken ct) => Ok(await _plans.UpdateAsync(id, Me, request, ct));

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct) { await _plans.DeleteAsync(id, Me, ct); return NoContent(); }

    [HttpGet("{id:guid}/timeline")]
    public async Task<ActionResult> Timeline(Guid id, [FromQuery] Guid? scenarioId, CancellationToken ct) => Ok(await _plans.TimelineAsync(id, scenarioId, Me, ct));

    [HttpPost("{id:guid}/teams")]
    public async Task<ActionResult> AddTeam(Guid id, [FromBody] PlanTeamRequest request, CancellationToken ct) => Ok(await _plans.AddTeamAsync(id, Me, request, ct));

    [HttpPut("{id:guid}/teams/{teamId:guid}")]
    public async Task<ActionResult> UpdateTeam(Guid id, Guid teamId, [FromBody] PlanTeamRequest request, CancellationToken ct) =>
        Ok(await _plans.UpdateTeamAsync(id, teamId, Me, request, ct));

    [HttpDelete("{id:guid}/teams/{teamId:guid}")]
    public async Task<ActionResult> DeleteTeam(Guid id, Guid teamId, CancellationToken ct) { await _plans.DeleteTeamAsync(id, teamId, Me, ct); return NoContent(); }

    [HttpPost("{id:guid}/scenarios")]
    public async Task<ActionResult> AddScenario(Guid id, [FromBody] PlanScenarioRequest request, CancellationToken ct) => Ok(await _plans.AddScenarioAsync(id, Me, request, ct));

    [HttpPut("{id:guid}/scenarios/{scenarioId:guid}")]
    public async Task<ActionResult> UpdateScenario(Guid id, Guid scenarioId, [FromBody] PlanScenarioRequest request, CancellationToken ct) =>
        Ok(await _plans.UpdateScenarioAsync(id, scenarioId, Me, request, ct));

    [HttpDelete("{id:guid}/scenarios/{scenarioId:guid}")]
    public async Task<ActionResult> DeleteScenario(Guid id, Guid scenarioId, CancellationToken ct) { await _plans.DeleteScenarioAsync(id, scenarioId, Me, ct); return NoContent(); }

    [HttpPost("{id:guid}/scenarios/{scenarioId:guid}/apply")]
    public async Task<ActionResult> Apply(Guid id, Guid scenarioId, CancellationToken ct) => Ok(await _plans.ApplyScenarioAsync(id, scenarioId, Me, ct));

    [HttpPut("{id:guid}/scenarios/{scenarioId:guid}/items/{questId:guid}")]
    public async Task<ActionResult> Schedule(Guid id, Guid scenarioId, Guid questId, [FromBody] PlanScheduleRequest request, CancellationToken ct) =>
        Ok(await _plans.ScheduleAsync(id, scenarioId, questId, Me, request, ct));

    [HttpDelete("{id:guid}/scenarios/{scenarioId:guid}/items/{questId:guid}")]
    public async Task<ActionResult> ResetSchedule(Guid id, Guid scenarioId, Guid questId, CancellationToken ct)
    {
        await _plans.ResetScheduleAsync(id, scenarioId, questId, Me, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/exclusions")]
    public async Task<ActionResult> Exclude(Guid id, [FromBody] PlanExclusionRequest request, CancellationToken ct)
    {
        await _plans.AddExclusionAsync(id, request.QuestId, Me, ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}/exclusions/{questId:guid}")]
    public async Task<ActionResult> Include(Guid id, Guid questId, CancellationToken ct)
    {
        await _plans.RemoveExclusionAsync(id, questId, Me, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/dependencies")]
    public async Task<ActionResult> AddDependency(Guid id, [FromBody] PlanDependencyRequest request, CancellationToken ct) =>
        Ok(await _plans.AddDependencyAsync(id, Me, request, ct));

    [HttpDelete("{id:guid}/dependencies/{linkId:guid}")]
    public async Task<ActionResult> RemoveDependency(Guid id, Guid linkId, CancellationToken ct)
    {
        await _plans.RemoveDependencyAsync(id, linkId, Me, ct);
        return NoContent();
    }
}
