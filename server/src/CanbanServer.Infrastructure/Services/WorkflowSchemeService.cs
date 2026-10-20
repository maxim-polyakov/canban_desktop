using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public record WorkflowMigration(string IssueType, Guid ColumnId, string Status);
public record BoardWorkflowSchemeRequest(Guid? WorkflowSchemeId, List<WorkflowMigration>? Migrations);
public record WorkflowFromBoardRequest(string? Name);

public sealed class WorkflowStatus
{
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public int Kind { get; set; }
    public double X { get; set; }
    public double Y { get; set; }
}

public sealed class WorkflowConditions
{
    public string? Role { get; set; }
    public bool RequireAssignee { get; set; }
    public bool OnlyAssignee { get; set; }
    public bool RequireEstimate { get; set; }
    public List<Guid> Groups { get; set; } = new();
}

public sealed class FieldPattern
{
    public string Field { get; set; } = "";
    public string Pattern { get; set; } = "";
    public string? Message { get; set; }
}

public sealed class WorkflowValidators
{
    public List<string> RequiredFields { get; set; } = new();
    public List<FieldPattern> Patterns { get; set; } = new();
    public string? PreviousStatus { get; set; }
}

public sealed class WorkflowPostFunctions
{
    public string? Assignee { get; set; }
    public int? Priority { get; set; }
}

public sealed class SharedTransition
{
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public List<string> From { get; set; } = new();
    public bool Any { get; set; }
    public string To { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public Guid? ScreenId { get; set; }
    public WorkflowConditions Conditions { get; set; } = new();
    public WorkflowValidators Validators { get; set; } = new();
    public WorkflowPostFunctions Post { get; set; } = new();
}

public sealed class WorkflowData
{
    public List<WorkflowStatus> Statuses { get; set; } = new();
    public string? Initial { get; set; }
    public List<SharedTransition> Transitions { get; set; } = new();

    public WorkflowStatus? StatusByName(string? name) =>
        name == null ? null : Statuses.FirstOrDefault(s => string.Equals(s.Name, name.Trim(), StringComparison.OrdinalIgnoreCase));
    public WorkflowStatus? StatusByKey(string? key) => Statuses.FirstOrDefault(s => s.Key == key);
}

/// <summary>Workflows a space uses through its workflow scheme, keyed by issue type token or "default".</summary>
public sealed class BoardWorkflow
{
    public Guid SchemeId { get; init; }
    public Dictionary<string, (Guid Id, string Name, WorkflowData Data)> ByToken { get; } = new();

    public WorkflowData? For(string token) =>
        ByToken.TryGetValue(token, out var own) ? own.Data : ByToken.TryGetValue(BoardLayout.DefaultKey, out var def) ? def.Data : null;
}

/// <summary>The transition a move goes through and the fields its screen lets the user fill in.</summary>
public sealed record SharedTransitionMatch(WorkflowData Workflow, SharedTransition Transition, HashSet<string> ScreenFields)
{
    public string? PostFunctionsJson
    {
        get
        {
            var post = new Dictionary<string, object>();
            if (!string.IsNullOrEmpty(Transition.Post.Assignee)) post["assignee"] = Transition.Post.Assignee;
            if (Transition.Post.Priority is int p) post["priority"] = p;
            return post.Count == 0 ? null : JsonSerializer.Serialize(post);
        }
    }
}

public class WorkflowSchemeService
{
    public const string Workflow = "workflow";
    public const string Scheme = "workflowscheme";
    public static readonly string[] Kinds = { Workflow, Scheme };
    private const int MaxObjectsPerKind = 100;
    private const int MaxStatuses = 50;
    private const int MaxTransitions = 200;
    private static readonly string[] Roles = { "", "Manage", "Admin" };
    private static readonly string[] AssigneeActions = { "", "currentUser", "unassigned" };
    private static readonly string[] PatternFields = { "summary", "description" };
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    private readonly CanbanDbContext _db;
    private readonly IProjectAccessService _access;
    private readonly CacheService _cache;
    private readonly IBoardHub _boardHub;

    public WorkflowSchemeService(CanbanDbContext db, IProjectAccessService access, CacheService cache, IBoardHub boardHub)
    {
        _db = db;
        _access = access;
        _cache = cache;
        _boardHub = boardHub;
    }

    public async Task<object> CatalogAsync(Guid userId, Guid teamId, CancellationToken ct)
    {
        var canManage = await TeamAccessAsync(teamId, userId, ct);
        var objects = await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.TeamId == teamId && Kinds.Contains(o.Kind)).OrderBy(o => o.Name).ToListAsync(ct);
        var screens = await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.TeamId == teamId && o.Kind == IssueLayoutService.Screen)
            .OrderBy(o => o.Name).Select(o => new { o.Id, o.Name }).ToListAsync(ct);
        var groups = await _db.UserGroups.AsNoTracking().Where(g => g.TeamId == teamId).OrderBy(g => g.Name).Select(g => new { g.Id, g.Name }).ToListAsync(ct);
        var boards = await _db.Boards.AsNoTracking().Where(b => b.TeamId == teamId).OrderBy(b => b.Name).Select(b => new { b.Id, b.Name, b.KeyPrefix }).ToListAsync(ct);
        var boardIds = boards.Select(b => b.Id).ToList();
        var assignments = await _db.BoardIssueLayouts.AsNoTracking().Where(a => boardIds.Contains(a.BoardId)).ToDictionaryAsync(a => a.BoardId, ct);
        return new
        {
            teamId,
            canManage,
            objects = objects.Select(o => Dto(o, UsedBy(o, objects, assignments.Values))),
            screens = screens.Select(s => new { id = s.Id, name = s.Name }),
            groups = groups.Select(g => new { id = g.Id, name = g.Name }),
            boards = boards.Select(b => new { id = b.Id, name = b.Name, key = b.KeyPrefix, workflowSchemeId = assignments.GetValueOrDefault(b.Id)?.WorkflowSchemeId }),
        };
    }

    public async Task<object> GetAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var item = await FindAsync(id, ct);
        await TeamAccessAsync(item.TeamId, userId, ct);
        return Dto(item, Array.Empty<object>());
    }

    public async Task<object> CreateAsync(Guid userId, string kind, IssueLayoutRequest request, CancellationToken ct)
    {
        if (!Kinds.Contains(kind)) throw new ArgumentException("Неизвестный вид объекта");
        await EnsureAdminAsync(request.TeamId, userId, ct);
        if (await _db.IssueLayoutObjects.CountAsync(o => o.TeamId == request.TeamId && o.Kind == kind, ct) >= MaxObjectsPerKind)
            throw new InvalidOperationException("Достигнут предел объектов этого вида в команде");
        var now = DateTime.UtcNow;
        var item = new IssueLayoutObject { Id = Guid.NewGuid(), TeamId = request.TeamId, Kind = kind, CreatedAt = now, UpdatedAt = now };
        await ApplyAsync(item, request, isNew: true, ct);
        _db.IssueLayoutObjects.Add(item);
        await _db.SaveChangesAsync(ct);
        return Dto(item, Array.Empty<object>());
    }

    public async Task<object> UpdateAsync(Guid id, Guid userId, IssueLayoutRequest request, CancellationToken ct)
    {
        var item = await FindAsync(id, ct);
        await EnsureAdminAsync(item.TeamId, userId, ct);
        var before = item.DataJson;
        await ApplyAsync(item, request with { TeamId = item.TeamId }, isNew: false, ct);
        var boards = await BoardsUsingAsync(item, ct);
        if (before != item.DataJson && boards.Count > 0)
        {
            foreach (var boardId in boards) await EnsureNoStrandedIssuesAsync(boardId, item, ct);
        }
        item.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        foreach (var boardId in boards) await SyncColumnsAsync(boardId, ct);
        await _db.SaveChangesAsync(ct);
        foreach (var boardId in boards) await NotifyBoardAsync(boardId, ct);
        return Dto(item, Array.Empty<object>());
    }

    public async Task DeleteAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var item = await FindAsync(id, ct);
        await EnsureAdminAsync(item.TeamId, userId, ct);
        var objects = await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.TeamId == item.TeamId && Kinds.Contains(o.Kind)).ToListAsync(ct);
        var assignments = await _db.BoardIssueLayouts.AsNoTracking().Where(a => a.WorkflowSchemeId == id).ToListAsync(ct);
        if (UsedBy(item, objects, assignments).Count > 0)
            throw new InvalidOperationException("Объект используется — сначала уберите его из схем и пространств");
        _db.IssueLayoutObjects.Remove(item);
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>Creates a shared workflow from the space's statuses and transitions.</summary>
    public async Task<object> FromBoardAsync(Guid boardId, Guid userId, WorkflowFromBoardRequest request, CancellationToken ct)
    {
        var board = await _db.Boards.AsNoTracking().FirstOrDefaultAsync(b => b.Id == boardId, ct) ?? throw new KeyNotFoundException("Board not found");
        await _access.EnsureBoardPermissionAsync(boardId, userId, BoardPermission.Admin, ct);
        var columns = await _db.Columns.AsNoTracking().Where(c => c.BoardId == boardId && c.Kind != ColumnKind.Archive).OrderBy(c => c.Order).ToListAsync(ct);
        var rules = await _db.WorkflowTransitions.AsNoTracking().Where(t => t.BoardId == boardId).OrderBy(t => t.Name).ToListAsync(ct);
        var data = new WorkflowData();
        var keys = new Dictionary<Guid, string>();
        foreach (var (column, index) in columns.Select((c, i) => (c, i)))
        {
            if (data.StatusByName(column.Title) is { } existing) { keys[column.Id] = existing.Key; continue; }
            var key = "s" + (index + 1);
            keys[column.Id] = key;
            data.Statuses.Add(new WorkflowStatus { Key = key, Name = column.Title.Trim(), Kind = (int)column.Kind, X = 40 + (index % 5) * 200, Y = 60 + index / 5 * 140 });
        }
        data.Initial = data.Statuses.FirstOrDefault()?.Key;
        var n = 0;
        foreach (var rule in rules)
        {
            if (!keys.TryGetValue(rule.TargetColumnId, out var to)) continue;
            if (!rule.FromAnyStatus && !keys.ContainsKey(rule.SourceColumnId)) continue;
            var conditions = string.IsNullOrWhiteSpace(rule.ConditionsJson) ? default : JsonDocument.Parse(rule.ConditionsJson).RootElement;
            bool Flag(string name) => conditions.ValueKind == JsonValueKind.Object && conditions.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;
            var post = string.IsNullOrWhiteSpace(rule.PostFunctionsJson) ? null : JsonSerializer.Deserialize<WorkflowPostFunctions>(rule.PostFunctionsJson, Json);
            data.Transitions.Add(new SharedTransition
            {
                Key = "t" + ++n,
                Name = rule.Name.Length > 60 ? rule.Name[..60] : rule.Name,
                Any = rule.FromAnyStatus,
                From = rule.FromAnyStatus ? new() : new() { keys[rule.SourceColumnId] },
                To = to,
                Enabled = rule.Enabled,
                Conditions = new WorkflowConditions
                {
                    Role = rule.AllowedRoles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault(),
                    RequireAssignee = Flag("requireAssignee"),
                    OnlyAssignee = Flag("onlyAssignee"),
                    RequireEstimate = Flag("requireEstimate"),
                },
                Validators = new WorkflowValidators
                {
                    RequiredFields = conditions.ValueKind == JsonValueKind.Object && conditions.TryGetProperty("requiredFields", out var rf) && rf.ValueKind == JsonValueKind.Array
                        ? rf.EnumerateArray().Select(x => x.GetString() ?? "").Select(LegacyFieldKey).Where(x => x.Length > 0).Distinct().ToList()
                        : new(),
                },
                Post = post ?? new(),
            });
        }
        var name = string.IsNullOrWhiteSpace(request.Name) ? $"Workflow {board.Name}" : request.Name;
        var taken = await _db.IssueLayoutObjects.Where(o => o.TeamId == board.TeamId && o.Kind == Workflow).Select(o => o.Name).ToListAsync(ct);
        var unique = name.Trim();
        for (var i = 2; taken.Contains(unique, StringComparer.OrdinalIgnoreCase); i++) unique = $"{name.Trim()} ({i})";
        return await CreateAsync(userId, Workflow, new IssueLayoutRequest(board.TeamId, unique.Length > 100 ? unique[..100] : unique, null, JsonSerializer.SerializeToElement(data, Json)), ct);
    }

    /// <summary>Issues whose current status is not in the workflow their type gets under the scheme.</summary>
    public async Task<object> PreviewAsync(Guid boardId, Guid userId, Guid? schemeId, CancellationToken ct)
    {
        await _access.EnsureBoardPermissionAsync(boardId, userId, BoardPermission.Admin, ct);
        var teamId = await _db.Boards.Where(b => b.Id == boardId).Select(b => b.TeamId).FirstAsync(ct);
        var target = schemeId is Guid id ? await LoadSchemeAsync(teamId, id, ct) : null;
        var needed = await NeededMigrationsAsync(boardId, teamId, target, ct);
        return new { boardId, workflowSchemeId = schemeId, migrations = needed };
    }

    public async Task<object> AssignAsync(Guid boardId, Guid userId, BoardWorkflowSchemeRequest request, CancellationToken ct)
    {
        await _access.EnsureBoardPermissionAsync(boardId, userId, BoardPermission.Admin, ct);
        var teamId = await _db.Boards.Where(b => b.Id == boardId).Select(b => b.TeamId).FirstAsync(ct);
        var target = request.WorkflowSchemeId is Guid id ? await LoadSchemeAsync(teamId, id, ct) : null;
        var needed = await NeededMigrationsAsync(boardId, teamId, target, ct);
        var migrations = request.Migrations ?? new();
        var plan = new List<(MigrationNeed Need, string Status)>();
        foreach (var need in needed)
        {
            var chosen = migrations.FirstOrDefault(m => m.IssueType == need.IssueType && m.ColumnId == need.ColumnId)
                ?? throw new ArgumentException("Выберите новый статус для всех задач, статуса которых нет в новом workflow");
            if (!need.Statuses.Contains(chosen.Status.Trim(), StringComparer.OrdinalIgnoreCase))
                throw new ArgumentException($"Статуса «{chosen.Status}» нет в workflow этого типа задач");
            plan.Add((need, chosen.Status.Trim()));
        }
        var row = await _db.BoardIssueLayouts.FirstOrDefaultAsync(a => a.BoardId == boardId, ct);
        if (row == null) _db.BoardIssueLayouts.Add(row = new BoardIssueLayout { BoardId = boardId });
        row.WorkflowSchemeId = request.WorkflowSchemeId;
        await _db.SaveChangesAsync(ct);
        await SyncColumnsAsync(boardId, ct);
        await _db.SaveChangesAsync(ct);

        if (plan.Count > 0)
        {
            var columns = await _db.Columns.Where(c => c.BoardId == boardId).ToListAsync(ct);
            foreach (var (need, status) in plan)
            {
                var to = columns.First(c => c.Kind != ColumnKind.Archive && string.Equals(c.Title.Trim(), status, StringComparison.OrdinalIgnoreCase));
                var from = columns.First(c => c.Id == need.ColumnId);
                var quests = (await _db.Quests.Where(q => q.BoardId == boardId && q.ColumnId == need.ColumnId).ToListAsync(ct))
                    .Where(q => IssueLayoutService.TypeToken(q.IssueType, q.IssueTypeId) == need.IssueType).ToList();
                foreach (var quest in quests)
                {
                    quest.ColumnId = to.Id;
                    _db.QuestChanges.Add(new QuestChange
                    {
                        Id = Guid.NewGuid(), QuestId = quest.Id, UserId = userId, ChangeType = "status", Field = "status",
                        OldValue = from.Title, NewValue = to.Title, CreatedAt = DateTime.UtcNow,
                    });
                    if (to.Kind == ColumnKind.Done) quest.CompletedAt ??= DateTime.UtcNow;
                    else if (from.Kind == ColumnKind.Done) quest.CompletedAt = null;
                }
            }
            await _db.SaveChangesAsync(ct);
        }
        await NotifyBoardAsync(boardId, ct);
        return new { boardId, workflowSchemeId = row.WorkflowSchemeId };
    }

    public async Task<BoardWorkflow?> ResolveAsync(Guid boardId, CancellationToken ct)
    {
        var schemeId = await _db.BoardIssueLayouts.AsNoTracking().Where(a => a.BoardId == boardId).Select(a => a.WorkflowSchemeId).FirstOrDefaultAsync(ct);
        if (schemeId == null) return null;
        var teamId = await _db.Boards.Where(b => b.Id == boardId).Select(b => b.TeamId).FirstAsync(ct);
        return await LoadSchemeAsync(teamId, schemeId.Value, ct, throwIfMissing: false);
    }

    /// <summary>Per issue type: initial status column and the transitions the space's board can offer.</summary>
    public async Task<object?> BoardConfigAsync(Guid boardId, CancellationToken ct)
    {
        var workflow = await ResolveAsync(boardId, ct);
        if (workflow == null) return null;
        var columns = await _db.Columns.AsNoTracking().Where(c => c.BoardId == boardId && c.Kind != ColumnKind.Archive).ToListAsync(ct);
        var screens = await ScreensAsync(workflow, ct);
        Guid? Column(WorkflowData data, string? key) =>
            data.StatusByKey(key) is { } s ? columns.FirstOrDefault(c => string.Equals(c.Title.Trim(), s.Name, StringComparison.OrdinalIgnoreCase))?.Id : null;
        return new
        {
            schemeId = workflow.SchemeId,
            types = workflow.ByToken.ToDictionary(x => x.Key, x => new
            {
                workflowId = x.Value.Id,
                workflowName = x.Value.Name,
                initial = Column(x.Value.Data, x.Value.Data.Initial),
                statuses = x.Value.Data.Statuses.Select(s => Column(x.Value.Data, s.Key)).Where(c => c != null),
                transitions = x.Value.Data.Transitions.Where(t => t.Enabled).Select(t => new
                {
                    key = t.Key,
                    name = t.Name,
                    any = t.Any,
                    from = t.From.Select(f => Column(x.Value.Data, f)).Where(c => c != null),
                    to = Column(x.Value.Data, t.To),
                    screen = t.ScreenId is Guid sid && screens.TryGetValue(sid, out var tabs) ? tabs : null,
                }).Where(t => t.to != null),
            }),
        };
    }

    /// <summary>Column a new issue of the type starts in, when the space's workflow defines one.</summary>
    public async Task<Guid?> InitialColumnAsync(Guid boardId, string token, CancellationToken ct)
    {
        var workflow = (await ResolveAsync(boardId, ct))?.For(token);
        if (workflow?.StatusByKey(workflow.Initial) is not { } status) return null;
        var columns = await _db.Columns.AsNoTracking().Where(c => c.BoardId == boardId && c.Kind != ColumnKind.Archive).ToListAsync(ct);
        return columns.FirstOrDefault(c => string.Equals(c.Title.Trim(), status.Name, StringComparison.OrdinalIgnoreCase))?.Id;
    }

    /// <summary>Finds the transition for a move and checks its conditions.</summary>
    public async Task<SharedTransitionMatch> MatchAsync(BoardWorkflow board, Quest quest, Guid targetColumnId, BoardPermission permission, Guid userId, string? transitionKey, CancellationToken ct)
    {
        var token = IssueLayoutService.TypeToken(quest.IssueType, quest.IssueTypeId);
        var workflow = board.For(token) ?? throw new InvalidOperationException("Transition is not allowed by workflow");
        var columns = await _db.Columns.AsNoTracking().Where(c => c.BoardId == quest.BoardId).ToDictionaryAsync(c => c.Id, ct);
        var from = workflow.StatusByName(columns.GetValueOrDefault(quest.ColumnId)?.Title);
        var targetTitle = columns.GetValueOrDefault(targetColumnId)?.Title;
        var to = workflow.StatusByName(targetTitle)
            ?? throw new InvalidOperationException($"Статуса «{targetTitle}» нет в workflow этого типа задач");
        var candidates = workflow.Transitions
            .Where(t => t.Enabled && t.To == to.Key && (t.Any || (from != null && t.From.Contains(from.Key))))
            .Where(t => transitionKey == null || t.Key == transitionKey)
            .OrderBy(t => t.Any).ToList();
        // An issue left in a status outside its workflow can always go to the workflow's initial status.
        if (candidates.Count == 0 && from == null && to.Key == workflow.Initial)
            return new SharedTransitionMatch(workflow, new SharedTransition { Key = "", Name = "", To = to.Key }, new());
        if (candidates.Count == 0) throw new InvalidOperationException("Transition is not allowed by workflow");
        InvalidOperationException? failure = null;
        foreach (var candidate in candidates)
        {
            try
            {
                await CheckConditionsAsync(candidate, quest, permission, userId, ct);
                var fields = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (candidate.ScreenId is Guid screenId)
                {
                    var screen = await _db.IssueLayoutObjects.AsNoTracking().FirstOrDefaultAsync(o => o.Id == screenId && o.Kind == IssueLayoutService.Screen, ct);
                    foreach (var key in (Parse<ScreenData>(screen?.DataJson)?.Tabs ?? new()).SelectMany(t => t.Fields)) fields.Add(key);
                }
                return new SharedTransitionMatch(workflow, candidate, fields);
            }
            catch (InvalidOperationException e) { failure ??= e; }
        }
        throw failure!;
    }

    /// <summary>Runs the transition's validators against the issue after the screen's values are applied.</summary>
    public async Task ValidateAsync(SharedTransitionMatch match, Quest quest, CancellationToken ct)
    {
        var validators = match.Transition.Validators;
        var values = IssueFieldService.ReadValues(quest.CustomFieldsJson);
        var customIds = validators.RequiredFields.Concat(validators.Patterns.Select(p => p.Field))
            .Where(k => k.StartsWith("cf:", StringComparison.Ordinal)).Select(k => Guid.TryParse(k[3..], out var id) ? id : Guid.Empty).ToList();
        var names = await _db.CustomFieldDefinitions.AsNoTracking().Where(f => customIds.Contains(f.Id)).ToDictionaryAsync(f => IssueLayoutService.FieldKey(f.Id), f => f.Name, ct);
        string Name(string key) => key.StartsWith("cf:", StringComparison.Ordinal) ? names.GetValueOrDefault(key) ?? key : IssueFieldService.SystemFieldName(key);

        foreach (var key in validators.RequiredFields)
        {
            var present = key switch
            {
                "summary" => !string.IsNullOrWhiteSpace(quest.Title),
                "description" => !string.IsNullOrWhiteSpace(quest.Description) || !string.IsNullOrWhiteSpace(quest.DescriptionDocumentJson),
                "assignee" => quest.AssigneeId.HasValue || quest.Assignees.Count > 0,
                "duedate" => quest.DueDate.HasValue,
                "startdate" => quest.StartDate.HasValue,
                "labels" => !string.IsNullOrWhiteSpace(quest.Labels),
                "components" => !string.IsNullOrWhiteSpace(quest.Component) || await _db.QuestComponents.AnyAsync(c => c.QuestId == quest.Id, ct),
                "fixversions" => !string.IsNullOrWhiteSpace(quest.FixVersion) || await _db.QuestReleases.AnyAsync(r => r.QuestId == quest.Id, ct),
                "storypoints" => quest.StoryPoints.HasValue,
                "originalestimate" => quest.OriginalEstimateMinutes.HasValue,
                "sprint" => quest.SprintId.HasValue,
                _ when key.StartsWith("cf:", StringComparison.Ordinal) => values.ContainsKey(key[3..]),
                _ => true,
            };
            if (!present) throw new InvalidOperationException($"Для перехода заполните поле «{Name(key)}»");
        }
        foreach (var rule in validators.Patterns)
        {
            var text = rule.Field switch
            {
                "summary" => quest.Title,
                "description" => quest.Description,
                _ => values.TryGetValue(rule.Field[3..], out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null,
            } ?? "";
            bool ok;
            try { ok = Regex.IsMatch(text, rule.Pattern, RegexOptions.None, TimeSpan.FromMilliseconds(200)); }
            catch (RegexMatchTimeoutException) { ok = false; }
            if (!ok) throw new InvalidOperationException(rule.Message ?? $"Поле «{Name(rule.Field)}» не соответствует формату");
        }
        if (match.Workflow.StatusByKey(validators.PreviousStatus) is { } previous)
        {
            bool Same(string? title) => string.Equals(title?.Trim(), previous.Name, StringComparison.OrdinalIgnoreCase);
            var visited = Same(quest.Column?.Title);
            if (!visited)
            {
                var history = await _db.QuestChanges.AsNoTracking().Where(c => c.QuestId == quest.Id && c.Field == "status")
                    .Select(c => new { c.OldValue, c.NewValue }).ToListAsync(ct);
                visited = history.Any(c => Same(c.OldValue) || Same(c.NewValue));
            }
            if (!visited) throw new InvalidOperationException($"Переход доступен только задачам, которые были в статусе «{previous.Name}»");
        }
    }

    private async Task CheckConditionsAsync(SharedTransition transition, Quest quest, BoardPermission permission, Guid userId, CancellationToken ct)
    {
        var c = transition.Conditions;
        var legacy = new WorkflowTransition
        {
            AllowedRoles = c.Role ?? "",
            ConditionsJson = JsonSerializer.Serialize(new { requireAssignee = c.RequireAssignee, onlyAssignee = c.OnlyAssignee, requireEstimate = c.RequireEstimate }),
        };
        JiraPlatformService.CheckConditions(legacy, quest, permission, userId);
        if (c.Groups.Count > 0 && !await _db.UserGroupMembers.AnyAsync(m => c.Groups.Contains(m.GroupId) && m.UserId == userId, ct))
            throw new InvalidOperationException("Переход доступен только участникам выбранных групп");
    }

    private async Task<Dictionary<Guid, List<ScreenTab>>> ScreensAsync(BoardWorkflow workflow, CancellationToken ct)
    {
        var ids = workflow.ByToken.Values.SelectMany(w => w.Data.Transitions).Select(t => t.ScreenId).OfType<Guid>().Distinct().ToList();
        var screens = await _db.IssueLayoutObjects.AsNoTracking().Where(o => ids.Contains(o.Id) && o.Kind == IssueLayoutService.Screen).ToListAsync(ct);
        return screens.ToDictionary(s => s.Id, s => Parse<ScreenData>(s.DataJson)?.Tabs ?? new());
    }

    private sealed record MigrationNeed(string IssueType, Guid ColumnId, string ColumnTitle, int Count, List<string> Statuses);

    private async Task<List<MigrationNeed>> NeededMigrationsAsync(Guid boardId, Guid teamId, BoardWorkflow? target, CancellationToken ct)
    {
        if (target == null) return new();
        var columns = await _db.Columns.AsNoTracking().Where(c => c.BoardId == boardId).ToDictionaryAsync(c => c.Id, ct);
        var quests = await _db.Quests.AsNoTracking().Where(q => q.BoardId == boardId).Select(q => new { q.ColumnId, q.IssueType, q.IssueTypeId }).ToListAsync(ct);
        return quests
            .Where(q => columns.TryGetValue(q.ColumnId, out var c) && c.Kind != ColumnKind.Archive)
            .GroupBy(q => (Token: IssueLayoutService.TypeToken(q.IssueType, q.IssueTypeId), q.ColumnId))
            .Select(g => (g.Key, Count: g.Count(), Workflow: target.For(g.Key.Token)))
            .Where(x => x.Workflow != null && x.Workflow.StatusByName(columns[x.Key.ColumnId].Title) == null)
            .Select(x => new MigrationNeed(x.Key.Token, x.Key.ColumnId, columns[x.Key.ColumnId].Title, x.Count, x.Workflow!.Statuses.Select(s => s.Name).ToList()))
            .OrderBy(x => x.IssueType).ThenBy(x => x.ColumnTitle).ToList();
    }

    /// <summary>Adds a column for every status the space's workflows use and aligns status categories.</summary>
    private async Task SyncColumnsAsync(Guid boardId, CancellationToken ct)
    {
        var workflow = await ResolveAsync(boardId, ct);
        if (workflow == null) return;
        var columns = await _db.Columns.Where(c => c.BoardId == boardId).ToListAsync(ct);
        var order = columns.Count == 0 ? 0 : columns.Where(c => c.Kind != ColumnKind.Archive).Select(c => c.Order).DefaultIfEmpty(0).Max() + 1;
        var archive = columns.FirstOrDefault(c => c.Kind == ColumnKind.Archive);
        foreach (var status in workflow.ByToken.Values.SelectMany(w => w.Data.Statuses))
        {
            var column = columns.FirstOrDefault(c => c.Kind != ColumnKind.Archive && string.Equals(c.Title.Trim(), status.Name, StringComparison.OrdinalIgnoreCase));
            if (column == null)
            {
                column = new Column { Id = Guid.NewGuid(), BoardId = boardId, Title = status.Name, Order = order++, Kind = (ColumnKind)status.Kind, CreatedAt = DateTime.UtcNow };
                _db.Columns.Add(column);
                columns.Add(column);
            }
            else column.Kind = (ColumnKind)status.Kind;
        }
        if (archive != null && archive.Order < order) archive.Order = order;
    }

    private async Task EnsureNoStrandedIssuesAsync(Guid boardId, IssueLayoutObject changed, CancellationToken ct)
    {
        var teamId = changed.TeamId;
        var row = await _db.BoardIssueLayouts.AsNoTracking().FirstAsync(a => a.BoardId == boardId, ct);
        var objects = await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.TeamId == teamId && Kinds.Contains(o.Kind) && o.Id != changed.Id).ToListAsync(ct);
        objects.Add(changed);
        var target = BuildScheme(row.WorkflowSchemeId!.Value, objects.ToDictionary(o => o.Id));
        var needed = target == null ? new() : await NeededMigrationsAsync(boardId, teamId, target, ct);
        if (needed.Count > 0)
        {
            var board = await _db.Boards.Where(b => b.Id == boardId).Select(b => b.Name).FirstAsync(ct);
            throw new InvalidOperationException($"В пространстве «{board}» есть задачи в статусе «{needed[0].ColumnTitle}», которого не будет в workflow. Сначала переместите их или смените схему пространства");
        }
    }

    private async Task<List<Guid>> BoardsUsingAsync(IssueLayoutObject item, CancellationToken ct)
    {
        var schemeIds = new List<Guid>();
        if (item.Kind == Scheme) schemeIds.Add(item.Id);
        else
        {
            var schemes = await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.TeamId == item.TeamId && o.Kind == Scheme).ToListAsync(ct);
            schemeIds.AddRange(schemes.Where(s => Parse<TypeMappingData>(s.DataJson) is { } m && (m.Default == item.Id || m.Types.ContainsValue(item.Id))).Select(s => s.Id));
        }
        return await _db.BoardIssueLayouts.AsNoTracking().Where(a => a.WorkflowSchemeId != null && schemeIds.Contains(a.WorkflowSchemeId.Value)).Select(a => a.BoardId).ToListAsync(ct);
    }

    private async Task<BoardWorkflow?> LoadSchemeAsync(Guid teamId, Guid schemeId, CancellationToken ct, bool throwIfMissing = true)
    {
        var objects = await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.TeamId == teamId && Kinds.Contains(o.Kind)).ToDictionaryAsync(o => o.Id, ct);
        var result = BuildScheme(schemeId, objects);
        if (result == null && throwIfMissing) throw new ArgumentException("Схема workflow не найдена в этой команде");
        return result;
    }

    private static BoardWorkflow? BuildScheme(Guid schemeId, IReadOnlyDictionary<Guid, IssueLayoutObject> objects)
    {
        if (!objects.TryGetValue(schemeId, out var scheme) || scheme.Kind != Scheme || Parse<TypeMappingData>(scheme.DataJson) is not { } mapping) return null;
        var result = new BoardWorkflow { SchemeId = schemeId };
        void Add(string token, Guid? id)
        {
            if (id is Guid key && objects.TryGetValue(key, out var o) && o.Kind == Workflow && Parse<WorkflowData>(o.DataJson) is { } data)
                result.ByToken[token] = (o.Id, o.Name, data);
        }
        Add(BoardLayout.DefaultKey, mapping.Default);
        foreach (var (token, id) in mapping.Types) Add(token, id);
        return result;
    }

    private async Task ApplyAsync(IssueLayoutObject item, IssueLayoutRequest request, bool isNew, CancellationToken ct)
    {
        if (request.Name != null)
        {
            var name = request.Name.Trim();
            if (name.Length == 0) throw new ArgumentException("Введите название");
            if (name.Length > 100) throw new ArgumentException("Название — не больше 100 символов");
            var taken = await _db.IssueLayoutObjects.Where(o => o.TeamId == item.TeamId && o.Kind == item.Kind && o.Id != item.Id).Select(o => o.Name).ToListAsync(ct);
            if (taken.Contains(name, StringComparer.OrdinalIgnoreCase)) throw new ArgumentException($"«{name}» уже есть");
            item.Name = name;
        }
        else if (item.Name.Length == 0) throw new ArgumentException("Введите название");
        if (request.Description != null)
        {
            var description = request.Description.Trim();
            item.Description = description.Length == 0 ? null : description.Length > 500 ? description[..500] : description;
        }
        if (request.Data is JsonElement data && data.ValueKind == JsonValueKind.Object)
            item.DataJson = item.Kind == Workflow ? await ValidateWorkflowAsync(item.TeamId, Read<WorkflowData>(data), ct) : await ValidateSchemeAsync(item.TeamId, Read<TypeMappingData>(data), ct);
        else if (isNew)
            item.DataJson = item.Kind == Workflow ? await ValidateWorkflowAsync(item.TeamId, DefaultWorkflow(), ct) : throw new ArgumentException("Выберите workflow по умолчанию");
    }

    public static WorkflowData DefaultWorkflow() => new()
    {
        Statuses =
        {
            new WorkflowStatus { Key = "s1", Name = "К выполнению", Kind = (int)ColumnKind.Backlog, X = 40, Y = 120 },
            new WorkflowStatus { Key = "s2", Name = "В работе", Kind = (int)ColumnKind.InProgress, X = 300, Y = 120 },
            new WorkflowStatus { Key = "s3", Name = "Готово", Kind = (int)ColumnKind.Done, X = 560, Y = 120 },
        },
        Initial = "s1",
        Transitions =
        {
            new SharedTransition { Key = "t1", Name = "Начать работу", From = { "s1" }, To = "s2" },
            new SharedTransition { Key = "t2", Name = "Готово", From = { "s2" }, To = "s3" },
            new SharedTransition { Key = "t3", Name = "Вернуть в работу", From = { "s3" }, To = "s2" },
        },
    };

    /// <summary>Normalizes and checks a workflow; public for tests.</summary>
    public static string NormalizeWorkflow(WorkflowData workflow, ISet<string> fieldKeys, ISet<Guid> screens, ISet<Guid> groups)
    {
        if (workflow.Statuses.Count == 0) throw new ArgumentException("В workflow должен быть хотя бы один статус");
        if (workflow.Statuses.Count > MaxStatuses) throw new ArgumentException($"Не больше {MaxStatuses} статусов в workflow");
        if (workflow.Transitions.Count > MaxTransitions) throw new ArgumentException($"Не больше {MaxTransitions} переходов в workflow");
        var keys = new HashSet<string>();
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var status in workflow.Statuses)
        {
            status.Key = (status.Key ?? "").Trim();
            status.Name = (status.Name ?? "").Trim();
            if (status.Key.Length == 0 || status.Key.Length > 40 || !keys.Add(status.Key)) throw new ArgumentException("Неверный ключ статуса");
            if (status.Name.Length == 0) throw new ArgumentException("Введите название статуса");
            if (status.Name.Length > 60) throw new ArgumentException("Название статуса — не больше 60 символов");
            if (!names.Add(status.Name)) throw new ArgumentException($"Статус «{status.Name}» уже есть в workflow");
            if (status.Kind is < 0 or > (int)ColumnKind.Custom) throw new ArgumentException("Неверная категория статуса");
            status.X = Math.Clamp(Math.Round(status.X), 0, 4000);
            status.Y = Math.Clamp(Math.Round(status.Y), 0, 4000);
        }
        workflow.Initial = workflow.Initial != null && keys.Contains(workflow.Initial) ? workflow.Initial : workflow.Statuses[0].Key;
        var transitionKeys = new HashSet<string>();
        foreach (var t in workflow.Transitions)
        {
            t.Key = (t.Key ?? "").Trim();
            t.Name = (t.Name ?? "").Trim();
            if (t.Key.Length == 0 || t.Key.Length > 40 || !transitionKeys.Add(t.Key)) throw new ArgumentException("Неверный ключ перехода");
            if (t.Name.Length == 0) throw new ArgumentException("Введите название перехода");
            if (t.Name.Length > 60) throw new ArgumentException("Название перехода — не больше 60 символов");
            if (!keys.Contains(t.To)) throw new ArgumentException($"Переход «{t.Name}»: неизвестный целевой статус");
            t.From = t.Any ? new() : (t.From ?? new()).Distinct().ToList();
            if (!t.Any && t.From.Count == 0) throw new ArgumentException($"Переход «{t.Name}»: выберите исходный статус");
            if (t.From.Any(f => !keys.Contains(f))) throw new ArgumentException($"Переход «{t.Name}»: неизвестный исходный статус");
            if (t.From.Contains(t.To)) throw new ArgumentException($"Переход «{t.Name}» не может вести в тот же статус");
            if (t.ScreenId is Guid screen && !screens.Contains(screen)) throw new ArgumentException("Экран не найден в этой команде");
            t.Conditions ??= new();
            t.Conditions.Role = string.IsNullOrWhiteSpace(t.Conditions.Role) ? null : t.Conditions.Role.Trim();
            if (!Roles.Contains(t.Conditions.Role ?? "")) throw new ArgumentException("Неверная роль в условии перехода");
            t.Conditions.Groups = (t.Conditions.Groups ?? new()).Distinct().ToList();
            if (t.Conditions.Groups.Any(g => !groups.Contains(g))) throw new ArgumentException("Группа не найдена в этой команде");
            t.Validators ??= new();
            t.Validators.RequiredFields = (t.Validators.RequiredFields ?? new()).Select(f => (f ?? "").Trim().ToLowerInvariant()).Where(f => f.Length > 0).Distinct().ToList();
            if (t.Validators.RequiredFields.Any(f => !fieldKeys.Contains(f))) throw new ArgumentException("Неизвестное поле в валидаторе");
            t.Validators.Patterns = (t.Validators.Patterns ?? new()).Where(p => !string.IsNullOrWhiteSpace(p?.Pattern)).ToList();
            foreach (var p in t.Validators.Patterns)
            {
                p.Field = (p.Field ?? "").Trim().ToLowerInvariant();
                if (!PatternFields.Contains(p.Field) && !(p.Field.StartsWith("cf:") && fieldKeys.Contains(p.Field))) throw new ArgumentException("Неизвестное поле в проверке формата");
                if (p.Pattern.Length > 200) throw new ArgumentException("Регулярное выражение — не больше 200 символов");
                try { _ = new Regex(p.Pattern, RegexOptions.None, TimeSpan.FromMilliseconds(200)); }
                catch (ArgumentException) { throw new ArgumentException($"Неверное регулярное выражение «{p.Pattern}»"); }
                p.Message = string.IsNullOrWhiteSpace(p.Message) ? null : p.Message.Trim()[..Math.Min(p.Message.Trim().Length, 200)];
            }
            t.Validators.PreviousStatus = string.IsNullOrWhiteSpace(t.Validators.PreviousStatus) ? null : t.Validators.PreviousStatus;
            if (t.Validators.PreviousStatus != null && !keys.Contains(t.Validators.PreviousStatus)) throw new ArgumentException("Неизвестный статус в валидаторе");
            t.Post ??= new();
            t.Post.Assignee = string.IsNullOrEmpty(t.Post.Assignee) ? null : t.Post.Assignee;
            if (!AssigneeActions.Contains(t.Post.Assignee ?? "")) throw new ArgumentException("Неверное действие после перехода");
            if (t.Post.Priority is int p2 && !Enum.IsDefined(typeof(IssuePriority), p2)) throw new ArgumentException("Неверный приоритет");
        }
        return JsonSerializer.Serialize(workflow, Json);
    }

    private async Task<string> ValidateWorkflowAsync(Guid teamId, WorkflowData workflow, CancellationToken ct)
    {
        var custom = await _db.CustomFieldDefinitions.AsNoTracking().Where(f => f.TeamId == teamId).Select(f => f.Id).ToListAsync(ct);
        var fieldKeys = IssueLayoutService.SystemFields.Concat(custom.Select(IssueLayoutService.FieldKey)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var screens = (await _db.IssueLayoutObjects.AsNoTracking().Where(o => o.TeamId == teamId && o.Kind == IssueLayoutService.Screen).Select(o => o.Id).ToListAsync(ct)).ToHashSet();
        var groups = (await _db.UserGroups.AsNoTracking().Where(g => g.TeamId == teamId).Select(g => g.Id).ToListAsync(ct)).ToHashSet();
        return NormalizeWorkflow(workflow, fieldKeys, screens, groups);
    }

    private async Task<string> ValidateSchemeAsync(Guid teamId, TypeMappingData mapping, CancellationToken ct)
    {
        if (mapping.Default == null) throw new ArgumentException("Выберите workflow по умолчанию");
        var ids = mapping.Types.Values.Append(mapping.Default.Value).Distinct().ToList();
        if (await _db.IssueLayoutObjects.CountAsync(o => ids.Contains(o.Id) && o.TeamId == teamId && o.Kind == Workflow, ct) != ids.Count)
            throw new ArgumentException("Workflow не найден в этой команде");
        var customIds = new List<Guid>();
        foreach (var token in mapping.Types.Keys)
        {
            if (Guid.TryParse(token, out var id)) customIds.Add(id);
            else if (!int.TryParse(token, out var n) || !Enum.IsDefined(typeof(IssueType), n)) throw new ArgumentException("Неверный тип задачи");
        }
        if (customIds.Count > 0 && await _db.IssueTypeDefinitions.CountAsync(t => customIds.Contains(t.Id) && t.TeamId == teamId, ct) != customIds.Distinct().Count())
            throw new ArgumentException("Тип задачи не найден в этой команде");
        return JsonSerializer.Serialize(mapping, Json);
    }

    private static string LegacyFieldKey(string key) => key.ToLowerInvariant() switch
    {
        "fixversion" => "fixversions",
        "component" => "components",
        "remainingestimate" => "originalestimate",
        var k => IssueLayoutService.SystemFields.Contains(k) || k.StartsWith("cf:") ? k : "",
    };

    /// <summary>Schemes and spaces that refer to the object.</summary>
    private static List<object> UsedBy(IssueLayoutObject item, IEnumerable<IssueLayoutObject> objects, IEnumerable<BoardIssueLayout> assignments)
    {
        var result = new List<object>();
        if (item.Kind == Workflow)
        {
            foreach (var scheme in objects.Where(o => o.Kind == Scheme))
            {
                if (Parse<TypeMappingData>(scheme.DataJson) is { } m && (m.Default == item.Id || m.Types.ContainsValue(item.Id)))
                    result.Add(new { kind = scheme.Kind, id = scheme.Id, name = scheme.Name });
            }
        }
        foreach (var a in assignments.Where(a => a.WorkflowSchemeId == item.Id))
            result.Add(new { kind = "board", id = a.BoardId, name = (string?)null });
        return result;
    }

    /// <summary>Workflows whose transitions show the screen.</summary>
    public static bool UsesScreen(IssueLayoutObject workflow, Guid screenId) =>
        workflow.Kind == Workflow && Parse<WorkflowData>(workflow.DataJson)?.Transitions.Any(t => t.ScreenId == screenId) == true;

    private static T Read<T>(JsonElement data) where T : new()
    {
        try { return data.Deserialize<T>(Json) ?? new T(); }
        catch (JsonException) { throw new ArgumentException("Неверный формат настроек"); }
    }

    private static T? Parse<T>(string? json) where T : class
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize<T>(json, Json); }
        catch (JsonException) { return null; }
    }

    private static object Dto(IssueLayoutObject o, IReadOnlyCollection<object> usedBy) => new
    {
        id = o.Id,
        teamId = o.TeamId,
        kind = o.Kind,
        name = o.Name,
        description = o.Description,
        data = JsonSerializer.Deserialize<JsonElement>(o.DataJson),
        usedBy,
        updatedAt = o.UpdatedAt,
    };

    private async Task<IssueLayoutObject> FindAsync(Guid id, CancellationToken ct) =>
        await _db.IssueLayoutObjects.FirstOrDefaultAsync(o => o.Id == id && Kinds.Contains(o.Kind), ct) ?? throw new KeyNotFoundException("Not found");

    private async Task<bool> TeamAccessAsync(Guid teamId, Guid userId, CancellationToken ct)
    {
        var (status, permission) = await _access.GetTeamAccessAsync(teamId, userId, ct);
        if (status == ProjectAccessStatus.NotFound) throw new KeyNotFoundException("Team not found");
        if (status != ProjectAccessStatus.Success) throw new UnauthorizedAccessException("Нет доступа к команде");
        return permission == BoardPermission.Admin;
    }

    private async Task EnsureAdminAsync(Guid teamId, Guid userId, CancellationToken ct)
    {
        if (!await TeamAccessAsync(teamId, userId, ct))
            throw new UnauthorizedAccessException("Настраивать workflow может только владелец или администратор команды");
    }

    private async Task NotifyBoardAsync(Guid boardId, CancellationToken ct)
    {
        await _cache.InvalidateAsync("board:detail:" + boardId, ct);
        await _boardHub.NotifyBoardUpdatedAsync(boardId, ct);
    }
}
