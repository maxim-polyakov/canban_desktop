using Microsoft.AspNetCore.Mvc;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CharactersController : ControllerBase
{
    private readonly ICharacterService _characterService;

    public CharactersController(ICharacterService characterService) => _characterService = characterService;

    [HttpGet("me")]
    public async Task<ActionResult<CharacterDto>> GetMy(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var character = await _characterService.GetByUserIdAsync(userId.Value, ct);
        return character == null ? NotFound() : Ok(character);
    }

    [HttpGet("user/{userId:guid}")]
    public async Task<ActionResult<CharacterDto>> GetByUser(Guid userId, CancellationToken ct)
    {
        var character = await _characterService.GetByUserIdAsync(userId, ct);
        return character == null ? NotFound() : Ok(character);
    }

    [HttpGet("levels")]
    public async Task<ActionResult<List<LevelDto>>> GetLevels(CancellationToken ct)
    {
        var list = await _characterService.GetAllLevelsAsync(ct);
        return Ok(list);
    }

    [HttpGet("me/xp-history")]
    public async Task<ActionResult<List<XpTransactionDto>>> GetMyXpHistory([FromQuery] int limit = 50, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var list = await _characterService.GetXpHistoryAsync(userId.Value, limit, ct);
        return Ok(list);
    }

}
