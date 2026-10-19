using System.Text;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.DTOs;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/assets")]
public class AssetsController : ControllerBase
{
    private readonly AssetService _assets;

    public AssetsController(AssetService assets) => _assets = assets;

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    [HttpGet("schemas")]
    public async Task<ActionResult> GetSchemas(CancellationToken ct) => Ok(await _assets.GetSchemasAsync(Me, ct));

    [HttpPost("schemas")]
    public async Task<ActionResult> CreateSchema([FromBody] CreateAssetSchemaRequest request, CancellationToken ct) =>
        Ok(await _assets.CreateSchemaAsync(Me, request, ct));

    [HttpGet("schemas/{id:guid}")]
    public async Task<ActionResult> GetSchema(Guid id, CancellationToken ct) => Ok(await _assets.GetSchemaAsync(id, Me, ct));

    [HttpPut("schemas/{id:guid}")]
    public async Task<ActionResult> UpdateSchema(Guid id, [FromBody] UpdateAssetSchemaRequest request, CancellationToken ct) =>
        Ok(await _assets.UpdateSchemaAsync(id, Me, request, ct));

    [HttpDelete("schemas/{id:guid}")]
    public async Task<ActionResult> DeleteSchema(Guid id, CancellationToken ct)
    {
        await _assets.DeleteSchemaAsync(id, Me, ct);
        return NoContent();
    }

    [HttpPost("schemas/{id:guid}/types")]
    public async Task<ActionResult> CreateType(Guid id, [FromBody] UpsertAssetObjectTypeRequest request, CancellationToken ct) =>
        Ok(new { id = await _assets.CreateTypeAsync(id, Me, request, ct) });

    [HttpPut("types/{id:guid}")]
    public async Task<ActionResult> UpdateType(Guid id, [FromBody] UpsertAssetObjectTypeRequest request, CancellationToken ct)
    {
        await _assets.UpdateTypeAsync(id, Me, request, ct);
        return NoContent();
    }

    [HttpDelete("types/{id:guid}")]
    public async Task<ActionResult> DeleteType(Guid id, CancellationToken ct)
    {
        await _assets.DeleteTypeAsync(id, Me, ct);
        return NoContent();
    }

    [HttpPost("types/{id:guid}/attributes")]
    public async Task<ActionResult> CreateAttribute(Guid id, [FromBody] UpsertAssetAttributeRequest request, CancellationToken ct) =>
        Ok(new { id = await _assets.CreateAttributeAsync(id, Me, request, ct) });

    [HttpPut("attributes/{id:guid}")]
    public async Task<ActionResult> UpdateAttribute(Guid id, [FromBody] UpsertAssetAttributeRequest request, CancellationToken ct)
    {
        await _assets.UpdateAttributeAsync(id, Me, request, ct);
        return NoContent();
    }

    [HttpDelete("attributes/{id:guid}")]
    public async Task<ActionResult> DeleteAttribute(Guid id, CancellationToken ct)
    {
        await _assets.DeleteAttributeAsync(id, Me, ct);
        return NoContent();
    }

    [HttpPost("types/{id:guid}/import")]
    public async Task<ActionResult> Import(Guid id, [FromBody] ImportAssetsRequest request, CancellationToken ct) =>
        Ok(await _assets.ImportAsync(id, Me, request.Content ?? "", ct));

    [HttpGet("types/{id:guid}/export")]
    public async Task<ActionResult> Export(Guid id, CancellationToken ct)
    {
        var (fileName, content) = await _assets.ExportAsync(id, Me, ct);
        return File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(content)).ToArray(), "text/csv; charset=utf-8", fileName);
    }

    [HttpGet("objects")]
    public async Task<ActionResult> Search(
        [FromQuery] string? aql, [FromQuery] Guid? schemaId, [FromQuery] Guid? typeId,
        [FromQuery] bool includeChildren = false, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default) =>
        Ok(await _assets.SearchAsync(Me, aql, schemaId, typeId, includeChildren, page, pageSize, ct));

    [HttpPost("objects")]
    public async Task<ActionResult> CreateObject([FromBody] SaveAssetObjectRequest request, CancellationToken ct) =>
        Ok(await _assets.CreateObjectAsync(Me, request, ct));

    [HttpGet("objects/{id:guid}")]
    public async Task<ActionResult> GetObject(Guid id, CancellationToken ct) => Ok(await _assets.GetObjectAsync(id, Me, ct));

    [HttpPut("objects/{id:guid}")]
    public async Task<ActionResult> UpdateObject(Guid id, [FromBody] SaveAssetObjectRequest request, CancellationToken ct) =>
        Ok(await _assets.UpdateObjectAsync(id, Me, request, ct));

    [HttpDelete("objects/{id:guid}")]
    public async Task<ActionResult> DeleteObject(Guid id, CancellationToken ct)
    {
        await _assets.DeleteObjectAsync(id, Me, ct);
        return NoContent();
    }

    [HttpGet("objects/{id:guid}/graph")]
    public async Task<ActionResult> Graph(Guid id, [FromQuery] int depth = 2, CancellationToken ct = default) =>
        Ok(await _assets.GetGraphAsync(id, Me, depth, ct));

    [HttpPost("objects/{id:guid}/issues")]
    public async Task<ActionResult> LinkIssue(Guid id, [FromBody] LinkAssetIssueRequest request, CancellationToken ct) =>
        Ok(await _assets.LinkIssueAsync(id, Me, request, ct));

    [HttpDelete("objects/{id:guid}/issues/{questId:guid}")]
    public async Task<ActionResult> UnlinkIssue(Guid id, Guid questId, CancellationToken ct)
    {
        await _assets.UnlinkIssueAsync(id, questId, Me, ct);
        return NoContent();
    }

    [HttpGet("quests/{questId:guid}")]
    public async Task<ActionResult> QuestAssets(Guid questId, CancellationToken ct) => Ok(await _assets.GetQuestAssetsAsync(questId, Me, ct));
}
