using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication;
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
        options.Events.OnTicketReceived = async context =>
        {
            var email = context.Principal?.FindFirst(ClaimTypes.Email)?.Value
                ?? context.Principal?.FindFirst("email")?.Value;
            var name = context.Principal?.FindFirst(ClaimTypes.Name)?.Value
                ?? context.Principal?.FindFirst("name")?.Value;
            var picture = context.Principal?.FindFirst("urn:google:picture")?.Value
                ?? context.Principal?.FindFirst("picture")?.Value;
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
builder.Services.AddScoped<ICharacterService, CharacterService>();
builder.Services.AddScoped<ICharacterXpService, CharacterXpService>();
builder.Services.AddScoped<IAchievementService, AchievementService>();
builder.Services.AddScoped<ISkillTreeService, SkillTreeService>();
builder.Services.AddScoped<IActivityFeedService, ActivityFeedService>();
builder.Services.AddScoped<IActivityHub, SignalRActivityHub>();
builder.Services.AddScoped<IBoardHub, SignalRBoardHub>();
builder.Services.AddScoped<ILeaderboardService, LeaderboardService>();
builder.Services.AddScoped<ITeamService, TeamService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IAvatarStorageService, AvatarStorageService>();
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();

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
    await SeedData.EnsureLevelsAsync(db);
    await SeedData.EnsureAchievementsAsync(db);
    await SeedData.EnsureSkillsAsync(db);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<ActivityFeedHub>("/hubs/activity");
app.MapHub<BoardHub>("/hubs/board");

app.Run();
