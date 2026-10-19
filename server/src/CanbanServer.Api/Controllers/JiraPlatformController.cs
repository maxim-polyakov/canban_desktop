using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api")]
public class JiraPlatformController : ControllerBase
{
    private readonly IJiraPlatformService _jira;
    private readonly IJqlQueryService _jql;
    private readonly IProjectAccessService _access;
    private readonly CanbanDbContext _db;
    private readonly IQuestService _quests;

    public JiraPlatformController(
        IJiraPlatformService jira,
        IJqlQueryService jql,
        IProjectAccessService access,
        CanbanDbContext db,
        IQuestService quests)
    {
        _jira = jira;
        _jql = jql;
        _access = access;
        _db = db;
        _quests = quests;
    }

    private Guid RequireUser() => User.GetUserId() ?? throw new UnauthorizedAccessException();

    private async Task EnsureBoardAsync(Guid boardId, BoardPermission required, CancellationToken ct) =>
        await _access.EnsureBoardPermissionAsync(boardId, RequireUser(), required, ct);

    private async Task EnsureQuestAsync(Guid questId, BoardPermission required, CancellationToken ct) =>
        await _access.EnsureQuestPermissionAsync(questId, RequireUser(), required, ct);

    [HttpGet("workflows/board/{boardId:guid}")]
    public async Task<ActionResult> GetWorkflows(Guid boardId, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.View, ct);
        return Ok(await _jira.GetTransitionsAsync(boardId, ct));
    }

    [HttpPut("workflows/board/{boardId:guid}")]
    public async Task<ActionResult> SaveWorkflow(Guid boardId, [FromBody] UpsertWorkflowTransitionRequest request, [FromQuery] Guid? id, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Manage, ct);
        return Ok(await _jira.SaveTransitionAsync(boardId, id, request, ct));
    }

    [HttpDelete("workflows/board/{boardId:guid}/{id:guid}")]
    public async Task<ActionResult> DeleteWorkflow(Guid boardId, Guid id, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Manage, ct);
        return await _jira.DeleteTransitionAsync(boardId, id, ct) ? NoContent() : NotFound();
    }

    [HttpGet("workflows/quests/{questId:guid}/transitions")]
    public async Task<ActionResult> GetQuestTransitions(Guid questId, CancellationToken ct)
    {
        await EnsureQuestAsync(questId, BoardPermission.View, ct);
        var quest = await _db.Quests.AsNoTracking().FirstAsync(q => q.Id == questId, ct);
        var transitions = await _jira.GetTransitionsAsync(quest.BoardId, ct);
        return Ok(transitions.Where(t => t.Enabled && t.SourceColumnId == quest.ColumnId).ToList());
    }

    public record ExecuteTransitionRequest(Guid TransitionId);

    [HttpPost("workflows/quests/{questId:guid}/transitions")]
    public async Task<ActionResult> ExecuteQuestTransition(Guid questId, [FromBody] ExecuteTransitionRequest request, CancellationToken ct)
    {
        await EnsureQuestAsync(questId, BoardPermission.Work, ct);
        var quest = await _db.Quests.AsNoTracking().FirstAsync(q => q.Id == questId, ct);
        var transition = (await _jira.GetTransitionsAsync(quest.BoardId, ct))
            .FirstOrDefault(t => t.Id == request.TransitionId && t.Enabled && t.SourceColumnId == quest.ColumnId)
            ?? throw new ArgumentException("Transition is not available for this issue");
        var moved = await _quests.MoveAsync(new MoveQuestRequest(questId, transition.TargetColumnId, 0), RequireUser(), ct);
        return moved == null ? NotFound() : Ok(moved);
    }

    [HttpGet("quests/{questId:guid}/hierarchy")]
    public async Task<ActionResult> GetHierarchy(Guid questId, CancellationToken ct)
    {
        await EnsureQuestAsync(questId, BoardPermission.View, ct);
        var quest = await _db.Quests.AsNoTracking().FirstAsync(q => q.Id == questId, ct);
        var parentId = quest.ParentQuestId ?? quest.ParentEpicId;
        var parent = parentId.HasValue
            ? await _db.Quests.AsNoTracking().Where(q => q.Id == parentId).Select(q => new { q.Id, q.IssueKey, q.Title, q.IssueType }).FirstOrDefaultAsync(ct)
            : null;
        var children = await _db.Quests.AsNoTracking()
            .Where(q => q.ParentQuestId == questId || q.ParentEpicId == questId)
            .OrderBy(q => q.IssueNumber)
            .Select(q => new { q.Id, q.IssueKey, q.Title, q.IssueType })
            .ToListAsync(ct);
        return Ok(new { parent, children });
    }

    [HttpGet("quests/{questId:guid}/links")]
    public async Task<ActionResult> GetLinks(Guid questId, CancellationToken ct)
    {
        await EnsureQuestAsync(questId, BoardPermission.View, ct);
        return Ok(await _jira.GetLinksAsync(questId, ct));
    }

    [HttpPost("quests/{questId:guid}/links")]
    public async Task<ActionResult> AddLink(Guid questId, [FromBody] CreateQuestLinkRequest request, CancellationToken ct)
    {
        await EnsureQuestAsync(questId, BoardPermission.Work, ct);
        return Ok(await _jira.AddLinkAsync(questId, RequireUser(), request, ct));
    }

    [HttpDelete("quests/{questId:guid}/links/{linkId:guid}")]
    public async Task<ActionResult> DeleteLink(Guid questId, Guid linkId, CancellationToken ct)
    {
        await EnsureQuestAsync(questId, BoardPermission.Work, ct);
        return await _jira.DeleteLinkAsync(questId, linkId, ct) ? NoContent() : NotFound();
    }

    [HttpGet("quests/{questId:guid}/worklogs")]
    public async Task<ActionResult> GetWorkLogs(Guid questId, CancellationToken ct)
    {
        await EnsureQuestAsync(questId, BoardPermission.View, ct);
        return Ok(await _jira.GetWorkLogsAsync(questId, ct));
    }

    [HttpPost("quests/{questId:guid}/worklogs")]
    public async Task<ActionResult> AddWorkLog(Guid questId, [FromBody] UpsertWorkLogRequest request, CancellationToken ct)
    {
        await EnsureQuestAsync(questId, BoardPermission.Work, ct);
        return Ok(await _jira.SaveWorkLogAsync(questId, RequireUser(), null, request, ct));
    }

    [HttpPut("quests/{questId:guid}/worklogs/{id:guid}")]
    public async Task<ActionResult> UpdateWorkLog(Guid questId, Guid id, [FromBody] UpsertWorkLogRequest request, CancellationToken ct)
    {
        await EnsureQuestAsync(questId, BoardPermission.Work, ct);
        return Ok(await _jira.SaveWorkLogAsync(questId, RequireUser(), id, request, ct));
    }

    [HttpDelete("quests/{questId:guid}/worklogs/{id:guid}")]
    public async Task<ActionResult> DeleteWorkLog(Guid questId, Guid id, CancellationToken ct)
    {
        var userId = RequireUser();
        var (_, permission) = await _access.GetQuestAccessAsync(questId, userId, ct);
        await EnsureQuestAsync(questId, BoardPermission.Work, ct);
        return await _jira.DeleteWorkLogAsync(questId, id, userId, permission >= BoardPermission.Manage, ct) ? NoContent() : NotFound();
    }

    [HttpGet("quests/{questId:guid}/history")]
    public async Task<ActionResult> GetHistory(Guid questId, CancellationToken ct)
    {
        await EnsureQuestAsync(questId, BoardPermission.View, ct);
        return Ok(await _jira.GetHistoryAsync(questId, ct));
    }

    [HttpGet("components/board/{boardId:guid}")]
    public async Task<ActionResult> GetComponents(Guid boardId, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.View, ct);
        return Ok(await _jira.GetComponentsAsync(boardId, ct));
    }

    [HttpPost("components/board/{boardId:guid}")]
    public async Task<ActionResult> CreateComponent(Guid boardId, [FromBody] UpsertBoardComponentRequest request, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Manage, ct);
        return Ok(await _jira.SaveComponentAsync(boardId, null, request, ct));
    }

    [HttpPut("components/{id:guid}")]
    public async Task<ActionResult> UpdateComponent(Guid id, [FromBody] UpsertBoardComponentRequest request, CancellationToken ct)
    {
        var boardId = await _db.BoardComponents.Where(x => x.Id == id).Select(x => (Guid?)x.BoardId).FirstOrDefaultAsync(ct)
            ?? throw new KeyNotFoundException("Component not found");
        await EnsureBoardAsync(boardId, BoardPermission.Manage, ct);
        return Ok(await _jira.SaveComponentAsync(boardId, id, request, ct));
    }

    [HttpDelete("components/{id:guid}")]
    public async Task<ActionResult> DeleteComponent(Guid id, CancellationToken ct)
    {
        var boardId = await _db.BoardComponents.Where(x => x.Id == id).Select(x => (Guid?)x.BoardId).FirstOrDefaultAsync(ct);
        if (!boardId.HasValue) return NotFound();
        await EnsureBoardAsync(boardId.Value, BoardPermission.Manage, ct);
        return await _jira.DeleteComponentAsync(id, ct) ? NoContent() : NotFound();
    }

    [HttpGet("releases/board/{boardId:guid}")]
    public async Task<ActionResult> GetReleases(Guid boardId, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.View, ct);
        return Ok(await _jira.GetReleasesAsync(boardId, ct));
    }

    [HttpPost("releases/board/{boardId:guid}")]
    public async Task<ActionResult> CreateRelease(Guid boardId, [FromBody] UpsertBoardReleaseRequest request, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Manage, ct);
        return Ok(await _jira.SaveReleaseAsync(boardId, null, request, ct));
    }

    [HttpPut("releases/{id:guid}")]
    public async Task<ActionResult> UpdateRelease(Guid id, [FromBody] UpsertBoardReleaseRequest request, CancellationToken ct)
    {
        var boardId = await _db.BoardReleases.Where(x => x.Id == id).Select(x => (Guid?)x.BoardId).FirstOrDefaultAsync(ct)
            ?? throw new KeyNotFoundException("Release not found");
        await EnsureBoardAsync(boardId, BoardPermission.Manage, ct);
        return Ok(await _jira.SaveReleaseAsync(boardId, id, request, ct));
    }

    [HttpPost("releases/{id:guid}/release")]
    public async Task<ActionResult> MarkReleased(Guid id, CancellationToken ct)
    {
        var boardId = await _db.BoardReleases.Where(x => x.Id == id).Select(x => (Guid?)x.BoardId).FirstOrDefaultAsync(ct);
        if (!boardId.HasValue) return NotFound();
        await EnsureBoardAsync(boardId.Value, BoardPermission.Manage, ct);
        var release = await _jira.MarkReleaseReleasedAsync(id, ct);
        return release == null ? NotFound() : Ok(release);
    }

    [HttpDelete("releases/{id:guid}")]
    public async Task<ActionResult> DeleteRelease(Guid id, CancellationToken ct)
    {
        var boardId = await _db.BoardReleases.Where(x => x.Id == id).Select(x => (Guid?)x.BoardId).FirstOrDefaultAsync(ct);
        if (!boardId.HasValue) return NotFound();
        await EnsureBoardAsync(boardId.Value, BoardPermission.Manage, ct);
        return await _jira.DeleteReleaseAsync(id, ct) ? NoContent() : NotFound();
    }

    [HttpGet("search/issues")]
    public async Task<ActionResult> Search([FromQuery] string? jql, [FromQuery] Guid? boardId, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default)
    {
        if (boardId.HasValue) await EnsureBoardAsync(boardId.Value, BoardPermission.View, ct);
        return Ok(await _jql.SearchAsync(jql ?? "", RequireUser(), page, pageSize, boardId, ct));
    }

    [HttpGet("savedFilters")]
    public async Task<ActionResult> GetFilters(CancellationToken ct) => Ok(await _jira.GetFiltersAsync(RequireUser(), ct));

    [HttpPost("savedFilters")]
    public async Task<ActionResult> CreateFilter([FromBody] UpsertSavedFilterRequest request, CancellationToken ct) =>
        Ok(await _jira.SaveFilterAsync(RequireUser(), null, request, ct));

    [HttpPut("savedFilters/{id:guid}")]
    public async Task<ActionResult> UpdateFilter(Guid id, [FromBody] UpsertSavedFilterRequest request, CancellationToken ct) =>
        Ok(await _jira.SaveFilterAsync(RequireUser(), id, request, ct));

    [HttpDelete("savedFilters/{id:guid}")]
    public async Task<ActionResult> DeleteFilter(Guid id, CancellationToken ct) =>
        await _jira.DeleteFilterAsync(RequireUser(), id, ct) ? NoContent() : NotFound();

    [HttpGet("notifications")]
    public async Task<ActionResult> GetNotifications([FromQuery] bool unreadOnly = false, CancellationToken ct = default) =>
        Ok(await _jira.GetNotificationsAsync(RequireUser(), unreadOnly, ct));

    [HttpPost("notifications/{id:guid}/read")]
    public async Task<ActionResult> MarkRead(Guid id, CancellationToken ct) =>
        await _jira.MarkNotificationReadAsync(id, RequireUser(), ct) ? NoContent() : NotFound();

    [HttpPost("notifications/read-all")]
    public async Task<ActionResult> MarkAllRead(CancellationToken ct) =>
        Ok(new { updated = await _jira.MarkAllNotificationsReadAsync(RequireUser(), ct) });

    public record PersonalSettingsDto(bool EmailNotificationsEnabled, bool EmailWhenAssignee, bool EmailWhenReporter,
        bool EmailOwnChanges, string EmailFormat, bool AutoWatch);

    [HttpGet("me/settings")]
    public async Task<ActionResult> GetPersonalSettings(CancellationToken ct)
    {
        var userId = RequireUser();
        var u = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId, ct);
        if (u == null) return NotFound();
        return Ok(new PersonalSettingsDto(u.EmailNotificationsEnabled, u.EmailWhenAssignee, u.EmailWhenReporter, u.EmailOwnChanges, u.EmailFormat, u.AutoWatch));
    }

    [HttpPut("me/settings")]
    public async Task<ActionResult> SavePersonalSettings([FromBody] PersonalSettingsDto request, CancellationToken ct)
    {
        var userId = RequireUser();
        var u = await _db.Users.FirstOrDefaultAsync(x => x.Id == userId, ct);
        if (u == null) return NotFound();
        if (request.EmailFormat is not ("html" or "text")) throw new ArgumentException("EmailFormat must be html or text");
        u.EmailNotificationsEnabled = request.EmailNotificationsEnabled;
        u.EmailWhenAssignee = request.EmailWhenAssignee;
        u.EmailWhenReporter = request.EmailWhenReporter;
        u.EmailOwnChanges = request.EmailOwnChanges;
        u.EmailFormat = request.EmailFormat;
        u.AutoWatch = request.AutoWatch;
        await _db.SaveChangesAsync(ct);
        return Ok(request);
    }

    [HttpGet("me/spaces")]
    public async Task<ActionResult> GetMySpaces(CancellationToken ct)
    {
        var userId = RequireUser();
        var spaces = await _db.Boards.AsNoTracking()
            .Where(b => b.Team.OwnerId == userId || b.Team.Members.Any(m => m.UserId == userId))
            .Select(b => new
            {
                id = b.Id,
                name = b.Name,
                description = b.Description,
                key = b.KeyPrefix,
                teamId = b.TeamId,
                teamName = b.Team.Name,
                leadId = b.Team.OwnerId,
                leadName = _db.Users.Where(u => u.Id == b.Team.OwnerId).Select(u => u.DisplayName).FirstOrDefault(),
                leadAvatarUrl = _db.Users.Where(u => u.Id == b.Team.OwnerId).Select(u => u.AvatarUrl).FirstOrDefault(),
                issueCount = _db.Quests.Count(q => q.BoardId == b.Id),
                hasSprints = _db.Sprints.Any(s => s.BoardId == b.Id),
                lastIssueUpdate = _db.QuestChanges.Where(c => _db.Quests.Any(q => q.Id == c.QuestId && q.BoardId == b.Id)).Max(c => (DateTime?)c.CreatedAt)
                    ?? _db.Quests.Where(q => q.BoardId == b.Id).Max(q => (DateTime?)q.CreatedAt),
            })
            .OrderBy(x => x.name)
            .ToListAsync(ct);
        return Ok(spaces);
    }

    [HttpGet("admin/system")]
    public async Task<ActionResult> GetSystemInfo([FromServices] IConfiguration config, [FromServices] IWebHostEnvironment env, CancellationToken ct)
    {
        var userId = RequireUser();
        var myTeams = _db.Teams.Where(t => t.OwnerId == userId || t.Members.Any(m => m.UserId == userId));
        return Ok(new
        {
            name = "Канбан",
            environment = env.EnvironmentName,
            version = typeof(JiraPlatformController).Assembly.GetName().Version?.ToString(),
            mailFromName = config["Smtp:FromName"] ?? "Canban",
            mailFromAddress = config["Smtp:FromAddress"],
            mailConfigured = !string.IsNullOrWhiteSpace(config["Smtp:Host"]),
            githubAppConfigured = !string.IsNullOrWhiteSpace(config["GitHub:AppId"]),
            googleSignIn = !string.IsNullOrWhiteSpace(config["Google:ClientId"]),
            attachmentsStorage = string.IsNullOrWhiteSpace(config["S3:Bucket"]) ? "local" : "s3",
            users = await _db.Users.CountAsync(ct),
            teams = await myTeams.CountAsync(ct),
            spaces = await _db.Boards.CountAsync(b => myTeams.Any(t => t.Id == b.TeamId), ct),
            issues = await _db.Quests.CountAsync(q => myTeams.Any(t => t.Id == q.Board.TeamId), ct),
        });
    }

    public record SendKudosRequest(Guid ToUserId, string Message, string? Kind);

    public static readonly string[] KudosKinds = { "thanks", "teamwork", "help", "idea", "celebrate" };

    [HttpGet("me/people")]
    public async Task<ActionResult> GetPeopleIWorkWith(CancellationToken ct)
    {
        var userId = RequireUser();
        var myTeamIds = _db.Teams.Where(t => t.OwnerId == userId || t.Members.Any(m => m.UserId == userId)).Select(t => t.Id);
        var memberIds = await _db.TeamMembers.Where(m => myTeamIds.Contains(m.TeamId)).Select(m => new { m.UserId, m.TeamId }).ToListAsync(ct);
        var ownerIds = await _db.Teams.Where(t => myTeamIds.Contains(t.Id) && t.OwnerId != null).Select(t => new { UserId = t.OwnerId!.Value, TeamId = t.Id }).ToListAsync(ct);
        var shared = memberIds.Concat(ownerIds).Where(x => x.UserId != userId)
            .GroupBy(x => x.UserId).ToDictionary(g => g.Key, g => g.Select(x => x.TeamId).Distinct().Count());
        var ids = shared.Keys.ToList();
        var people = await _db.Users.AsNoTracking().Where(u => ids.Contains(u.Id))
            .Select(u => new { id = u.Id, displayName = u.DisplayName, avatarUrl = u.AvatarUrl, email = u.Email })
            .ToListAsync(ct);
        return Ok(people.Select(p => new { p.id, p.displayName, p.avatarUrl, p.email, sharedTeams = shared[p.id] })
            .OrderByDescending(p => p.sharedTeams).ThenBy(p => p.displayName));
    }

    [HttpGet("kudos")]
    public async Task<ActionResult> GetKudos([FromQuery] string scope = "all", [FromQuery] Guid? userId = null, CancellationToken ct = default)
    {
        var me = RequireUser();
        var subject = userId ?? me;
        var query = _db.Kudos.AsNoTracking();
        query = scope switch
        {
            "received" => query.Where(k => k.ToUserId == subject),
            "given" => query.Where(k => k.FromUserId == subject),
            _ => query.Where(k => k.ToUserId == subject || k.FromUserId == subject),
        };
        var list = await query.OrderByDescending(k => k.CreatedAt).Take(200)
            .Select(k => new
            {
                id = k.Id,
                kind = k.Kind,
                message = k.Message,
                createdAt = k.CreatedAt,
                fromUserId = k.FromUserId,
                fromName = _db.Users.Where(u => u.Id == k.FromUserId).Select(u => u.DisplayName).FirstOrDefault(),
                fromAvatarUrl = _db.Users.Where(u => u.Id == k.FromUserId).Select(u => u.AvatarUrl).FirstOrDefault(),
                toUserId = k.ToUserId,
                toName = _db.Users.Where(u => u.Id == k.ToUserId).Select(u => u.DisplayName).FirstOrDefault(),
                toAvatarUrl = _db.Users.Where(u => u.Id == k.ToUserId).Select(u => u.AvatarUrl).FirstOrDefault(),
            })
            .ToListAsync(ct);
        return Ok(list);
    }

    [HttpPost("kudos")]
    public async Task<ActionResult> SendKudos([FromBody] SendKudosRequest request, CancellationToken ct)
    {
        var me = RequireUser();
        var message = (request.Message ?? "").Trim();
        if (request.ToUserId == me) return BadRequest("Нельзя отправить похвалу самому себе");
        if (message.Length == 0 || message.Length > 1000) return BadRequest("Сообщение должно содержать от 1 до 1000 символов");
        var kind = KudosKinds.Contains(request.Kind) ? request.Kind! : "thanks";
        var recipient = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == request.ToUserId, ct);
        if (recipient == null) return NotFound("Пользователь не найден");
        var senderName = await _db.Users.Where(u => u.Id == me).Select(u => u.DisplayName).FirstOrDefaultAsync(ct) ?? "";
        var kudos = new Kudos { Id = Guid.NewGuid(), FromUserId = me, ToUserId = recipient.Id, Kind = kind, Message = message, CreatedAt = DateTime.UtcNow };
        _db.Kudos.Add(kudos);
        _db.AppNotifications.Add(new AppNotification
        {
            Id = Guid.NewGuid(),
            UserId = recipient.Id,
            Type = "kudos",
            Title = $"{senderName} отправил(а) вам похвалу",
            Body = message,
            CreatedAt = kudos.CreatedAt,
        });
        await _db.SaveChangesAsync(ct);
        return Ok(new { id = kudos.Id, kind, message, createdAt = kudos.CreatedAt, toUserId = recipient.Id, toName = recipient.DisplayName, toAvatarUrl = recipient.AvatarUrl });
    }

    [HttpGet("me/work")]
    public async Task<ActionResult> GetMyWork([FromQuery] string kind = "assigned", [FromQuery] string? ids = null, CancellationToken ct = default)
    {
        var questIds = (ids ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => Guid.TryParse(x, out var id) ? id : Guid.Empty).Where(x => x != Guid.Empty).ToList();
        return Ok(await _jira.GetMyWorkAsync(RequireUser(), kind, questIds, ct));
    }

    [HttpGet("automations/board/{boardId:guid}")]
    public async Task<ActionResult> GetAutomations(Guid boardId, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.View, ct);
        return Ok(await _jira.GetAutomationRulesAsync(boardId, ct));
    }

    [HttpPost("automations/board/{boardId:guid}")]
    public async Task<ActionResult> CreateAutomation(Guid boardId, [FromBody] UpsertAutomationRuleRequest request, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Manage, ct);
        return Ok(await _jira.SaveAutomationRuleAsync(boardId, null, request, ct));
    }

    [HttpPut("automations/board/{boardId:guid}/{id:guid}")]
    public async Task<ActionResult> UpdateAutomation(Guid boardId, Guid id, [FromBody] UpsertAutomationRuleRequest request, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Manage, ct);
        return Ok(await _jira.SaveAutomationRuleAsync(boardId, id, request, ct));
    }

    [HttpDelete("automations/board/{boardId:guid}/{id:guid}")]
    public async Task<ActionResult> DeleteAutomation(Guid boardId, Guid id, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Manage, ct);
        return await _jira.DeleteAutomationRuleAsync(boardId, id, ct) ? NoContent() : NotFound();
    }

    [HttpPost("automations/board/{boardId:guid}/{id:guid}/run")]
    public async Task<ActionResult> RunAutomation(Guid boardId, Guid id, [FromBody] RunAutomationRequest request, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Manage, ct);
        return Ok(await _jira.RunAutomationRuleAsync(boardId, id, request, ct));
    }

    [HttpGet("permissions/board/{boardId:guid}")]
    public async Task<ActionResult> GetPermissions(Guid boardId, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.View, ct);
        return Ok(await _jira.GetBoardPermissionsAsync(boardId, RequireUser(), ct));
    }

    [HttpGet("integrations/board/{boardId:guid}")]
    public async Task<ActionResult> GetIntegrations(Guid boardId, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.View, ct);
        return Ok(new
        {
            github = await _jira.GetGitHubIntegrationsAsync(boardId, ct),
            webhooks = await _jira.GetWebhooksAsync(boardId, ct),
            githubAppConfigured = _jira.IsGitHubAppConfigured
        });
    }

    [HttpDelete("integrations/board/{boardId:guid}/github/{id:guid}")]
    public async Task<ActionResult> DeleteGithub(Guid boardId, Guid id, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Admin, ct);
        return await _jira.DeleteGitHubIntegrationAsync(boardId, id, ct) ? NoContent() : NotFound();
    }

    [HttpDelete("integrations/board/{boardId:guid}/webhooks/{id:guid}")]
    public async Task<ActionResult> DeleteWebhook(Guid boardId, Guid id, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Admin, ct);
        return await _jira.DeleteWebhookAsync(boardId, id, ct) ? NoContent() : NotFound();
    }

    [HttpGet("integrations/github/quests/{questId:guid}")]
    public async Task<ActionResult> GetDevelopment(Guid questId, CancellationToken ct)
    {
        await EnsureQuestAsync(questId, BoardPermission.View, ct);
        return Ok(await _jira.GetDevelopmentAsync(questId, ct));
    }

    [HttpPost("integrations/github/quests/{questId:guid}/sync")]
    public async Task<ActionResult> SyncDevelopment(Guid questId, CancellationToken ct)
    {
        await EnsureQuestAsync(questId, BoardPermission.Work, ct);
        return Ok(await _jira.SyncDevelopmentAsync(questId, ct));
    }

    [HttpPut("integrations/board/{boardId:guid}/github")]
    public async Task<ActionResult> SaveGithub(Guid boardId, [FromBody] UpsertGitHubIntegrationRequest request, [FromQuery] Guid? id, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Admin, ct);
        return Ok(await _jira.SaveGitHubIntegrationAsync(boardId, id, request, ct));
    }

    [HttpPost("integrations/board/{boardId:guid}/webhooks")]
    public async Task<ActionResult> CreateWebhook(Guid boardId, [FromBody] UpsertOutboundWebhookRequest request, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Admin, ct);
        return Ok(await _jira.SaveWebhookAsync(boardId, null, request, ct));
    }

    [HttpPut("integrations/board/{boardId:guid}/webhooks/{id:guid}")]
    public async Task<ActionResult> UpdateWebhook(Guid boardId, Guid id, [FromBody] UpsertOutboundWebhookRequest request, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Admin, ct);
        return Ok(await _jira.SaveWebhookAsync(boardId, id, request, ct));
    }

    [AllowAnonymous]
    [HttpPost("integrations/github/webhook")]
    public async Task<ActionResult> GitHubWebhook(CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body);
        var payload = await reader.ReadToEndAsync(ct);
        var signature = Request.Headers["X-Hub-Signature-256"].FirstOrDefault() ?? "";
        var eventName = Request.Headers["X-GitHub-Event"].FirstOrDefault() ?? "unknown";
        await _jira.ProcessGitHubWebhookAsync(eventName, payload, signature, ct);
        return Accepted();
    }

    [HttpPut("bulk/quests")]
    public async Task<ActionResult> BulkEdit([FromBody] BulkEditQuestsRequest request, [FromQuery] Guid boardId, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Work, ct);
        return Ok(await _jira.BulkEditAsync(boardId, RequireUser(), request, ct));
    }

    [HttpPost("bulk/quests/delete")]
    public async Task<ActionResult> BulkDelete([FromBody] BulkDeleteQuestsRequest request, [FromQuery] Guid boardId, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Manage, ct);
        var ids = await _db.Quests.AsNoTracking()
            .Where(q => q.BoardId == boardId && request.QuestIds.Contains(q.Id))
            .Select(q => q.Id).ToListAsync(ct);
        var deleted = 0;
        foreach (var id in ids)
            if (await _quests.DeleteAsync(id, ct)) deleted++;
        return Ok(new BulkEditResult(deleted));
    }

    [HttpPost("clone/quests/{questId:guid}")]
    public async Task<ActionResult> CloneQuest(Guid questId, [FromBody] CloneQuestRequest? request, CancellationToken ct)
    {
        await EnsureQuestAsync(questId, BoardPermission.Work, ct);
        return Ok(await _jira.CloneQuestAsync(questId, RequireUser(), request ?? new CloneQuestRequest(), ct));
    }

    [HttpPost("clone/boards/{boardId:guid}")]
    public async Task<ActionResult> CloneBoard(Guid boardId, [FromBody] CloneBoardRequest request, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Manage, ct);
        return Ok(await _jira.CloneBoardAsync(boardId, RequireUser(), request, ct));
    }

    [HttpPost("importExport/preview")]
    public ActionResult PreviewImport([FromBody] ImportPreviewRequest request) => Ok(_jira.PreviewImport(request));

    [HttpGet("importExport/boards/{boardId:guid}/export")]
    public async Task<ActionResult> Export(Guid boardId, [FromQuery] string format = "json", CancellationToken ct = default)
    {
        await EnsureBoardAsync(boardId, BoardPermission.View, ct);
        var content = await _jira.ExportAsync(boardId, format, ct);
        return Content(content, format.Equals("csv", StringComparison.OrdinalIgnoreCase) ? "text/csv" : "application/json");
    }

    [HttpPost("importExport/boards/{boardId:guid}/import")]
    public async Task<ActionResult> Import(Guid boardId, IFormFile file, [FromQuery] Guid columnId, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.Manage, ct);
        await using var stream = file.OpenReadStream();
        using var reader = new StreamReader(stream);
        var content = await reader.ReadToEndAsync(ct);
        var format = file.FileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase) ? "csv" : "json";
        return Ok(await _jira.ExecuteImportAsync(RequireUser(), new ImportExecuteRequest(format, content, boardId, columnId), ct));
    }

    [HttpGet("reports/boards/{boardId:guid}/{type}")]
    public async Task<ActionResult> Report(Guid boardId, string type, [FromQuery] Guid? releaseId, CancellationToken ct)
    {
        await EnsureBoardAsync(boardId, BoardPermission.View, ct);
        return Ok(await _jira.GetReportAsync(boardId, type, releaseId, ct));
    }

    [HttpGet("dashboards")]
    public async Task<ActionResult> GetDashboards(CancellationToken ct) => Ok(await _jira.GetDashboardsAsync(RequireUser(), ct));

    [HttpPost("dashboards")]
    public async Task<ActionResult> CreateDashboard([FromBody] UpsertDashboardRequest request, CancellationToken ct) =>
        Ok(await _jira.SaveDashboardAsync(RequireUser(), null, request, ct));

    [HttpPut("dashboards/{id:guid}")]
    public async Task<ActionResult> UpdateDashboard(Guid id, [FromBody] UpsertDashboardRequest request, CancellationToken ct) =>
        Ok(await _jira.SaveDashboardAsync(RequireUser(), id, request, ct));
}
