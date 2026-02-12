using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[AllowAnonymous]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService) => _authService = authService;

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register([FromBody] RegisterRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest("Email и пароль обязательны.");
        if (request.Password.Length < 6)
            return BadRequest("Пароль должен быть не короче 6 символов.");

        try
        {
            var response = await _authService.RegisterAsync(request, ct);
            return Ok(response);
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("уже зарегистрирован"))
        {
            return Conflict(ex.Message);
        }
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var response = await _authService.LoginAsync(request, ct);
        return response == null ? Unauthorized("Неверный email или пароль.") : Ok(response);
    }
}
