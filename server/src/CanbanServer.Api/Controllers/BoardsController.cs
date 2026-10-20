using Microsoft.AspNetCore.Mvc;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BoardsController : ControllerBase
{
    private static readonly System.Text.RegularExpressions.Regex PresetAvatar = new("^preset:[a-z0-9-]{1,32}$");
    private static readonly string[] ImageTypes = { "image/jpeg", "image/png", "image/webp", "image/gif" };

    private readonly IBoardService _boardService;
    private readonly IProjectAccessService _access;
    private readonly IAvatarStorageService _avatarStorage;

    public BoardsController(IBoardService boardService, IProjectAccessService access, IAvatarStorageService avatarStorage)
    {
        _boardService = boardService;
        _access = access;
        _avatarStorage = avatarStorage;
    }

    private async Task<bool> CanManageAsync(Guid boardId, Guid userId, CancellationToken ct)
    {
        var access = await _access.GetBoardAccessAsync(boardId, userId, ct);
        return access.Status == ProjectAccessStatus.Success && access.Permission >= BoardPermission.Manage;
    }

    private async Task<ActionResult<BoardDto>> ReplaceAvatarAsync(Guid boardId, string? avatarUrl, CancellationToken ct)
    {
        var result = await _boardService.SetAvatarAsync(boardId, avatarUrl, ct);
        if (result == null) return NotFound();
        var previous = result.Value.Previous;
        if (previous != null && previous != avatarUrl && !previous.StartsWith("preset:", StringComparison.Ordinal))
            await _avatarStorage.DeleteByUrlAsync(previous, ct);
        return Ok(result.Value.Board);
    }

    /// <summary>Choose a built-in avatar ("preset:&lt;name&gt;") or reset to the default (null).</summary>
    [HttpPut("{id:guid}/avatar")]
    public async Task<ActionResult<BoardDto>> SetAvatar(Guid id, [FromBody] SetBoardAvatarRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        if (!await CanManageAsync(id, userId.Value, ct)) return Forbid();
        var value = string.IsNullOrWhiteSpace(request.AvatarUrl) ? null : request.AvatarUrl.Trim();
        if (value != null && !PresetAvatar.IsMatch(value)) return BadRequest("Выберите аватар из списка или загрузите изображение.");
        return await ReplaceAvatarAsync(id, value, ct);
    }

    [HttpPost("{id:guid}/avatar")]
    public async Task<ActionResult<BoardDto>> UploadAvatar(Guid id, IFormFile? file, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        if (!await CanManageAsync(id, userId.Value, ct)) return Forbid();
        if (file == null || file.Length == 0) return BadRequest("Выберите файл изображения.");
        if (file.Length > 2 * 1024 * 1024) return BadRequest("Размер файла не должен превышать 2 МБ.");
        var contentType = file.ContentType?.ToLowerInvariant() ?? "";
        if (!ImageTypes.Contains(contentType)) return BadRequest("Допустимые форматы: JPEG, PNG, WebP, GIF.");
        var url = await _avatarStorage.UploadAsync(id, file.OpenReadStream(), contentType, file.FileName, ct);
        if (string.IsNullOrEmpty(url)) return StatusCode(500, "Не удалось загрузить файл в хранилище. Проверьте настройки S3.");
        return await ReplaceAvatarAsync(id, url, ct);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<BoardDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        var access = await _access.GetBoardAccessAsync(id, userId.Value, ct); if (access.Status != ProjectAccessStatus.Success) return Forbid();
        var board = await _boardService.GetByIdAsync(id, ct);
        return board == null ? NotFound() : Ok(board);
    }

    [HttpGet("templates")]
    public ActionResult<object> Templates() => Ok(new
    {
        categories = SpaceTemplates.Categories.Select(c => new { id = c.Id, title = c.Title }),
        templates = SpaceTemplates.All.Select(t => new
        {
            id = t.Id,
            category = t.Category,
            icon = t.Icon,
            title = t.Title,
            description = t.Description,
            bestFor = t.BestFor,
            issueTypes = t.IssueTypes,
            columns = t.Columns.Select(c => new { title = c.Title, kind = c.Kind }),
            features = t.Features,
            createsSprint = t.CreatesSprint,
            featured = t.Featured,
        }),
    });

    [HttpGet("team/{teamId:guid}")]
    public async Task<ActionResult<List<BoardDto>>> GetByTeam(Guid teamId, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        var access = await _access.GetTeamAccessAsync(teamId, userId.Value, ct); if (access.Status != ProjectAccessStatus.Success) return Forbid();
        var list = await _boardService.GetByTeamIdAsync(teamId, ct);
        return Ok(list);
    }

    [HttpPost]
    public async Task<ActionResult<BoardDto>> Create([FromBody] CreateBoardRequest request, CancellationToken ct)
    {
        var createdByUserId = User.GetUserId();
        if (!createdByUserId.HasValue) return Unauthorized();
        var access = await _access.GetTeamAccessAsync(request.TeamId, createdByUserId.Value, ct);
        if (access.Status != ProjectAccessStatus.Success || access.Permission < BoardPermission.Manage) return Forbid();
        if (request.CopySettingsFromBoardId is Guid sourceId)
        {
            var source = await _access.GetBoardAccessAsync(sourceId, createdByUserId.Value, ct);
            if (source.Status != ProjectAccessStatus.Success) return Forbid();
        }
        var board = await _boardService.CreateAsync(request, createdByUserId, ct);
        return CreatedAtAction(nameof(Get), new { id = board.Id }, board);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<BoardDto>> Update(Guid id, [FromBody] UpdateBoardRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        var access = await _access.GetBoardAccessAsync(id, userId.Value, ct);
        if (access.Status != ProjectAccessStatus.Success || access.Permission < BoardPermission.Manage) return Forbid();
        var board = await _boardService.UpdateAsync(id, request, ct);
        return board == null ? NotFound() : Ok(board);
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        var currentUserId = User.GetUserId();
        var result = await _boardService.DeleteAsync(id, currentUserId, ct);
        if (result == null) return NotFound();
        if (result == false) return Forbid();
        return NoContent();
    }
}
