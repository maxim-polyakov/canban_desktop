using Microsoft.AspNetCore.Mvc;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TeamsController : ControllerBase
{
    private static readonly System.Text.RegularExpressions.Regex PresetAvatar = new("^preset:[a-z0-9-]{1,32}$");
    private static readonly string[] ImageTypes = { "image/jpeg", "image/png", "image/webp", "image/gif" };

    private readonly ITeamService _teamService;
    private readonly IAvatarStorageService _avatarStorage;

    public TeamsController(ITeamService teamService, IAvatarStorageService avatarStorage)
    {
        _teamService = teamService;
        _avatarStorage = avatarStorage;
    }

    private async Task<ActionResult?> EnsureCanManageAsync(Guid teamId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var allowed = await _teamService.CanManageAsync(teamId, userId.Value, ct);
        if (allowed == null) return NotFound();
        return allowed == true ? null : Forbid();
    }

    private async Task ReplaceAvatarAsync(Guid teamId, string? avatarUrl, CancellationToken ct)
    {
        var previous = await _teamService.SetAvatarAsync(teamId, avatarUrl, ct);
        if (previous != null && previous != avatarUrl && !previous.StartsWith("preset:", StringComparison.Ordinal))
            await _avatarStorage.DeleteByUrlAsync(previous, ct);
    }

    /// <summary>Choose a built-in avatar ("preset:&lt;name&gt;") or reset to the default (null).</summary>
    [HttpPut("{teamId:guid}/avatar")]
    public async Task<ActionResult<TeamDto>> SetAvatar(Guid teamId, [FromBody] SetTeamAvatarRequest request, CancellationToken ct)
    {
        if (await EnsureCanManageAsync(teamId, ct) is { } denied) return denied;
        var value = string.IsNullOrWhiteSpace(request.AvatarUrl) ? null : request.AvatarUrl.Trim();
        if (value != null && !PresetAvatar.IsMatch(value)) return BadRequest("Выберите аватар из списка или загрузите изображение.");
        await ReplaceAvatarAsync(teamId, value, ct);
        return Ok(await _teamService.GetByIdAsync(teamId, ct));
    }

    [HttpPost("{teamId:guid}/avatar")]
    public async Task<ActionResult<TeamDto>> UploadAvatar(Guid teamId, IFormFile? file, CancellationToken ct)
    {
        if (await EnsureCanManageAsync(teamId, ct) is { } denied) return denied;
        if (file == null || file.Length == 0) return BadRequest("Выберите файл изображения.");
        if (file.Length > 2 * 1024 * 1024) return BadRequest("Размер файла не должен превышать 2 МБ.");
        var contentType = file.ContentType?.ToLowerInvariant() ?? "";
        if (!ImageTypes.Contains(contentType)) return BadRequest("Допустимые форматы: JPEG, PNG, WebP, GIF.");
        var url = await _avatarStorage.UploadAsync(teamId, file.OpenReadStream(), contentType, file.FileName, ct);
        if (string.IsNullOrEmpty(url)) return StatusCode(500, "Не удалось загрузить файл в хранилище. Проверьте настройки S3.");
        await ReplaceAvatarAsync(teamId, url, ct);
        return Ok(await _teamService.GetByIdAsync(teamId, ct));
    }

    [HttpGet("my")]
    public async Task<ActionResult<List<TeamWithBoardsDto>>> GetMyTeamsWithBoards(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var list = await _teamService.GetMyTeamsWithBoardsAsync(userId.Value, ct);
        return Ok(list);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<TeamDto>> Get(Guid id, CancellationToken ct)
    {
        var team = await _teamService.GetByIdAsync(id, ct);
        return team == null ? NotFound() : Ok(team);
    }

    [HttpGet("{teamId:guid}/members")]
    public async Task<ActionResult<List<TeamMemberDto>>> GetMembers(Guid teamId, CancellationToken ct)
    {
        var list = await _teamService.GetMembersAsync(teamId, ct);
        return Ok(list);
    }

    [HttpPost]
    public async Task<ActionResult<TeamDto>> Create([FromBody] CreateTeamRequest request, CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (!ownerId.HasValue) return Unauthorized();
        var team = await _teamService.CreateAsync(request, ownerId.Value, ct);
        return CreatedAtAction(nameof(Get), new { id = team.Id }, team);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<TeamDto>> Update(Guid id, [FromBody] UpdateTeamRequest request, CancellationToken ct)
    {
        var team = await _teamService.UpdateAsync(id, request, ct);
        return team == null ? NotFound() : Ok(team);
    }

    [HttpPost("{teamId:guid}/members/{userId:guid}")]
    public async Task<ActionResult> AddMember(Guid teamId, Guid userId, [FromQuery] TeamRole? role, CancellationToken ct)
    {
        var added = await _teamService.AddMemberAsync(teamId, userId, ct);
        if (role.HasValue)
        {
            var result = await _teamService.SetMemberRoleAsync(teamId, userId, role.Value, User.GetUserId(), ct);
            if (result == null) return NotFound();
            if (result == false) return Forbid();
            return NoContent();
        }
        return added ? NoContent() : BadRequest();
    }

    [HttpPut("{teamId:guid}/members/{userId:guid}/role")]
    public async Task<ActionResult> SetMemberRole(Guid teamId, Guid userId, [FromBody] SetTeamMemberRoleRequest request, CancellationToken ct)
    {
        var result = await _teamService.SetMemberRoleAsync(teamId, userId, request.Role, User.GetUserId(), ct);
        if (result == null) return NotFound();
        if (result == false) return Forbid();
        return NoContent();
    }

    /// <summary>Отправить приглашение в команду по email. Приглашённый увидит его и сможет принять или отклонить.</summary>
    [HttpPost("{teamId:guid}/members/invite")]
    public async Task<ActionResult> InviteByEmail(Guid teamId, [FromBody] InviteMemberRequest? request, CancellationToken ct)
    {
        var inviterId = User.GetUserId();
        if (!inviterId.HasValue) return Unauthorized();
        if (request?.UserId is Guid userId)
        {
            var byId = await _teamService.InviteUserAsync(teamId, userId, inviterId.Value, ct);
            if (byId == null) return NotFound("Пользователь не найден.");
            if (byId == false) return BadRequest("Пользователь уже в команде или приглашение уже отправлено.");
            return NoContent();
        }
        if (request == null || string.IsNullOrWhiteSpace(request.Email))
            return BadRequest("Укажите email.");
        var result = await _teamService.InviteByEmailAsync(teamId, request.Email.Trim(), inviterId.Value, ct);
        if (result == null) return NotFound("Пользователь с таким email не найден.");
        if (result == false) return BadRequest("Пользователь уже в команде или приглашение уже отправлено.");
        return NoContent();
    }

    /// <summary>Список приглашений в команды для текущего пользователя.</summary>
    [HttpGet("invites/my")]
    public async Task<ActionResult<List<TeamInviteDto>>> GetMyInvites(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var list = await _teamService.GetPendingInvitesForUserAsync(userId.Value, ct);
        return Ok(list);
    }

    /// <summary>Принять приглашение в команду.</summary>
    [HttpPost("invites/{inviteId:guid}/accept")]
    public async Task<ActionResult> AcceptInvite(Guid inviteId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var result = await _teamService.AcceptInviteAsync(inviteId, userId.Value, ct);
        if (result == null) return NotFound();
        if (result == false) return Forbid();
        return NoContent();
    }

    /// <summary>Отклонить приглашение в команду.</summary>
    [HttpPost("invites/{inviteId:guid}/decline")]
    public async Task<ActionResult> DeclineInvite(Guid inviteId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var declined = await _teamService.DeclineInviteAsync(inviteId, userId.Value, ct);
        return declined ? NoContent() : NotFound();
    }

    [HttpDelete("{teamId:guid}/members/{userId:guid}")]
    public async Task<ActionResult> RemoveMember(Guid teamId, Guid userId, CancellationToken ct)
    {
        var currentUserId = User.GetUserId();
        var result = await _teamService.RemoveMemberAsync(teamId, userId, currentUserId, ct);
        if (result == null) return NotFound();
        if (result == false) return Forbid();
        return NoContent();
    }

    /// <summary>Выйти из команды (текущий пользователь исключает себя).</summary>
    [HttpPost("{teamId:guid}/leave")]
    public async Task<ActionResult> Leave(Guid teamId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var left = await _teamService.LeaveTeamAsync(teamId, userId.Value, ct);
        return left ? NoContent() : NotFound();
    }

    /// <summary>Удалить команду. Доступно только создателю команды.</summary>
    [HttpDelete("{teamId:guid}")]
    public async Task<ActionResult> Delete(Guid teamId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var deleted = await _teamService.DeleteAsync(teamId, userId.Value, ct);
        return deleted ? NoContent() : NotFound();
    }
}
