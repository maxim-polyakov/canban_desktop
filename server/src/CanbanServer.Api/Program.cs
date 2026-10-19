using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using CanbanServer.Infrastructure.Data;
using CanbanServer.Application.Contracts;
using CanbanServer.Infrastructure.Services;
using CanbanServer.Infrastructure.Hubs;
using Microsoft.EntityFrameworkCore;
using DotNetEnv;

// Загружаем .env из папки с API (если файл есть) — переменные переопределяют appsettings
Env.TraversePath().Load();

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddControllers(options => options.Filters.Add(new Microsoft.AspNetCore.Mvc.Authorization.AuthorizeFilter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Description = "JWT: Bearer {token}",
        Name = "Authorization",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.ApiKey
    });
    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        { new Microsoft.OpenApi.Models.OpenApiSecurityScheme { Reference = new Microsoft.OpenApi.Models.OpenApiReference { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" } }, Array.Empty<string>() }
    });
});

var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key не задан.");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddCookie("External")
    .AddGoogle(options =>
    {
        options.ClientId = builder.Configuration["Google:ClientId"] ?? "";
        options.ClientSecret = builder.Configuration["Google:ClientSecret"] ?? "";
        options.SignInScheme = "External";
        options.ClaimActions.MapJsonKey("urn:google:picture", "picture", "url");
        options.Events.OnTicketReceived = async context =>
        {
            var email = context.Principal?.FindFirst(ClaimTypes.Email)?.Value
                ?? context.Principal?.FindFirst("email")?.Value;
            var name = context.Principal?.FindFirst(ClaimTypes.Name)?.Value
                ?? context.Principal?.FindFirst("name")?.Value;
            var picture = context.Principal?.FindFirst("urn:google:picture")?.Value
                ?? context.Principal?.FindFirst("picture")?.Value
                ?? context.Principal?.FindFirst(ClaimTypes.Uri)?.Value;
            if (string.IsNullOrEmpty(email))
            {
                context.Fail("Email not provided by Google");
                return;
            }
            var authService = context.HttpContext.RequestServices.GetRequiredService<IAuthService>();
            var response = await authService.GoogleLoginOrCreateAsync(email, name ?? email, picture, context.HttpContext.RequestAborted);
            var callbackUrl = builder.Configuration["Auth:FrontendCallbackUrl"] ?? "https://canban.baxic.ru";
            var redirectUrl = callbackUrl.TrimEnd('/') + "/auth/callback#token=" + Uri.EscapeDataString(response.AccessToken);
            context.Response.Redirect(redirectUrl);
            context.HandleResponse();
        };
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };
        options.Events = new Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var token = context.Request.Query["access_token"].FirstOrDefault()
                    ?? context.Request.Headers["Authorization"].FirstOrDefault()?.Replace("Bearer ", "", StringComparison.OrdinalIgnoreCase);
                if (!string.IsNullOrEmpty(token))
                    context.Token = token;
                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization();

// Entity Framework Core + PostgreSQL (провайдер Npgsql)
builder.Services.AddDbContext<CanbanDbContext>(options =>
{
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"));
});

builder.Services.AddSignalR();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var origins = (builder.Configuration["Cors:AllowedOrigins"] ?? "https://canban.baxic.ru")
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (origins.Length > 0)
        {
            policy.WithOrigins(origins)
                .AllowCredentials()
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
        else
        {
            policy.AllowAnyOrigin()
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
    });
});

// Application & Infrastructure services
builder.Services.AddScoped<IBoardService, BoardService>();
builder.Services.AddScoped<IColumnService, ColumnService>();
builder.Services.AddScoped<IQuestService, QuestService>();
builder.Services.AddScoped<IQuestAttachmentService, QuestAttachmentService>();
builder.Services.AddScoped<IQuestNotificationService, QuestNotificationService>();
builder.Services.AddScoped<IQuestCollaborationService, QuestCollaborationService>();
builder.Services.AddScoped<ICharacterService, CharacterService>();
builder.Services.AddScoped<ICharacterXpService, CharacterXpService>();
builder.Services.AddScoped<IAchievementService, AchievementService>();
builder.Services.AddScoped<ISkillTreeService, SkillTreeService>();
builder.Services.AddScoped<IActivityFeedService, ActivityFeedService>();
builder.Services.AddScoped<IActivityHub, SignalRActivityHub>();
builder.Services.AddScoped<IBoardHub, SignalRBoardHub>();
builder.Services.AddScoped<ILeaderboardService, LeaderboardService>();
builder.Services.AddScoped<ITeamService, TeamService>();
builder.Services.AddScoped<ISprintService, SprintService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IAvatarStorageService, AvatarStorageService>();
builder.Services.AddScoped<IQuestAttachmentStorageService, QuestAttachmentStorageService>();
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
builder.Services.AddScoped<IProjectAccessService, ProjectAccessService>();
builder.Services.AddScoped<IJiraPlatformService, JiraPlatformService>();
builder.Services.AddScoped<IJqlQueryService, JqlService>();
builder.Services.AddScoped<AssetService>();
builder.Services.AddScoped<PlanService>();
builder.Services.AddScoped<HomeService>();
builder.Services.AddHttpClient("outbox");
builder.Services.AddHttpClient(GitHubAppClient.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddSingleton<IGitHubAppClient, GitHubAppClient>();
builder.Services.AddHostedService<OutboxDispatcher>();

// Redis (IDistributedCache) — подключается, если задан Redis:Configuration
var redisConfig = builder.Configuration["Redis:Configuration"];
if (!string.IsNullOrWhiteSpace(redisConfig))
{
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = redisConfig;
    });
}
else
{
    builder.Services.AddDistributedMemoryCache();
}
builder.Services.AddSingleton<CacheService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CanbanDbContext>();
    await db.Database.EnsureCreatedAsync();
    await DatabaseSchemaInitializer.EnsureQuestAttachmentsSchemaAsync(db);
    await SeedData.EnsureLevelsAsync(db);
    await SeedData.EnsureAchievementsAsync(db);
    await SeedData.EnsureSkillsAsync(db);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseForwardedHeaders();
app.UseCors();
app.Use(async (context, next) =>
{
    try { await next(); }
    catch (KeyNotFoundException ex) { context.Response.StatusCode = StatusCodes.Status404NotFound; await context.Response.WriteAsJsonAsync(new { error = ex.Message }); }
    catch (UnauthorizedAccessException ex) { context.Response.StatusCode = StatusCodes.Status403Forbidden; await context.Response.WriteAsJsonAsync(new { error = ex.Message }); }
    catch (Exception ex) when (ex is ArgumentException or FormatException or InvalidOperationException or System.Text.Json.JsonException)
    { context.Response.StatusCode = StatusCodes.Status400BadRequest; await context.Response.WriteAsJsonAsync(new { error = ex.Message }); }
    catch (Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException ex) when (!context.Response.HasStarted)
    {
        app.Logger.LogWarning(ex, "Concurrency conflict on {Method} {Path}", context.Request.Method, context.Request.Path);
        context.Response.StatusCode = StatusCodes.Status409Conflict;
        await context.Response.WriteAsJsonAsync(new { error = "Данные изменились, обновите страницу." });
    }
    // Without this the 500 is produced after CORS headers are dropped and browsers report "Failed to fetch".
    catch (Exception ex) when (!context.Response.HasStarted && !context.RequestAborted.IsCancellationRequested)
    {
        app.Logger.LogError(ex, "Unhandled exception on {Method} {Path}", context.Request.Method, context.Request.Path);
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new { error = "Внутренняя ошибка сервера." });
    }
});
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<ActivityFeedHub>("/hubs/activity");
app.MapHub<BoardHub>("/hubs/board");

app.Run();
