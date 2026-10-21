using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Jira-like Service Desk: portal, request types, queues, SLA clocks and approvals.</summary>
public class ServiceDeskService
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly Regex SlugRx = new("^[a-z0-9][a-z0-9-]{1,62}$", RegexOptions.Compiled);
    private readonly CanbanDbContext _db;
    private readonly IProjectAccessService _access;
    private readonly PermissionSchemeService _permissions;
    private readonly IQuestService _quests;
    private readonly IQuestCollaborationService _collaboration;
    private readonly IJqlQueryService _jql;
    private readonly IQuestNotificationService _notifications;

    public ServiceDeskService(
        CanbanDbContext db,
        IProjectAccessService access,
        PermissionSchemeService permissions,
        IQuestService quests,
        IQuestCollaborationService collaboration,
        IJqlQueryService jql,
        IQuestNotificationService notifications)
    {
        _db = db;
        _access = access;
        _permissions = permissions;
        _quests = quests;
        _collaboration = collaboration;
        _jql = jql;
        _notifications = notifications;
    }

    public async Task<ServiceDeskSettingsDto> GetSettingsAsync(Guid boardId, Guid userId, CancellationToken ct)
    {
        await EnsureBrowseAsync(boardId, userId, ct);
        var board = await BoardAsync(boardId, ct);
        var settings = await EnsureSettingsEntityAsync(board, ct);
        return MapSettings(settings, board.Name, await IsAgentAsync(boardId, userId, ct), await CanManageAsync(boardId, userId, ct));
    }

    public async Task<ServiceDeskSettingsDto> UpdateSettingsAsync(Guid boardId, Guid userId, UpsertServiceDeskSettingsRequest request, CancellationToken ct)
    {
        await EnsureManageAsync(boardId, userId, ct);
        var board = await BoardAsync(boardId, ct);
        var settings = await EnsureSettingsEntityAsync(board, ct);
        settings.Enabled = request.Enabled;
        var slug = (request.PortalSlug ?? settings.PortalSlug ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(slug)) slug = SuggestSlug(board.Name, board.KeyPrefix);
        if (!SlugRx.IsMatch(slug)) throw new ArgumentException("Адрес портала: латиница, цифры и дефис, от 2 до 64 символов.");
        var taken = await _db.ServiceDeskSettings.AsNoTracking()
            .AnyAsync(s => s.PortalSlug == slug && s.BoardId != boardId, ct);
        if (taken) throw new InvalidOperationException("Такой адрес портала уже занят.");
        settings.PortalSlug = slug;
        if (request.WelcomeTitle != null)
        {
            var title = request.WelcomeTitle.Trim();
            if (title.Length is < 1 or > 200) throw new ArgumentException("Заголовок портала — от 1 до 200 символов.");
            settings.WelcomeTitle = title;
        }
        if (request.WelcomeText != null)
        {
            var text = request.WelcomeText.Trim();
            if (text.Length > 4000) throw new ArgumentException("Описание портала не длиннее 4000 символов.");
            settings.WelcomeText = text.Length == 0 ? null : text;
        }
        settings.UpdatedAt = DateTime.UtcNow;
        await EnsureDefaultCatalogAsync(boardId, ct);
        await EnableFeatureAsync(board, ct);
        await _db.SaveChangesAsync(ct);
        return MapSettings(settings, board.Name, true, true);
    }

    public async Task<IReadOnlyList<ServiceRequestTypeDto>> ListRequestTypesAsync(Guid boardId, Guid userId, bool portalOnly, CancellationToken ct)
    {
        if (portalOnly) await EnsureBrowseAsync(boardId, userId, ct);
        else await EnsureManageAsync(boardId, userId, ct);
        var query = _db.ServiceRequestTypes.AsNoTracking().Where(t => t.BoardId == boardId);
        if (portalOnly) query = query.Where(t => t.IsEnabled);
        var rows = await query.OrderBy(t => t.Order).ThenBy(t => t.Name).ToListAsync(ct);
        return rows.Select(MapType).ToList();
    }

    public async Task<ServiceRequestTypeDto> CreateRequestTypeAsync(Guid boardId, Guid userId, SaveServiceRequestTypeRequest request, CancellationToken ct)
    {
        await EnsureManageAsync(boardId, userId, ct);
        await BoardAsync(boardId, ct);
        var type = new ServiceRequestType
        {
            Id = Guid.NewGuid(),
            BoardId = boardId,
            Name = RequireName(request.Name),
            Description = TrimOptional(request.Description, 2000),
            Icon = string.IsNullOrWhiteSpace(request.Icon) ? "help" : request.Icon.Trim()[..Math.Min(32, request.Icon.Trim().Length)],
            IssueType = request.IssueType ?? IssueType.Task,
            FormId = request.FormId,
            QueueId = request.QueueId,
            SlaPolicyId = request.SlaPolicyId,
            FieldsJson = SerializeFields(request.Fields),
            Order = request.Order ?? await _db.ServiceRequestTypes.CountAsync(t => t.BoardId == boardId, ct),
            IsEnabled = request.IsEnabled ?? true,
        };
        _db.ServiceRequestTypes.Add(type);
        await _db.SaveChangesAsync(ct);
        return MapType(type);
    }

    public async Task<ServiceRequestTypeDto> UpdateRequestTypeAsync(Guid boardId, Guid id, Guid userId, SaveServiceRequestTypeRequest request, CancellationToken ct)
    {
        await EnsureManageAsync(boardId, userId, ct);
        var type = await _db.ServiceRequestTypes.FirstOrDefaultAsync(t => t.Id == id && t.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Тип запроса не найден.");
        if (request.Name != null) type.Name = RequireName(request.Name);
        if (request.Description != null) type.Description = TrimOptional(request.Description, 2000);
        if (request.Icon != null) type.Icon = string.IsNullOrWhiteSpace(request.Icon) ? "help" : request.Icon.Trim()[..Math.Min(32, request.Icon.Trim().Length)];
        if (request.IssueType.HasValue) type.IssueType = request.IssueType.Value;
        if (request.FormId.HasValue) type.FormId = request.FormId;
        if (request.QueueId.HasValue) type.QueueId = request.QueueId;
        if (request.SlaPolicyId.HasValue) type.SlaPolicyId = request.SlaPolicyId;
        if (request.Fields != null) type.FieldsJson = SerializeFields(request.Fields);
        if (request.Order.HasValue) type.Order = request.Order.Value;
        if (request.IsEnabled.HasValue) type.IsEnabled = request.IsEnabled.Value;
        await _db.SaveChangesAsync(ct);
        return MapType(type);
    }

    public async Task DeleteRequestTypeAsync(Guid boardId, Guid id, Guid userId, CancellationToken ct)
    {
        await EnsureManageAsync(boardId, userId, ct);
        var type = await _db.ServiceRequestTypes.FirstOrDefaultAsync(t => t.Id == id && t.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Тип запроса не найден.");
        _db.ServiceRequestTypes.Remove(type);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<ServiceQueueDto>> ListQueuesAsync(Guid boardId, Guid userId, bool withCounts, CancellationToken ct)
    {
        await EnsureAgentAsync(boardId, userId, ct);
        var queues = await _db.ServiceQueues.AsNoTracking().Where(q => q.BoardId == boardId)
            .OrderBy(q => q.Order).ThenBy(q => q.Name).ToListAsync(ct);
        if (!withCounts) return queues.Select(q => MapQueue(q)).ToList();
        var result = new List<ServiceQueueDto>();
        foreach (var queue in queues)
        {
            var count = await CountQueueAsync(queue, userId, ct);
            result.Add(MapQueue(queue, count));
        }
        return result;
    }

    public async Task<ServiceQueueDto> CreateQueueAsync(Guid boardId, Guid userId, SaveServiceQueueRequest request, CancellationToken ct)
    {
        await EnsureManageAsync(boardId, userId, ct);
        var queue = new ServiceQueue
        {
            Id = Guid.NewGuid(),
            BoardId = boardId,
            Name = RequireName(request.Name),
            Description = TrimOptional(request.Description, 2000),
            Jql = string.IsNullOrWhiteSpace(request.Jql) ? "statusCategory != Done ORDER BY created DESC" : request.Jql.Trim(),
            Order = request.Order ?? await _db.ServiceQueues.CountAsync(q => q.BoardId == boardId, ct),
            DefaultGroupId = request.DefaultGroupId,
        };
        _db.ServiceQueues.Add(queue);
        await _db.SaveChangesAsync(ct);
        return MapQueue(queue);
    }

    public async Task<ServiceQueueDto> UpdateQueueAsync(Guid boardId, Guid id, Guid userId, SaveServiceQueueRequest request, CancellationToken ct)
    {
        await EnsureManageAsync(boardId, userId, ct);
        var queue = await _db.ServiceQueues.FirstOrDefaultAsync(q => q.Id == id && q.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Очередь не найдена.");
        if (request.Name != null) queue.Name = RequireName(request.Name);
        if (request.Description != null) queue.Description = TrimOptional(request.Description, 2000);
        if (request.Jql != null) queue.Jql = string.IsNullOrWhiteSpace(request.Jql) ? queue.Jql : request.Jql.Trim();
        if (request.Order.HasValue) queue.Order = request.Order.Value;
        if (request.DefaultGroupId.HasValue) queue.DefaultGroupId = request.DefaultGroupId;
        await _db.SaveChangesAsync(ct);
        return MapQueue(queue);
    }

    public async Task DeleteQueueAsync(Guid boardId, Guid id, Guid userId, CancellationToken ct)
    {
        await EnsureManageAsync(boardId, userId, ct);
        var queue = await _db.ServiceQueues.FirstOrDefaultAsync(q => q.Id == id && q.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Очередь не найдена.");
        _db.ServiceQueues.Remove(queue);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<object> GetQueueIssuesAsync(Guid boardId, Guid queueId, Guid userId, int page, int pageSize, CancellationToken ct)
    {
        await EnsureAgentAsync(boardId, userId, ct);
        var queue = await _db.ServiceQueues.AsNoTracking().FirstOrDefaultAsync(q => q.Id == queueId && q.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Очередь не найдена.");
        var jql = queue.Jql.Contains("project", StringComparison.OrdinalIgnoreCase)
            ? queue.Jql
            : $"project = {await ProjectKeyAsync(boardId, ct)} AND ({queue.Jql})";
        var search = await _jql.SearchAsync(jql, userId, Math.Max(1, page), Math.Clamp(pageSize, 1, 100), boardId, ct);
        var ids = search.Items.Select(i => i.Id).ToList();
        var clocks = await LoadClocksAsync(ids, ct);
        var details = (search.Details ?? new()).ToDictionary(d => d.Id);
        return new
        {
            queue = MapQueue(queue, search.Total),
            total = search.Total,
            page = search.Page,
            pageSize = search.PageSize,
            issues = search.Items.Select(issue =>
            {
                details.TryGetValue(issue.Id, out var detail);
                return new
                {
                    issue.Id,
                    issue.IssueKey,
                    issue.Title,
                    issue.BoardId,
                    issue.ColumnId,
                    StatusTitle = detail?.StatusName ?? "",
                    StatusCategory = detail?.StatusCategory ?? "",
                    issue.AssigneeId,
                    issue.AssigneeName,
                    issue.Priority,
                    issue.CreatedAt,
                    sla = clocks.GetValueOrDefault(issue.Id) ?? Array.Empty<SlaClockDto>(),
                };
            }),
        };
    }

    public async Task AssignQueueIssuesAsync(Guid boardId, Guid queueId, Guid userId, AssignQueueIssuesRequest request, CancellationToken ct)
    {
        await EnsureAgentAsync(boardId, userId, ct);
        _ = await _db.ServiceQueues.AsNoTracking().FirstOrDefaultAsync(q => q.Id == queueId && q.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Очередь не найдена.");
        var ids = (request.QuestIds ?? Array.Empty<Guid>()).Distinct().Take(50).ToList();
        if (ids.Count == 0) return;
        var quests = await _db.Quests.Where(q => ids.Contains(q.Id) && q.BoardId == boardId).ToListAsync(ct);
        foreach (var quest in quests)
        {
            if (!await _permissions.HasOnQuestAsync(quest.Id, userId, JiraPermissions.Assign, ct))
                throw new UnauthorizedAccessException("Недостаточно прав для назначения.");
            quest.AssigneeId = request.AssigneeId;
        }
        await _db.SaveChangesAsync(ct);
        foreach (var quest in quests)
            await _notifications.NotifyAsync(quest.Id, userId, "Заявка назначена", quest.Title, ct, NotificationEvents.Assigned);
    }

    public async Task<IReadOnlyList<SlaPolicyDto>> ListPoliciesAsync(Guid boardId, Guid userId, CancellationToken ct)
    {
        await EnsureManageAsync(boardId, userId, ct);
        var rows = await _db.SlaPolicies.AsNoTracking().Where(p => p.BoardId == boardId).OrderBy(p => p.Name).ToListAsync(ct);
        return rows.Select(MapPolicy).ToList();
    }

    public async Task<SlaPolicyDto> CreatePolicyAsync(Guid boardId, Guid userId, SaveSlaPolicyRequest request, CancellationToken ct)
    {
        await EnsureManageAsync(boardId, userId, ct);
        var policy = new SlaPolicy
        {
            Id = Guid.NewGuid(),
            BoardId = boardId,
            Name = RequireName(request.Name),
            FirstResponseMinutes = Math.Clamp(request.FirstResponseMinutes, 5, 60 * 24 * 30),
            ResolutionMinutes = Math.Clamp(request.ResolutionMinutes, 5, 60 * 24 * 90),
            PauseStatusTitlesJson = JsonSerializer.Serialize(request.PauseStatusTitles ?? new[] { "Ожидает пользователя" }, Json),
            CalendarJson = string.IsNullOrWhiteSpace(request.CalendarJson)
                ? "{\"timezone\":\"Europe/Moscow\",\"weekdays\":[1,2,3,4,5],\"start\":\"09:00\",\"end\":\"18:00\"}"
                : request.CalendarJson.Trim(),
        };
        _db.SlaPolicies.Add(policy);
        await _db.SaveChangesAsync(ct);
        return MapPolicy(policy);
    }

    public async Task<SlaPolicyDto> UpdatePolicyAsync(Guid boardId, Guid id, Guid userId, SaveSlaPolicyRequest request, CancellationToken ct)
    {
        await EnsureManageAsync(boardId, userId, ct);
        var policy = await _db.SlaPolicies.FirstOrDefaultAsync(p => p.Id == id && p.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Политика SLA не найдена.");
        policy.Name = RequireName(request.Name);
        policy.FirstResponseMinutes = Math.Clamp(request.FirstResponseMinutes, 5, 60 * 24 * 30);
        policy.ResolutionMinutes = Math.Clamp(request.ResolutionMinutes, 5, 60 * 24 * 90);
        if (request.PauseStatusTitles != null)
            policy.PauseStatusTitlesJson = JsonSerializer.Serialize(request.PauseStatusTitles, Json);
        if (request.CalendarJson != null) policy.CalendarJson = request.CalendarJson.Trim();
        await _db.SaveChangesAsync(ct);
        return MapPolicy(policy);
    }

    public async Task DeletePolicyAsync(Guid boardId, Guid id, Guid userId, CancellationToken ct)
    {
        await EnsureManageAsync(boardId, userId, ct);
        var policy = await _db.SlaPolicies.FirstOrDefaultAsync(p => p.Id == id && p.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Политика SLA не найдена.");
        _db.SlaPolicies.Remove(policy);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<PortalCatalogDto>> ListPortalsAsync(Guid userId, CancellationToken ct)
    {
        var teamIds = await _db.TeamMembers.AsNoTracking().Where(m => m.UserId == userId).Select(m => m.TeamId).ToListAsync(ct);
        var owned = await _db.Teams.AsNoTracking().Where(t => t.OwnerId == userId).Select(t => t.Id).ToListAsync(ct);
        teamIds = teamIds.Concat(owned).Distinct().ToList();
        var boards = await (
            from s in _db.ServiceDeskSettings.AsNoTracking()
            join b in _db.Boards.AsNoTracking() on s.BoardId equals b.Id
            where s.Enabled && teamIds.Contains(b.TeamId)
            orderby b.Name
            select new { Settings = s, Board = b }).ToListAsync(ct);
        var result = new List<PortalCatalogDto>();
        foreach (var row in boards)
        {
            var access = await _access.GetBoardAccessAsync(row.Board.Id, userId, ct);
            if (access.Permission == null || access.Permission < BoardPermission.View) continue;
            var types = await _db.ServiceRequestTypes.AsNoTracking()
                .Where(t => t.BoardId == row.Board.Id && t.IsEnabled)
                .OrderBy(t => t.Order).ThenBy(t => t.Name).ToListAsync(ct);
            result.Add(new PortalCatalogDto(row.Board.Id, row.Board.Name, row.Settings.PortalSlug, row.Settings.WelcomeTitle,
                row.Settings.WelcomeText, types.Select(MapType).ToList()));
        }
        return result;
    }

    public async Task<PortalCatalogDto> GetPortalAsync(string slug, Guid userId, CancellationToken ct)
    {
        var settings = await _db.ServiceDeskSettings.AsNoTracking().FirstOrDefaultAsync(s => s.PortalSlug == slug && s.Enabled, ct)
            ?? throw new KeyNotFoundException("Портал не найден.");
        await EnsureBrowseAsync(settings.BoardId, userId, ct);
        var board = await BoardAsync(settings.BoardId, ct);
        var types = await _db.ServiceRequestTypes.AsNoTracking()
            .Where(t => t.BoardId == board.Id && t.IsEnabled)
            .OrderBy(t => t.Order).ThenBy(t => t.Name).ToListAsync(ct);
        return new PortalCatalogDto(board.Id, board.Name, settings.PortalSlug, settings.WelcomeTitle, settings.WelcomeText, types.Select(MapType).ToList());
    }

    public async Task<PortalRequestDto> CreatePortalRequestAsync(string slug, Guid typeId, Guid userId, CreatePortalRequestRequest request, CancellationToken ct)
    {
        var settings = await _db.ServiceDeskSettings.AsNoTracking().FirstOrDefaultAsync(s => s.PortalSlug == slug && s.Enabled, ct)
            ?? throw new KeyNotFoundException("Портал не найден.");
        await EnsureBrowseAsync(settings.BoardId, userId, ct);
        if (!await _permissions.HasAsync(settings.BoardId, userId, JiraPermissions.Create, ct))
            throw new UnauthorizedAccessException("Недостаточно прав для создания заявки.");
        var type = await _db.ServiceRequestTypes.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == typeId && t.BoardId == settings.BoardId && t.IsEnabled, ct)
            ?? throw new KeyNotFoundException("Тип запроса не найден.");
        var fields = ParseFields(type.FieldsJson);
        var answers = request.Answers ?? new Dictionary<string, string>();
        foreach (var field in fields)
        {
            var value = (answers.GetValueOrDefault(field.Id) ?? "").Trim();
            if (field.Required && value.Length == 0) throw new ArgumentException($"Заполните поле «{field.Label}».");
            if (value.Length > 10_000) throw new ArgumentException($"Слишком длинный ответ в поле «{field.Label}».");
            if (value.Length > 0 && field.Type == "select" && !(field.Options ?? Array.Empty<string>()).Contains(value))
                throw new ArgumentException($"Выберите вариант из списка в поле «{field.Label}».");
        }
        var summaryField = fields.FirstOrDefault(f => f.Type == "summary");
        var title = (request.Summary ?? (summaryField != null ? answers.GetValueOrDefault(summaryField.Id) : null) ?? type.Name).Trim();
        if (title.Length == 0) title = type.Name;
        if (title.Length > 255) title = title[..255];
        var description = new StringBuilder();
        foreach (var field in fields.Where(f => f.Type != "summary"))
        {
            var value = (answers.GetValueOrDefault(field.Id) ?? "").Trim();
            if (value.Length == 0) continue;
            description.Append("**").Append(field.Label).Append("**\n\n").Append(value).Append("\n\n");
        }
        description.Append("_Создано из портала: ").Append(type.Name).Append('_');
        var column = await _db.Columns.AsNoTracking()
            .Where(c => c.BoardId == settings.BoardId && c.Kind != ColumnKind.Archive && c.Kind != ColumnKind.Done)
            .OrderBy(c => c.Order).FirstOrDefaultAsync(ct)
            ?? throw new InvalidOperationException("В разделе нет колонок для новых заявок.");
        var quest = await _quests.CreateAsync(new CreateQuestRequest(
            title, description.ToString(), column.Id, null, null, QuestCategory.Frontend, 10, false, null,
            null, null, null, IssueType: type.IssueType), userId, ct);
        var entity = await _db.Quests.FirstAsync(q => q.Id == quest.Id, ct);
        entity.RequestTypeId = type.Id;
        await _db.SaveChangesAsync(ct);
        if (type.SlaPolicyId is Guid policyId)
            await StartClocksAsync(entity.Id, policyId, ct);
        return await GetPortalRequestAsync(slug, quest.Id, userId, ct);
    }

    public async Task<IReadOnlyList<PortalRequestSummaryDto>> MyRequestsAsync(Guid userId, string? slug, CancellationToken ct)
    {
        var query =
            from q in _db.Quests.AsNoTracking()
            join b in _db.Boards.AsNoTracking() on q.BoardId equals b.Id
            join s in _db.ServiceDeskSettings.AsNoTracking() on b.Id equals s.BoardId
            where q.ReporterId == userId && s.Enabled && q.RequestTypeId != null
            select new { Quest = q, Board = b, Settings = s, StatusTitle = q.Column.Title, StatusKind = (int)q.Column.Kind };
        if (!string.IsNullOrWhiteSpace(slug))
            query = query.Where(x => x.Settings.PortalSlug == slug);
        var rows = await query.OrderByDescending(x => x.Quest.CreatedAt).Take(100).ToListAsync(ct);
        var typeIds = rows.Select(r => r.Quest.RequestTypeId).Where(id => id.HasValue).Select(id => id!.Value).Distinct().ToList();
        var types = await _db.ServiceRequestTypes.AsNoTracking().Where(t => typeIds.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t.Name, ct);
        var clocks = await LoadClocksAsync(rows.Select(r => r.Quest.Id).ToList(), ct);
        return rows.Select(r => new PortalRequestSummaryDto(
            r.Quest.Id, r.Board.Id, r.Board.Name, r.Settings.PortalSlug, r.Quest.IssueKey, r.Quest.Title, r.StatusTitle, r.StatusKind,
            r.Quest.CreatedAt, r.Quest.RequestTypeId is Guid tid ? types.GetValueOrDefault(tid) : null,
            clocks.GetValueOrDefault(r.Quest.Id) ?? Array.Empty<SlaClockDto>())).ToList();
    }

    public async Task<PortalRequestDto> GetPortalRequestAsync(string slug, Guid questId, Guid userId, CancellationToken ct)
    {
        var settings = await _db.ServiceDeskSettings.AsNoTracking().FirstOrDefaultAsync(s => s.PortalSlug == slug && s.Enabled, ct)
            ?? throw new KeyNotFoundException("Портал не найден.");
        var quest = await _db.Quests.AsNoTracking().Include(q => q.Column).Include(q => q.Board).Include(q => q.Assignee)
            .FirstOrDefaultAsync(q => q.Id == questId && q.BoardId == settings.BoardId, ct)
            ?? throw new KeyNotFoundException("Заявка не найдена.");
        var isAgent = await IsAgentAsync(settings.BoardId, userId, ct);
        if (!isAgent && quest.ReporterId != userId)
            throw new UnauthorizedAccessException("Можно открывать только свои заявки.");
        if (!isAgent) await EnsureBrowseAsync(settings.BoardId, userId, ct);
        else await EnsureAgentAsync(settings.BoardId, userId, ct);
        var typeName = quest.RequestTypeId == null ? null
            : await _db.ServiceRequestTypes.AsNoTracking().Where(t => t.Id == quest.RequestTypeId).Select(t => t.Name).FirstOrDefaultAsync(ct);
        var comments = (await _collaboration.GetCommentsAsync(questId, userId, ct)).Comments;
        var clocks = (await LoadClocksAsync(new[] { questId }, ct)).GetValueOrDefault(questId) ?? Array.Empty<SlaClockDto>();
        var approvals = await ListApprovalsForQuestAsync(questId, userId, ct);
        return new PortalRequestDto(quest.Id, quest.BoardId, quest.Board.Name, quest.IssueKey, quest.Title, quest.Description,
            quest.Column.Title, (int)quest.Column.Kind, quest.CreatedAt, quest.CompletedAt, typeName, quest.RequestTypeId,
            quest.Assignee?.DisplayName, clocks, comments, approvals);
    }

    public async Task<QuestCommentDto> AddPortalCommentAsync(string slug, Guid questId, Guid userId, ServiceDeskPortalCommentRequest request, CancellationToken ct)
    {
        var detail = await GetPortalRequestAsync(slug, questId, userId, ct);
        if (request.IsInternal && !await IsAgentAsync(detail.BoardId, userId, ct))
            throw new UnauthorizedAccessException("Внутренние заметки доступны только агентам.");
        if (string.IsNullOrWhiteSpace(request.Text) || request.Text.Trim().Length > 5000)
            throw new ArgumentException("Комментарий должен содержать от 1 до 5000 символов.");
        var result = await _collaboration.AddCommentAsync(questId, userId, request.Text, request.DocumentJson, ct, request.IsInternal);
        if (result.Status != QuestAttachmentOperationStatus.Success || result.Comment == null)
            throw new UnauthorizedAccessException("Не удалось добавить комментарий.");
        return result.Comment;
    }

    public async Task<ApprovalRequestDto> CreateApprovalAsync(Guid boardId, Guid questId, Guid userId, CreateApprovalRequest request, CancellationToken ct)
    {
        await EnsureAgentAsync(boardId, userId, ct);
        var quest = await _db.Quests.AsNoTracking().FirstOrDefaultAsync(q => q.Id == questId && q.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Заявка не найдена.");
        var users = (request.ApproverUserIds ?? Array.Empty<Guid>()).Distinct().ToList();
        var groups = (request.ApproverGroupIds ?? Array.Empty<Guid>()).Distinct().ToList();
        if (users.Count + groups.Count == 0) throw new ArgumentException("Укажите хотя бы одного согласующего.");
        var approval = new ApprovalRequest
        {
            Id = Guid.NewGuid(),
            QuestId = quest.Id,
            BoardId = boardId,
            Title = string.IsNullOrWhiteSpace(request.Title) ? "Согласование" : request.Title.Trim()[..Math.Min(200, request.Title.Trim().Length)],
            Status = ApprovalStatuses.Pending,
            RequiredApprovals = Math.Clamp(request.RequiredApprovals <= 0 ? 1 : request.RequiredApprovals, 1, users.Count + groups.Count),
            BlockedTransitionKey = string.IsNullOrWhiteSpace(request.BlockedTransitionKey) ? null : request.BlockedTransitionKey.Trim(),
            CreatedByUserId = userId,
            CreatedAt = DateTime.UtcNow,
        };
        _db.ApprovalRequests.Add(approval);
        foreach (var id in users)
            _db.ApprovalDecisions.Add(new ApprovalDecision { Id = Guid.NewGuid(), ApprovalRequestId = approval.Id, ApproverUserId = id, Status = ApprovalStatuses.Pending });
        foreach (var id in groups)
            _db.ApprovalDecisions.Add(new ApprovalDecision { Id = Guid.NewGuid(), ApprovalRequestId = approval.Id, ApproverGroupId = id, Status = ApprovalStatuses.Pending });
        await _db.SaveChangesAsync(ct);
        await _notifications.NotifyAsync(questId, userId, "Требуется согласование", approval.Title, ct, NotificationEvents.ApprovalPending);
        return (await ListApprovalsForQuestAsync(questId, userId, ct)).First(a => a.Id == approval.Id);
    }

    public async Task<ApprovalRequestDto> DecideApprovalAsync(Guid approvalId, Guid userId, DecideApprovalRequest request, CancellationToken ct)
    {
        var approval = await _db.ApprovalRequests.Include(a => a.Decisions)
            .FirstOrDefaultAsync(a => a.Id == approvalId, ct)
            ?? throw new KeyNotFoundException("Согласование не найдено.");
        if (approval.Status != ApprovalStatuses.Pending) throw new InvalidOperationException("Согласование уже завершено.");
        var groupIds = await _db.UserGroupMembers.AsNoTracking().Where(m => m.UserId == userId).Select(m => m.GroupId).ToListAsync(ct);
        var decision = approval.Decisions.FirstOrDefault(d => d.Status == ApprovalStatuses.Pending
            && (d.ApproverUserId == userId || (d.ApproverGroupId != null && groupIds.Contains(d.ApproverGroupId.Value))));
        if (decision == null)
        {
            if (!await _permissions.HasOnQuestAsync(approval.QuestId, userId, JiraPermissions.ApproveRequests, ct))
                throw new UnauthorizedAccessException("Вы не можете согласовать эту заявку.");
            decision = new ApprovalDecision { Id = Guid.NewGuid(), ApprovalRequestId = approval.Id, ApproverUserId = userId, Status = ApprovalStatuses.Pending };
            _db.ApprovalDecisions.Add(decision);
            approval.Decisions.Add(decision);
        }
        decision.Status = request.Approve ? ApprovalStatuses.Approved : ApprovalStatuses.Rejected;
        decision.Comment = TrimOptional(request.Comment, 2000);
        decision.DecidedAt = DateTime.UtcNow;
        if (!request.Approve)
        {
            approval.Status = ApprovalStatuses.Rejected;
            approval.DecidedAt = DateTime.UtcNow;
        }
        else if (approval.Decisions.Count(d => d.Status == ApprovalStatuses.Approved) >= approval.RequiredApprovals)
        {
            approval.Status = ApprovalStatuses.Approved;
            approval.DecidedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync(ct);
        await _notifications.NotifyAsync(approval.QuestId, userId, "Согласование завершено",
            $"{approval.Title}: {(request.Approve ? "одобрено" : "отклонено")}", ct, NotificationEvents.ApprovalDecided);
        return (await ListApprovalsForQuestAsync(approval.QuestId, userId, ct)).First(a => a.Id == approval.Id);
    }

    public async Task EnsureTransitionAllowedAsync(Guid questId, string? transitionKey, Guid userId, CancellationToken ct)
    {
        var blocked = await _db.ApprovalRequests.AsNoTracking()
            .AnyAsync(a => a.QuestId == questId && a.Status == ApprovalStatuses.Pending
                && (a.BlockedTransitionKey == null || a.BlockedTransitionKey == transitionKey), ct);
        if (blocked) throw new InvalidOperationException("Переход заблокирован: требуется согласование.");
    }

    public async Task OnQuestMovedAsync(Guid questId, string statusTitle, ColumnKind kind, CancellationToken ct)
    {
        var clocks = await _db.SlaClocks.Include(c => c.Policy).Where(c => c.QuestId == questId
            && (c.Status == SlaClockStatuses.Running || c.Status == SlaClockStatuses.Paused)).ToListAsync(ct);
        if (clocks.Count == 0) return;
        var now = DateTime.UtcNow;
        foreach (var clock in clocks)
        {
            var pauseTitles = ParseStringList(clock.Policy.PauseStatusTitlesJson);
            var shouldPause = pauseTitles.Any(t => string.Equals(t, statusTitle, StringComparison.OrdinalIgnoreCase));
            if (kind == ColumnKind.Done && clock.Metric == SlaMetrics.Resolution)
            {
                CompleteClock(clock, now);
                continue;
            }
            if (shouldPause && clock.Status == SlaClockStatuses.Running)
            {
                clock.Status = SlaClockStatuses.Paused;
                clock.PausedAt = now;
            }
            else if (!shouldPause && clock.Status == SlaClockStatuses.Paused && clock.PausedAt is DateTime pausedAt)
            {
                var pausedMinutes = Math.Max(0, (int)(now - pausedAt).TotalMinutes);
                clock.TargetAt = clock.TargetAt.AddMinutes(pausedMinutes);
                clock.PausedAt = null;
                clock.Status = SlaClockStatuses.Running;
            }
        }
        await _db.SaveChangesAsync(ct);
    }

    public static async Task TryCompleteFirstResponseAsync(CanbanDbContext db, Guid questId, Guid authorId, CancellationToken ct)
    {
        var quest = await db.Quests.AsNoTracking().FirstOrDefaultAsync(q => q.Id == questId, ct);
        if (quest == null || quest.ReporterId == authorId) return;
        var clock = await db.SlaClocks.FirstOrDefaultAsync(c => c.QuestId == questId
            && c.Metric == SlaMetrics.FirstResponse
            && (c.Status == SlaClockStatuses.Running || c.Status == SlaClockStatuses.Paused), ct);
        if (clock == null) return;
        CompleteClock(clock, DateTime.UtcNow);
        await db.SaveChangesAsync(ct);
    }

    public async Task<int> ProcessDueClocksAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var due = await _db.SlaClocks.Include(c => c.Policy)
            .Where(c => c.Status == SlaClockStatuses.Running && c.TargetAt <= now)
            .OrderBy(c => c.TargetAt).Take(100).ToListAsync(ct);
        var warned = await _db.SlaClocks.Include(c => c.Policy)
            .Where(c => c.Status == SlaClockStatuses.Running && c.WarnedAt == null && c.TargetAt > now && c.TargetAt <= now.AddMinutes(60))
            .OrderBy(c => c.TargetAt).Take(100).ToListAsync(ct);
        foreach (var clock in due)
        {
            clock.Status = SlaClockStatuses.Breached;
            clock.BreachedAt = now;
            await _notifications.NotifyAsync(clock.QuestId, Guid.Empty, "Нарушение SLA",
                $"{clock.Policy.Name}: {MetricLabel(clock.Metric)}", ct, NotificationEvents.SlaBreached);
        }
        foreach (var clock in warned)
        {
            clock.WarnedAt = now;
            await _notifications.NotifyAsync(clock.QuestId, Guid.Empty, "Предупреждение SLA",
                $"{clock.Policy.Name}: {MetricLabel(clock.Metric)} истекает менее чем через час", ct, NotificationEvents.SlaWarning);
        }
        if (due.Count + warned.Count > 0) await _db.SaveChangesAsync(ct);
        return due.Count + warned.Count;
    }

    private async Task StartClocksAsync(Guid questId, Guid policyId, CancellationToken ct)
    {
        var policy = await _db.SlaPolicies.AsNoTracking().FirstOrDefaultAsync(p => p.Id == policyId, ct);
        if (policy == null) return;
        var now = DateTime.UtcNow;
        _db.SlaClocks.Add(new SlaClock
        {
            Id = Guid.NewGuid(), QuestId = questId, PolicyId = policy.Id, Metric = SlaMetrics.FirstResponse,
            Status = SlaClockStatuses.Running, StartedAt = now, TargetAt = now.AddMinutes(policy.FirstResponseMinutes),
        });
        _db.SlaClocks.Add(new SlaClock
        {
            Id = Guid.NewGuid(), QuestId = questId, PolicyId = policy.Id, Metric = SlaMetrics.Resolution,
            Status = SlaClockStatuses.Running, StartedAt = now, TargetAt = now.AddMinutes(policy.ResolutionMinutes),
        });
        await _db.SaveChangesAsync(ct);
    }

    private static void CompleteClock(SlaClock clock, DateTime now)
    {
        clock.CompletedAt = now;
        clock.Status = clock.BreachedAt != null || now > clock.TargetAt ? SlaClockStatuses.Breached : SlaClockStatuses.Met;
        if (clock.Status == SlaClockStatuses.Breached && clock.BreachedAt == null) clock.BreachedAt = now;
        clock.PausedAt = null;
    }

    private async Task<Dictionary<Guid, IReadOnlyList<SlaClockDto>>> LoadClocksAsync(IReadOnlyList<Guid> questIds, CancellationToken ct)
    {
        if (questIds.Count == 0) return new();
        var rows = await _db.SlaClocks.AsNoTracking().Include(c => c.Policy)
            .Where(c => questIds.Contains(c.QuestId)).ToListAsync(ct);
        var now = DateTime.UtcNow;
        return rows.GroupBy(c => c.QuestId).ToDictionary(g => g.Key, g => (IReadOnlyList<SlaClockDto>)g.Select(c => MapClock(c, now)).ToList());
    }

    private async Task<IReadOnlyList<ApprovalRequestDto>> ListApprovalsForQuestAsync(Guid questId, Guid userId, CancellationToken ct)
    {
        var approvals = await _db.ApprovalRequests.AsNoTracking().Include(a => a.Decisions)
            .Where(a => a.QuestId == questId).OrderByDescending(a => a.CreatedAt).ToListAsync(ct);
        var userIds = approvals.SelectMany(a => a.Decisions).Where(d => d.ApproverUserId.HasValue).Select(d => d.ApproverUserId!.Value).Distinct().ToList();
        var groupIds = approvals.SelectMany(a => a.Decisions).Where(d => d.ApproverGroupId.HasValue).Select(d => d.ApproverGroupId!.Value).Distinct().ToList();
        var users = await _db.Users.AsNoTracking().Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);
        var groups = await _db.UserGroups.AsNoTracking().Where(g => groupIds.Contains(g.Id)).ToDictionaryAsync(g => g.Id, g => g.Name, ct);
        var myGroups = await _db.UserGroupMembers.AsNoTracking().Where(m => m.UserId == userId).Select(m => m.GroupId).ToListAsync(ct);
        return approvals.Select(a =>
        {
            var canDecide = a.Status == ApprovalStatuses.Pending && (
                a.Decisions.Any(d => d.Status == ApprovalStatuses.Pending && (d.ApproverUserId == userId || (d.ApproverGroupId != null && myGroups.Contains(d.ApproverGroupId.Value))))
                || false);
            return new ApprovalRequestDto(a.Id, a.QuestId, a.BoardId, a.Title, a.Status, a.RequiredApprovals, a.BlockedTransitionKey,
                a.CreatedAt, a.DecidedAt, canDecide,
                a.Decisions.Select(d => new ApprovalDecisionDto(d.Id, d.ApproverUserId,
                    d.ApproverUserId is Guid uid ? users.GetValueOrDefault(uid) : null,
                    d.ApproverGroupId, d.ApproverGroupId is Guid gid ? groups.GetValueOrDefault(gid) : null,
                    d.Status, d.Comment, d.DecidedAt)).ToList());
        }).ToList();
    }

    private async Task EnsureDefaultCatalogAsync(Guid boardId, CancellationToken ct)
    {
        if (await _db.ServiceQueues.AnyAsync(q => q.BoardId == boardId, ct)) return;
        var open = new ServiceQueue
        {
            Id = Guid.NewGuid(), BoardId = boardId, Name = "Открытые заявки",
            Description = "Все незакрытые обращения", Jql = "statusCategory != Done ORDER BY created ASC", Order = 0,
        };
        var unassigned = new ServiceQueue
        {
            Id = Guid.NewGuid(), BoardId = boardId, Name = "Без исполнителя",
            Description = "Новые заявки без назначения", Jql = "assignee is EMPTY AND statusCategory != Done ORDER BY created ASC", Order = 1,
        };
        var policy = new SlaPolicy
        {
            Id = Guid.NewGuid(), BoardId = boardId, Name = "Стандартный SLA",
            FirstResponseMinutes = 240, ResolutionMinutes = 1440,
        };
        var type = new ServiceRequestType
        {
            Id = Guid.NewGuid(), BoardId = boardId, Name = "Обращение в поддержку",
            Description = "Общий запрос в ИТ-поддержку", Icon = "help", IssueType = IssueType.Task,
            QueueId = open.Id, SlaPolicyId = policy.Id, Order = 0, IsEnabled = true,
            FieldsJson = JsonSerializer.Serialize(new[]
            {
                new ServiceDeskFieldDto("summary", "Тема", "summary", true),
                new ServiceDeskFieldDto("details", "Описание", "paragraph", true),
            }, Json),
        };
        _db.ServiceQueues.AddRange(open, unassigned);
        _db.SlaPolicies.Add(policy);
        _db.ServiceRequestTypes.Add(type);
    }

    private async Task EnableFeatureAsync(Board board, CancellationToken ct)
    {
        var features = (board.Features ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (features.Add("service-desk") | features.Add("forms"))
        {
            board.Features = SpaceTemplates.NormalizeFeatures(features);
            await _db.SaveChangesAsync(ct);
        }
    }

    private async Task<int> CountQueueAsync(ServiceQueue queue, Guid userId, CancellationToken ct)
    {
        try
        {
            var key = await ProjectKeyAsync(queue.BoardId, ct);
            var jql = queue.Jql.Contains("project", StringComparison.OrdinalIgnoreCase) ? queue.Jql : $"project = {key} AND ({queue.Jql})";
            var search = await _jql.SearchAsync(jql, userId, 1, 1, queue.BoardId, ct);
            return search.Total;
        }
        catch { return 0; }
    }

    private async Task<string> ProjectKeyAsync(Guid boardId, CancellationToken ct) =>
        await _db.Boards.AsNoTracking().Where(b => b.Id == boardId).Select(b => b.KeyPrefix).FirstAsync(ct);

    private async Task<Board> BoardAsync(Guid boardId, CancellationToken ct) =>
        await _db.Boards.FirstOrDefaultAsync(b => b.Id == boardId, ct) ?? throw new KeyNotFoundException("Раздел не найден.");

    private async Task<ServiceDeskSettings> EnsureSettingsEntityAsync(Board board, CancellationToken ct)
    {
        var settings = await _db.ServiceDeskSettings.FirstOrDefaultAsync(s => s.BoardId == board.Id, ct);
        if (settings != null) return settings;
        settings = new ServiceDeskSettings
        {
            BoardId = board.Id,
            Enabled = false,
            PortalSlug = SuggestSlug(board.Name, board.KeyPrefix),
            WelcomeTitle = "Центр поддержки",
            WelcomeText = "Выберите тип запроса или откройте свои заявки.",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        _db.ServiceDeskSettings.Add(settings);
        await _db.SaveChangesAsync(ct);
        return settings;
    }

    private async Task EnsureBrowseAsync(Guid boardId, Guid userId, CancellationToken ct) =>
        await _access.EnsureBoardPermissionAsync(boardId, userId, BoardPermission.View, ct);

    private async Task EnsureAgentAsync(Guid boardId, Guid userId, CancellationToken ct)
    {
        if (!await IsAgentAsync(boardId, userId, ct))
            throw new UnauthorizedAccessException("Недостаточно прав агента Service Desk.");
    }

    private async Task EnsureManageAsync(Guid boardId, Guid userId, CancellationToken ct)
    {
        if (!await CanManageAsync(boardId, userId, ct))
            throw new UnauthorizedAccessException("Недостаточно прав для настройки Service Desk.");
    }

    private async Task<bool> IsAgentAsync(Guid boardId, Guid userId, CancellationToken ct)
    {
        if (await _permissions.HasAsync(boardId, userId, JiraPermissions.ServiceDeskAgent, ct)
            || await _permissions.HasAsync(boardId, userId, JiraPermissions.ManageServiceDesk, ct))
            return true;
        var access = await _access.GetBoardAccessAsync(boardId, userId, ct);
        return access.Permission >= BoardPermission.Work;
    }

    private async Task<bool> CanManageAsync(Guid boardId, Guid userId, CancellationToken ct)
    {
        if (await _permissions.HasAsync(boardId, userId, JiraPermissions.ManageServiceDesk, ct)) return true;
        var access = await _access.GetBoardAccessAsync(boardId, userId, ct);
        return access.Permission >= BoardPermission.Manage;
    }

    private static string SuggestSlug(string name, string? key)
    {
        var raw = string.IsNullOrWhiteSpace(key) ? name : key;
        var slug = Regex.Replace(raw.Trim().ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        if (slug.Length < 2) slug = "support";
        if (slug.Length > 64) slug = slug[..64].Trim('-');
        return slug;
    }

    private static string RequireName(string? name)
    {
        var value = (name ?? "").Trim();
        if (value.Length is < 1 or > 120) throw new ArgumentException("Название — от 1 до 120 символов.");
        return value;
    }

    private static string? TrimOptional(string? value, int max)
    {
        if (value == null) return null;
        var trimmed = value.Trim();
        if (trimmed.Length == 0) return null;
        if (trimmed.Length > max) throw new ArgumentException($"Текст не длиннее {max} символов.");
        return trimmed;
    }

    private static string SerializeFields(IReadOnlyList<ServiceDeskFieldDto>? fields)
    {
        var list = (fields ?? Array.Empty<ServiceDeskFieldDto>()).Select((f, i) => new ServiceDeskFieldDto(
            string.IsNullOrWhiteSpace(f.Id) ? $"f{i + 1}" : f.Id.Trim(),
            string.IsNullOrWhiteSpace(f.Label) ? $"Поле {i + 1}" : f.Label.Trim(),
            string.IsNullOrWhiteSpace(f.Type) ? "text" : f.Type.Trim().ToLowerInvariant(),
            f.Required, f.Options)).Take(50).ToList();
        if (list.Count == 0)
            list.Add(new ServiceDeskFieldDto("summary", "Тема", "summary", true));
        return JsonSerializer.Serialize(list, Json);
    }

    private static IReadOnlyList<ServiceDeskFieldDto> ParseFields(string json)
    {
        try { return JsonSerializer.Deserialize<List<ServiceDeskFieldDto>>(json, Json) ?? new(); }
        catch (JsonException) { return Array.Empty<ServiceDeskFieldDto>(); }
    }

    private static IReadOnlyList<string> ParseStringList(string json)
    {
        try { return JsonSerializer.Deserialize<List<string>>(json, Json) ?? new(); }
        catch (JsonException) { return Array.Empty<string>(); }
    }

    private static ServiceDeskSettingsDto MapSettings(ServiceDeskSettings s, string boardName, bool isAgent, bool canManage) =>
        new(s.BoardId, boardName, s.Enabled, s.PortalSlug, s.WelcomeTitle, s.WelcomeText, isAgent, canManage);

    private static ServiceRequestTypeDto MapType(ServiceRequestType t) =>
        new(t.Id, t.BoardId, t.Name, t.Description, t.Icon, t.IssueType, t.FormId, t.QueueId, t.SlaPolicyId, ParseFields(t.FieldsJson), t.Order, t.IsEnabled);

    private static ServiceQueueDto MapQueue(ServiceQueue q, int? count = null) =>
        new(q.Id, q.BoardId, q.Name, q.Description, q.Jql, q.Order, q.DefaultGroupId, count);

    private static SlaPolicyDto MapPolicy(SlaPolicy p) =>
        new(p.Id, p.BoardId, p.Name, p.FirstResponseMinutes, p.ResolutionMinutes, ParseStringList(p.PauseStatusTitlesJson), p.CalendarJson);

    private static SlaClockDto MapClock(SlaClock c, DateTime now)
    {
        var remaining = c.Status is SlaClockStatuses.Met or SlaClockStatuses.Breached
            ? 0
            : Math.Max(0, (int)((c.PausedAt ?? c.TargetAt) - (c.Status == SlaClockStatuses.Paused ? c.PausedAt!.Value : now)).TotalMinutes
                + (c.Status == SlaClockStatuses.Paused ? (int)(c.TargetAt - c.PausedAt!.Value).TotalMinutes : (int)(c.TargetAt - now).TotalMinutes));
        if (c.Status == SlaClockStatuses.Running) remaining = Math.Max(0, (int)(c.TargetAt - now).TotalMinutes);
        if (c.Status == SlaClockStatuses.Paused && c.PausedAt is DateTime paused)
            remaining = Math.Max(0, (int)(c.TargetAt - paused).TotalMinutes);
        return new SlaClockDto(c.Id, c.QuestId, c.Metric, c.Status, c.StartedAt, c.TargetAt, c.PausedAt, c.CompletedAt, c.BreachedAt, remaining, c.Policy.Name);
    }

    private static string MetricLabel(string metric) => metric == SlaMetrics.FirstResponse ? "первый ответ" : "решение";
}
