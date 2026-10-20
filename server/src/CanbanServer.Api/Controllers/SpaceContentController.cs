using System.Text;
using System.Text.Json;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Api.Controllers;

public record SaveSpaceDocumentRequest(string? Title, string? Content, Guid? ParentId);
public record SpaceFormField(string Id, string Label, string Type, bool Required, List<string>? Options);
public record SaveSpaceFormRequest(string? Title, string? Description, IssueType? IssueType, List<SpaceFormField>? Fields, bool? IsOpen);
public record SubmitSpaceFormRequest(Dictionary<string, string?> Answers);

/// <summary>Jira-like space tabs that are not issue views: «Документы», «Формы», «Среда разработки» and the summary activity feed.</summary>
[ApiController]
[Route("api/spaces/{boardId:guid}")]
public class SpaceContentController : ControllerBase
{
    private static readonly string[] FieldTypes = { "summary", "text", "paragraph", "number", "date", "select", "email" };
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly CanbanDbContext _db;
    private readonly IProjectAccessService _access;
    private readonly IQuestService _quests;

    public SpaceContentController(CanbanDbContext db, IProjectAccessService access, IQuestService quests)
    {
        _db = db;
        _access = access;
        _quests = quests;
    }

    private Guid Me => User.GetUserId() ?? throw new UnauthorizedAccessException();

    private Task EnsureAsync(Guid boardId, BoardPermission required, CancellationToken ct) =>
        _access.EnsureBoardPermissionAsync(boardId, Me, required, ct);

    private async Task<Dictionary<Guid, User>> UsersAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var set = ids.Distinct().ToList();
        return await _db.Users.AsNoTracking().Where(u => set.Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);
    }

    private static object? Person(Dictionary<Guid, User> users, Guid? id) =>
        id.HasValue && users.TryGetValue(id.Value, out var u) ? new { id = u.Id, displayName = u.DisplayName, avatarUrl = u.AvatarUrl } : null;

    // ---------- Документы ----------

    [HttpGet("docs")]
    public async Task<ActionResult> ListDocs(Guid boardId, CancellationToken ct)
    {
        await EnsureAsync(boardId, BoardPermission.View, ct);
        var docs = await _db.SpaceDocuments.AsNoTracking().Where(d => d.BoardId == boardId).OrderByDescending(d => d.UpdatedAt)
            .Select(d => new { d.Id, d.ParentId, d.Title, d.CreatedByUserId, d.UpdatedByUserId, d.CreatedAt, d.UpdatedAt, Length = d.Content.Length })
            .ToListAsync(ct);
        var users = await UsersAsync(docs.SelectMany(d => new[] { d.CreatedByUserId, d.UpdatedByUserId }), ct);
        return Ok(docs.Select(d => new
        {
            id = d.Id, parentId = d.ParentId, title = d.Title, createdAt = d.CreatedAt, updatedAt = d.UpdatedAt, length = d.Length,
            createdBy = Person(users, d.CreatedByUserId), updatedBy = Person(users, d.UpdatedByUserId),
        }));
    }

    private async Task<object> DocDto(SpaceDocument d, CancellationToken ct)
    {
        var users = await UsersAsync(new[] { d.CreatedByUserId, d.UpdatedByUserId }, ct);
        return new
        {
            id = d.Id, boardId = d.BoardId, parentId = d.ParentId, title = d.Title, content = d.Content, createdAt = d.CreatedAt, updatedAt = d.UpdatedAt,
            createdBy = Person(users, d.CreatedByUserId), updatedBy = Person(users, d.UpdatedByUserId),
        };
    }

    [HttpGet("docs/{id:guid}")]
    public async Task<ActionResult> GetDoc(Guid boardId, Guid id, CancellationToken ct)
    {
        await EnsureAsync(boardId, BoardPermission.View, ct);
        var doc = await _db.SpaceDocuments.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id && d.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Документ не найден");
        return Ok(await DocDto(doc, ct));
    }

    private static string DocTitle(string? title) =>
        (title ?? "").Trim() is { Length: > 0 } t ? (t.Length > 255 ? throw new ArgumentException("Название не должно превышать 255 символов.") : t) : "Без названия";

    private static string DocContent(string? content) =>
        (content ?? "").Length > 200_000 ? throw new ArgumentException("Документ слишком большой.") : content ?? "";

    private async Task EnsureParentAsync(Guid boardId, Guid? parentId, Guid? selfId, CancellationToken ct)
    {
        if (!parentId.HasValue) return;
        if (parentId == selfId) throw new ArgumentException("Документ не может быть вложен сам в себя.");
        if (!await _db.SpaceDocuments.AnyAsync(d => d.Id == parentId && d.BoardId == boardId, ct))
            throw new ArgumentException("Родительский документ не найден.");
    }

    [HttpPost("docs")]
    public async Task<ActionResult> CreateDoc(Guid boardId, [FromBody] SaveSpaceDocumentRequest request, CancellationToken ct)
    {
        await EnsureAsync(boardId, BoardPermission.Work, ct);
        await EnsureParentAsync(boardId, request.ParentId, null, ct);
        var now = DateTime.UtcNow;
        var doc = new SpaceDocument
        {
            Id = Guid.NewGuid(), BoardId = boardId, ParentId = request.ParentId, Title = DocTitle(request.Title), Content = DocContent(request.Content),
            CreatedByUserId = Me, UpdatedByUserId = Me, CreatedAt = now, UpdatedAt = now,
        };
        _db.SpaceDocuments.Add(doc);
        await _db.SaveChangesAsync(ct);
        return Ok(await DocDto(doc, ct));
    }

    [HttpPut("docs/{id:guid}")]
    public async Task<ActionResult> UpdateDoc(Guid boardId, Guid id, [FromBody] SaveSpaceDocumentRequest request, CancellationToken ct)
    {
        await EnsureAsync(boardId, BoardPermission.Work, ct);
        var doc = await _db.SpaceDocuments.FirstOrDefaultAsync(d => d.Id == id && d.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Документ не найден");
        if (request.Title != null) doc.Title = DocTitle(request.Title);
        if (request.Content != null) doc.Content = DocContent(request.Content);
        if (request.ParentId != doc.ParentId)
        {
            await EnsureParentAsync(boardId, request.ParentId, id, ct);
            doc.ParentId = request.ParentId;
        }
        doc.UpdatedByUserId = Me;
        doc.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return Ok(await DocDto(doc, ct));
    }

    [HttpDelete("docs/{id:guid}")]
    public async Task<ActionResult> DeleteDoc(Guid boardId, Guid id, CancellationToken ct)
    {
        await EnsureAsync(boardId, BoardPermission.Work, ct);
        var all = await _db.SpaceDocuments.Where(d => d.BoardId == boardId).ToListAsync(ct);
        if (all.All(d => d.Id != id)) throw new KeyNotFoundException("Документ не найден");
        var doomed = new HashSet<Guid> { id };
        for (var grew = true; grew;)
        {
            var next = all.Where(d => d.ParentId.HasValue && doomed.Contains(d.ParentId.Value) && !doomed.Contains(d.Id)).Select(d => d.Id).ToList();
            grew = next.Count > 0;
            next.ForEach(x => doomed.Add(x));
        }
        _db.SpaceDocuments.RemoveRange(all.Where(d => doomed.Contains(d.Id)));
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---------- Формы ----------

    private static List<SpaceFormField> ParseFields(string json)
    {
        try { return JsonSerializer.Deserialize<List<SpaceFormField>>(json, Json) ?? new(); }
        catch (JsonException) { return new(); }
    }

    private static object FormDto(SpaceForm f) => new
    {
        id = f.Id, boardId = f.BoardId, title = f.Title, description = f.Description, issueType = f.IssueType, isOpen = f.IsOpen,
        submissionCount = f.SubmissionCount, fields = ParseFields(f.FieldsJson), createdAt = f.CreatedAt, updatedAt = f.UpdatedAt,
    };

    private static List<SpaceFormField> NormalizeFields(List<SpaceFormField>? fields)
    {
        var list = (fields ?? new()).Take(50).Select(f =>
        {
            var type = FieldTypes.Contains(f.Type) ? f.Type : "text";
            var label = (f.Label ?? "").Trim();
            if (label.Length == 0) throw new ArgumentException("У каждого поля должна быть подпись.");
            if (label.Length > 200) throw new ArgumentException("Подпись поля не должна превышать 200 символов.");
            var options = type == "select"
                ? (f.Options ?? new()).Select(o => o.Trim()).Where(o => o.Length > 0).Distinct().Take(50).ToList()
                : null;
            if (type == "select" && options!.Count == 0) throw new ArgumentException($"Добавьте варианты для поля «{label}».");
            var id = string.IsNullOrWhiteSpace(f.Id) ? Guid.NewGuid().ToString("N")[..8] : f.Id.Trim();
            return new SpaceFormField(id, label, type, type == "summary" || f.Required, options);
        }).ToList();
        if (list.Count(f => f.Type == "summary") != 1) throw new ArgumentException("В форме должно быть ровно одно поле «Название задачи».");
        if (list.Select(f => f.Id).Distinct().Count() != list.Count) throw new ArgumentException("Идентификаторы полей повторяются.");
        return list;
    }

    [HttpGet("forms")]
    public async Task<ActionResult> ListForms(Guid boardId, CancellationToken ct)
    {
        await EnsureAsync(boardId, BoardPermission.View, ct);
        var forms = await _db.SpaceForms.AsNoTracking().Where(f => f.BoardId == boardId).OrderByDescending(f => f.UpdatedAt).ToListAsync(ct);
        return Ok(forms.Select(FormDto));
    }

    [HttpGet("forms/{id:guid}")]
    public async Task<ActionResult> GetForm(Guid boardId, Guid id, CancellationToken ct)
    {
        await EnsureAsync(boardId, BoardPermission.View, ct);
        var form = await _db.SpaceForms.AsNoTracking().FirstOrDefaultAsync(f => f.Id == id && f.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Форма не найдена");
        return Ok(FormDto(form));
    }

    [HttpPost("forms")]
    public async Task<ActionResult> CreateForm(Guid boardId, [FromBody] SaveSpaceFormRequest request, CancellationToken ct)
    {
        await EnsureAsync(boardId, BoardPermission.Manage, ct);
        var now = DateTime.UtcNow;
        var fields = request.Fields is { Count: > 0 }
            ? NormalizeFields(request.Fields)
            : new List<SpaceFormField> { new("summary", "Название задачи", "summary", true, null), new("details", "Подробности", "paragraph", false, null) };
        var form = new SpaceForm
        {
            Id = Guid.NewGuid(), BoardId = boardId, Title = DocTitle(request.Title ?? "Новая форма"), Description = request.Description?.Trim(),
            IssueType = request.IssueType ?? IssueType.Task, FieldsJson = JsonSerializer.Serialize(fields, Json), IsOpen = request.IsOpen ?? true,
            CreatedByUserId = Me, CreatedAt = now, UpdatedAt = now,
        };
        _db.SpaceForms.Add(form);
        await _db.SaveChangesAsync(ct);
        return Ok(FormDto(form));
    }

    [HttpPut("forms/{id:guid}")]
    public async Task<ActionResult> UpdateForm(Guid boardId, Guid id, [FromBody] SaveSpaceFormRequest request, CancellationToken ct)
    {
        await EnsureAsync(boardId, BoardPermission.Manage, ct);
        var form = await _db.SpaceForms.FirstOrDefaultAsync(f => f.Id == id && f.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Форма не найдена");
        if (request.Title != null) form.Title = DocTitle(request.Title);
        if (request.Description != null)
        {
            var description = request.Description.Trim();
            if (description.Length > 2000) throw new ArgumentException("Описание не должно превышать 2000 символов.");
            form.Description = description.Length == 0 ? null : description;
        }
        if (request.IssueType.HasValue) form.IssueType = request.IssueType.Value;
        if (request.Fields != null) form.FieldsJson = JsonSerializer.Serialize(NormalizeFields(request.Fields), Json);
        if (request.IsOpen.HasValue) form.IsOpen = request.IsOpen.Value;
        form.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return Ok(FormDto(form));
    }

    [HttpDelete("forms/{id:guid}")]
    public async Task<ActionResult> DeleteForm(Guid boardId, Guid id, CancellationToken ct)
    {
        await EnsureAsync(boardId, BoardPermission.Manage, ct);
        var form = await _db.SpaceForms.FirstOrDefaultAsync(f => f.Id == id && f.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Форма не найдена");
        _db.SpaceForms.Remove(form);
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Turns a filled form into an issue in the space's first (to-do) column.</summary>
    [HttpPost("forms/{id:guid}/submit")]
    public async Task<ActionResult<QuestDto>> SubmitForm(Guid boardId, Guid id, [FromBody] SubmitSpaceFormRequest request, CancellationToken ct)
    {
        await EnsureAsync(boardId, BoardPermission.Work, ct);
        var form = await _db.SpaceForms.FirstOrDefaultAsync(f => f.Id == id && f.BoardId == boardId, ct)
            ?? throw new KeyNotFoundException("Форма не найдена");
        if (!form.IsOpen) throw new InvalidOperationException("Форма закрыта для новых ответов.");
        var answers = request.Answers ?? new();
        string Answer(SpaceFormField f) => (answers.GetValueOrDefault(f.Id) ?? "").Trim();

        var fields = ParseFields(form.FieldsJson);
        foreach (var f in fields)
        {
            var value = Answer(f);
            if (f.Required && value.Length == 0) throw new ArgumentException($"Заполните поле «{f.Label}».");
            if (value.Length > 10_000) throw new ArgumentException($"Слишком длинный ответ в поле «{f.Label}».");
            if (value.Length > 0 && f.Type == "select" && !(f.Options ?? new()).Contains(value)) throw new ArgumentException($"Выберите вариант из списка в поле «{f.Label}».");
            if (value.Length > 0 && f.Type == "number" && !decimal.TryParse(value, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out _))
                throw new ArgumentException($"В поле «{f.Label}» должно быть число.");
        }
        var summaryField = fields.FirstOrDefault(f => f.Type == "summary");
        var title = summaryField != null ? Answer(summaryField) : "";
        if (title.Length == 0) title = form.Title;
        if (title.Length > 255) title = title[..255];

        var description = new StringBuilder();
        foreach (var f in fields.Where(f => f.Type != "summary"))
        {
            var value = Answer(f);
            if (value.Length == 0) continue;
            description.Append("**").Append(f.Label).Append("**\n\n").Append(value).Append("\n\n");
        }
        description.Append("_Создано из формы «").Append(form.Title).Append("»_");

        var column = await _db.Columns.AsNoTracking().Where(c => c.BoardId == boardId && c.Kind != ColumnKind.Archive && c.Kind != ColumnKind.Done)
            .OrderBy(c => c.Order).FirstOrDefaultAsync(ct) ?? throw new InvalidOperationException("В разделе нет колонок для новых задач.");
        var quest = await _quests.CreateAsync(new CreateQuestRequest(
            title, description.ToString(), column.Id, null, null, QuestCategory.Frontend, 10, form.IssueType == IssueType.Epic, null,
            null, null, null, IssueType: form.IssueType), Me, ct);
        form.SubmissionCount += 1;
        await _db.SaveChangesAsync(ct);
        return Ok(quest);
    }

    // ---------- Сводка: недавняя активность ----------

    [HttpGet("activity")]
    public async Task<ActionResult> Activity(Guid boardId, [FromQuery] int limit = 20, CancellationToken ct = default)
    {
        await EnsureAsync(boardId, BoardPermission.View, ct);
        limit = Math.Clamp(limit, 1, 100);
        var rows = await (from c in _db.QuestChanges.AsNoTracking()
                          join q in _db.Quests.AsNoTracking() on c.QuestId equals q.Id
                          where q.BoardId == boardId
                          orderby c.CreatedAt descending
                          select new { c.Id, c.UserId, c.ChangeType, c.Field, c.OldValue, c.NewValue, c.CreatedAt, QuestId = q.Id, q.IssueKey, q.Title, q.IssueType, StatusTitle = q.Column.Title, StatusKind = q.Column.Kind })
            .Take(limit).ToListAsync(ct);
        var users = await UsersAsync(rows.Where(r => r.UserId.HasValue).Select(r => r.UserId!.Value), ct);
        var weekAgo = DateTime.UtcNow.AddDays(-7);
        var updatedLast7Days = await (from c in _db.QuestChanges
                                      join q in _db.Quests on c.QuestId equals q.Id
                                      where q.BoardId == boardId && c.CreatedAt >= weekAgo && c.ChangeType != "created"
                                      select c.QuestId).Distinct().CountAsync(ct);
        return Ok(new
        {
            updatedLast7Days,
            items = rows.Select(r => new
            {
                id = r.Id, changeType = r.ChangeType, field = r.Field, oldValue = r.OldValue, newValue = r.NewValue, createdAt = r.CreatedAt,
                user = Person(users, r.UserId),
                issue = new { id = r.QuestId, issueKey = r.IssueKey, title = r.Title, issueType = r.IssueType, statusTitle = r.StatusTitle, statusKind = r.StatusKind },
            }),
        });
    }

    // ---------- Среда разработки ----------

    [HttpGet("development")]
    public async Task<ActionResult> Development(Guid boardId, CancellationToken ct)
    {
        await EnsureAsync(boardId, BoardPermission.View, ct);
        var now = DateTime.UtcNow;
        var weekAgo = now.AddDays(-7);
        var quests = await _db.Quests.AsNoTracking().Where(q => q.BoardId == boardId && q.Column.Kind != ColumnKind.Archive)
            .Select(q => new { q.Id, q.CompletedAt, q.DueDate, q.IssueType, Done = q.Column.Kind == ColumnKind.Done }).ToListAsync(ct);
        var doneTitles = await _db.Columns.AsNoTracking().Where(c => c.BoardId == boardId && c.Kind == ColumnKind.Done).Select(c => c.Title).ToListAsync(ct);
        var questIds = quests.Select(q => q.Id).ToList();
        var reopened = await _db.QuestChanges.AsNoTracking()
            .Where(c => questIds.Contains(c.QuestId) && c.ChangeType == "status" && c.CreatedAt >= weekAgo && c.OldValue != null && doneTitles.Contains(c.OldValue))
            .Select(c => c.QuestId).Distinct().CountAsync(ct);

        var integrations = await _db.GitHubIntegrations.AsNoTracking().Where(i => i.BoardId == boardId)
            .Select(i => new { id = i.Id, owner = i.RepositoryOwner, name = i.RepositoryName, enabled = i.Enabled }).ToListAsync(ct);
        var integrationIds = integrations.Select(i => i.id).ToList();
        var links = await (from l in _db.DevelopmentLinks.AsNoTracking()
                           join q in _db.Quests.AsNoTracking() on l.QuestId equals q.Id
                           where q.BoardId == boardId && integrationIds.Contains(l.GitHubIntegrationId)
                           orderby l.UpdatedAt descending
                           select new { id = l.Id, kind = l.Kind, url = l.Url, title = l.Title, status = l.Status, updatedAt = l.UpdatedAt, questId = q.Id, issueKey = q.IssueKey })
            .Take(300).ToListAsync(ct);
        var pullRequests = links.Where(l => l.kind == GitHubEventParser.PullRequestKind).ToList();
        var merged = pullRequests.Where(l => l.status == "merged").ToList();

        return Ok(new
        {
            metrics = new
            {
                completedThisWeek = quests.Count(q => q.CompletedAt >= weekAgo),
                overdue = quests.Count(q => !q.Done && q.DueDate.HasValue && q.DueDate < now),
                reopened,
                openBugs = quests.Count(q => !q.Done && q.IssueType == IssueType.Bug),
                openPullRequests = pullRequests.Count(l => l.status == "open"),
                mergedThisWeek = merged.Count(l => l.updatedAt >= weekAgo),
                commitsThisWeek = links.Count(l => l.kind == GitHubEventParser.CommitKind && l.updatedAt >= weekAgo),
                failedChecks = links.Count(l => l.kind == GitHubEventParser.CheckRunKind && (l.status == "failure" || l.status == "timed_out")),
            },
            integrations,
            pullRequests = pullRequests.Take(20),
            branches = links.Where(l => l.kind == GitHubEventParser.BranchKind).Take(20),
            commits = links.Where(l => l.kind == GitHubEventParser.CommitKind).Take(20),
            checks = links.Where(l => l.kind == GitHubEventParser.CheckRunKind).Take(20),
        });
    }
}
