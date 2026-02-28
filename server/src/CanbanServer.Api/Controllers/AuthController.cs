using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[AllowAnonymous]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IAvatarStorageService _avatarStorage;

    public AuthController(IAuthService authService, IAvatarStorageService avatarStorage)
    {
        _authService = authService;
        _avatarStorage = avatarStorage;
    }

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

    /// <summary>Редирект на Google OAuth. После входа пользователь попадёт на Auth:FrontendCallbackUrl/auth/callback#token=...</summary>
    [HttpGet("google")]
    public IActionResult Google() => Challenge(new AuthenticationProperties { RedirectUri = "/signin-google" }, GoogleDefaults.AuthenticationScheme);

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        try
        {
            var response = await _authService.LoginAsync(request, ct);
            return response == null ? Unauthorized("Неверный email или пароль.") : Ok(response);
        }
        catch (InvalidOperationException ex) when (ex.Message == "EMAIL_NOT_CONFIRMED")
        {
            return StatusCode(403, "Подтвердите адрес почты. Введите код из 6 цифр, отправленный на вашу почту.");
        }
    }

    /// <summary>Подтверждение email по коду из 6 цифр. При успехе возвращает токен и пользователя (автовход).</summary>
    [HttpPost("confirm-email")]
    public async Task<ActionResult<AuthResponse>> ConfirmEmail([FromBody] ConfirmEmailRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest("Укажите email.");
        if (string.IsNullOrWhiteSpace(request.Code))
            return BadRequest("Введите код из письма.");
        var response = await _authService.ConfirmEmailByCodeAsync(request.Email, request.Code, ct);
        return response != null ? Ok(response) : BadRequest("Неверный или устаревший код. Проверьте код и попробуйте снова.");
    }

    /// <summary>Запрос сброса пароля. На email отправляется код из 6 цифр. Всегда 200 (не раскрывать наличие email).</summary>
    [HttpPost("forgot-password")]
    public async Task<ActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest("Укажите email.");
        await _authService.RequestPasswordResetAsync(request.Email.Trim(), ct);
        return Ok(new { message = "Если аккаунт с таким email существует, на него отправлено письмо с кодом." });
    }

    /// <summary>Сброс пароля по коду из письма.</summary>
    [HttpPost("reset-password")]
    public async Task<ActionResult> ResetPassword([FromBody] ResetPasswordRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest("Укажите email.");
        if (string.IsNullOrWhiteSpace(request.Code))
            return BadRequest("Введите код из письма.");
        if (string.IsNullOrWhiteSpace(request.NewPassword))
            return BadRequest("Укажите новый пароль.");
        if (request.NewPassword.Length < 6)
            return BadRequest("Пароль должен быть не короче 6 символов.");
        var ok = await _authService.ResetPasswordAsync(request.Email.Trim(), request.Code.Trim(), request.NewPassword, ct);
        return ok ? Ok(new { message = "Пароль успешно изменён. Войдите с новым паролем." }) : BadRequest("Неверный или устаревший код. Запросите сброс пароля снова.");
    }

    /// <summary>Получить текущего пользователя по JWT. Требуется авторизация.</summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<UserDto>> GetMe(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var user = await _authService.GetUserByIdAsync(userId.Value, ct);
        return user == null ? NotFound() : Ok(user);
    }

    /// <summary>Обновить профиль текущего пользователя (имя и/или аватар). Требуется авторизация.</summary>
    [HttpPatch("me")]
    [Authorize]
    public async Task<ActionResult<UserDto>> UpdateProfile([FromBody] UpdateProfileRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var user = await _authService.UpdateProfileAsync(userId.Value, request, ct);
        return user == null ? NotFound() : Ok(user);
    }

    /// <summary>Загрузить аватар (файл уходит в S3, в профиле сохраняется URL). Требуется авторизация.</summary>
    [HttpPost("me/avatar")]
    [Authorize]
    public async Task<ActionResult<UserDto>> UploadAvatar(IFormFile? file, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        if (file == null || file.Length == 0)
            return BadRequest("Выберите файл изображения.");
        if (file.Length > 2 * 1024 * 1024)
            return BadRequest("Размер файла не должен превышать 2 МБ.");
        var contentType = file.ContentType?.ToLowerInvariant() ?? "";
        if (contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" && contentType != "image/gif")
            return BadRequest("Допустимые форматы: JPEG, PNG, WebP, GIF.");

        var url = await _avatarStorage.UploadAsync(userId.Value, file.OpenReadStream(), file.ContentType ?? "image/jpeg", file.FileName, ct);
        if (string.IsNullOrEmpty(url))
            return StatusCode(500, "Не удалось загрузить файл в хранилище. Проверьте настройки S3.");

        var user = await _authService.UpdateProfileAsync(userId.Value, new UpdateProfileRequest(null, url), ct);
        return user == null ? NotFound() : Ok(user);
    }

    /// <summary>Удалить аватар (из профиля и из S3). Требуется авторизация.</summary>
    [HttpDelete("me/avatar")]
    [Authorize]
    public async Task<ActionResult<UserDto>> DeleteAvatar(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();

        var user = await _authService.GetUserByIdAsync(userId.Value, ct);
        if (user == null) return NotFound();
        var currentAvatarUrl = user.AvatarUrl;

        await _avatarStorage.DeleteByUrlAsync(currentAvatarUrl, ct);
        var updated = await _authService.UpdateProfileAsync(userId.Value, new UpdateProfileRequest(null, ""), ct);
        return updated == null ? NotFound() : Ok(updated);
    }
}
