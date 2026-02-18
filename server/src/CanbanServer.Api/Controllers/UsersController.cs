using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly IAuthService _authService;

    public UsersController(IAuthService authService) => _authService = authService;

    /// <summary>Список всех пользователей (почта, имя) для страницы участников сайта.</summary>
    [HttpGet]
    public async Task<ActionResult<List<UserDto>>> GetAll(CancellationToken ct)
    {
        var list = await _authService.GetAllUsersAsync(ct);
        return Ok(list);
    }

    /// <summary>Публичные данные пользователя для отображения профиля (имя, аватар). Без email.</summary>
    [HttpGet("{userId:guid}")]
    public async Task<ActionResult<PublicUserDto>> GetPublic(Guid userId, CancellationToken ct)
    {
        var user = await _authService.GetPublicUserAsync(userId, ct);
        return user == null ? NotFound() : Ok(user);
    }
}
