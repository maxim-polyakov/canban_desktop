using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

public sealed record AiDescriptionRequest(Guid BoardId, string? Title, IssueType IssueType = IssueType.Task, string? IssueTypeName = null, string? Description = null, string? Language = null);
public sealed record AiJqlRequest(string Text, Guid? BoardId = null, string? Language = null);

/// <summary>Atlassian Intelligence-style helpers: issue summaries, description drafting and natural-language search.</summary>
public sealed class AiService
{
    private const int RequestsPerWindow = 30;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(10);
    private static readonly ConcurrentDictionary<Guid, Queue<DateTime>> Usage = new();

    private readonly CanbanDbContext _db;
    private readonly AiClient _ai;
    private readonly PermissionSchemeService _permissions;
    private readonly IJqlQueryService _jql;
    private readonly ILogger<AiService> _logger;

    public AiService(CanbanDbContext db, AiClient ai, PermissionSchemeService permissions, IJqlQueryService jql, ILogger<AiService> logger)
    {
        _db = db;
        _ai = ai;
        _permissions = permissions;
        _jql = jql;
        _logger = logger;
    }

    public bool IsEnabled => _ai.IsEnabled;

    public async Task<string> SummarizeIssueAsync(Guid questId, Guid userId, string? language, CancellationToken ct)
    {
        var quest = await _db.Quests.AsNoTracking()
            .Include(q => q.Column).Include(q => q.Assignees).ThenInclude(a => a.User)
            .FirstOrDefaultAsync(q => q.Id == questId, ct) ?? throw new KeyNotFoundException("Задача не найдена.");
        await _permissions.EnsureAsync(quest.BoardId, userId, JiraPermissions.Browse, ct, quest);
        Throttle(userId);

        var comments = await _db.QuestComments.AsNoTracking()
            .Where(c => c.QuestId == questId).OrderByDescending(c => c.CreatedAt).Take(40)
            .Select(c => new { c.CreatedAt, Author = c.AuthorUser.DisplayName, c.Text })
            .ToListAsync(ct);
        var sb = new StringBuilder();
        sb.AppendLine($"Задача {quest.IssueKey}: {quest.Title}");
        sb.AppendLine($"Тип: {quest.IssueType}; приоритет: {quest.Priority}; статус: {quest.Column?.Title}");
        if (quest.Assignees.Count > 0) sb.AppendLine("Исполнители: " + string.Join(", ", quest.Assignees.Select(a => a.User.DisplayName)));
        if (quest.DueDate.HasValue) sb.AppendLine($"Срок: {quest.DueDate:yyyy-MM-dd}");
        sb.AppendLine();
        sb.AppendLine("Описание:");
        sb.AppendLine(Clip(MentionService.ToPlainText(quest.Description), 6000) is { Length: > 0 } d ? d : "(пусто)");
        if (comments.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("Комментарии (от старых к новым):");
            foreach (var c in comments.AsEnumerable().Reverse())
                sb.AppendLine($"- {c.CreatedAt:yyyy-MM-dd} {c.Author}: {Clip(MentionService.ToPlainText(c.Text), 1000)}");
        }

        var system = $"""
            Ты помощник в трекере задач. Составь краткое содержание задачи для коллеги, который видит её впервые.
            Отвечай на языке: {LanguageName(language)}. Формат — Markdown без заголовков первого уровня:
            1–2 предложения сути, затем при наличии данных короткие списки «Ключевые моменты», «Принятые решения», «Открытые вопросы», «Следующие шаги».
            Пропускай разделы без данных. Не выдумывай факты, опирайся только на текст задачи и комментариев. Не более 180 слов.
            """;
        return await _ai.CompleteAsync(new AiMessage[] { new("system", system), new("user", sb.ToString()) }, 600, false, ct);
    }

    public async Task<string> DraftDescriptionAsync(AiDescriptionRequest request, Guid userId, CancellationToken ct)
    {
        await _permissions.EnsureAsync(request.BoardId, userId, JiraPermissions.Browse, ct);
        var title = request.Title?.Trim();
        var existing = Clip(MentionService.ToPlainText(request.Description), 6000);
        if (string.IsNullOrEmpty(title) && string.IsNullOrEmpty(existing)) throw new ArgumentException("Укажите название задачи, чтобы ИИ мог составить описание.");
        Throttle(userId);

        var board = await _db.Boards.AsNoTracking().Where(b => b.Id == request.BoardId).Select(b => new { b.Name, b.Description }).FirstOrDefaultAsync(ct);
        var structure = request.IssueType switch
        {
            IssueType.Bug => "разделы «Шаги воспроизведения» (нумерованный список), «Ожидаемый результат», «Фактический результат», «Окружение»",
            IssueType.Story => "пользовательская история в формате «Как <роль>, я хочу <действие>, чтобы <ценность>», затем «Критерии приёмки» списком",
            IssueType.Epic => "разделы «Цель», «Объём работ» списком, «Критерии успеха», «Вне рамок»",
            _ => "разделы «Цель», «Что нужно сделать» списком задач с чекбоксами (- [ ]), «Критерии готовности»",
        };
        var system = $"""
            Ты помощник в трекере задач, пишешь описания задач как опытный менеджер продукта.
            Отвечай на языке: {LanguageName(language: request.Language)}. Верни только текст описания в Markdown, без вступлений и без повторения названия.
            Структура: {structure}. Пиши конкретно и кратко, не более 220 слов.
            Если дано текущее описание — улучши его: сохрани все факты, ссылки и упоминания вида @Имя, исправь ошибки, добавь недостающую структуру.
            Не выдумывай технические детали; там, где данных не хватает, оставь короткую пометку в квадратных скобках, например [уточнить окружение].
            """;
        var user = new StringBuilder();
        if (board != null) user.AppendLine($"Пространство: {board.Name}" + (string.IsNullOrWhiteSpace(board.Description) ? "" : $" — {Clip(board.Description, 300)}"));
        user.AppendLine($"Тип задачи: {request.IssueTypeName ?? request.IssueType.ToString()}");
        user.AppendLine($"Название: {title}");
        user.AppendLine(string.IsNullOrEmpty(existing) ? "Текущего описания нет." : "Текущее описание:\n" + existing);
        return await _ai.CompleteAsync(new AiMessage[] { new("system", system), new("user", user.ToString()) }, 900, false, ct);
    }

    public async Task<NaturalJqlResult> ToJqlAsync(AiJqlRequest request, Guid userId, CancellationToken ct)
    {
        var text = request.Text?.Trim() ?? "";
        if (text.Length == 0) throw new ArgumentException("Опишите, какие задачи нужно найти.");
        if (text.Length > 500) throw new ArgumentException("Запрос не должен превышать 500 символов.");
        if (request.BoardId.HasValue) await _permissions.EnsureAsync(request.BoardId.Value, userId, JiraPermissions.Browse, ct);

        var rules = NaturalJql.Translate(text);
        if (!_ai.IsEnabled) return rules;
        Throttle(userId);
        try
        {
            var answer = await _ai.CompleteAsync(new AiMessage[] { new("system", await JqlPromptAsync(userId, request, ct)), new("user", text) }, 400, true, ct);
            using var doc = JsonDocument.Parse(answer);
            var jql = doc.RootElement.TryGetProperty("jql", out var j) ? j.GetString()?.Trim() : null;
            var explanation = doc.RootElement.TryGetProperty("explanation", out var e) ? e.GetString()?.Trim() : null;
            if (string.IsNullOrEmpty(jql)) return rules;
            await _jql.SearchAsync(jql, userId, 1, 1, request.BoardId, ct);
            return new NaturalJqlResult(jql, string.IsNullOrEmpty(explanation) ? rules.Explanation : explanation, "ai");
        }
        catch (Exception ex) when (ex is JsonException or ArgumentException or FormatException or InvalidOperationException && !ct.IsCancellationRequested)
        {
            _logger.LogInformation("AI JQL fell back to rules: {Error}", ex.GetType().Name);
            return rules;
        }
    }

    private async Task<string> JqlPromptAsync(Guid userId, AiJqlRequest request, CancellationToken ct)
    {
        var teamIds = await _db.TeamMembers.AsNoTracking().Where(m => m.UserId == userId).Select(m => m.TeamId)
            .Union(_db.Teams.AsNoTracking().Where(t => t.OwnerId == userId).Select(t => t.Id)).ToListAsync(ct);
        var people = await _db.TeamMembers.AsNoTracking().Where(m => teamIds.Contains(m.TeamId))
            .Select(m => new { m.UserId, m.User.DisplayName }).Distinct().Take(60).ToListAsync(ct);
        var statusQuery = _db.Columns.AsNoTracking().Where(c => c.Kind != ColumnKind.Archive);
        statusQuery = request.BoardId.HasValue ? statusQuery.Where(c => c.BoardId == request.BoardId) : statusQuery.Where(c => teamIds.Contains(c.Board.TeamId));
        var statuses = await statusQuery.Select(c => c.Title).Distinct().Take(40).ToListAsync(ct);
        var customTypes = await _db.IssueTypeDefinitions.AsNoTracking().Where(t => teamIds.Contains(t.TeamId)).Select(t => t.Name).Distinct().Take(30).ToListAsync(ct);
        var spaces = await _db.Boards.AsNoTracking().Where(b => teamIds.Contains(b.TeamId)).Select(b => new { b.KeyPrefix, b.Name }).Take(40).ToListAsync(ct);

        return $$"""
            Ты переводишь запросы пользователя трекера задач на JQL (Jira Query Language). Сегодня {{DateTime.UtcNow:yyyy-MM-dd}} (UTC).
            Верни строго JSON: {"jql": "...", "explanation": "..."}; explanation — одно короткое предложение на языке: {{LanguageName(request.Language)}}, что именно ищем.
            Поддерживаемые поля: key, summary, description, text (поиск по ключу, названию и описанию), status, statusCategory ("To Do", "In Progress", Done),
            type (Epic, Story, Task, Bug, Subtask{{(customTypes.Count > 0 ? ", " + string.Join(", ", customTypes.Select(Quote)) : "")}}),
            priority (Highest, High, Medium, Low, Lowest), assignee, reporter, watcher, voter, votes, watchers, sprint, labels, component, fixVersion,
            storyPoints, created, updated, duedate, startdate, resolved, resolution (Unresolved — не решена), project (ключ пространства).
            Операторы: =, !=, >, >=, <, <=, ~ (содержит), !~, IN (...), NOT IN (...), IS EMPTY, IS NOT EMPTY, AND, OR, NOT, скобки, ORDER BY поле ASC|DESC.
            Функции: currentUser(), openSprints() (только как sprint IN (openSprints())), now(), startOfDay(), endOfDay(), startOfWeek(), endOfWeek(), startOfMonth(), endOfMonth(), startOfYear(), endOfYear();
            у функций дат может быть смещение: startOfWeek(-1) — начало прошлой недели, startOfDay(-7d) — неделю назад.
            Относительные даты пиши в кавычках: "-7d", "-2w", "-1M", "-4h". Строки со пробелами бери в двойные кавычки.
            Пользователей указывай только через currentUser() или их id из списка ниже, никогда не по имени.
            Пользователи: {{(people.Count == 0 ? "нет" : string.Join("; ", people.Select(p => $"{p.DisplayName} = {p.UserId}")))}}.
            Статусы: {{(statuses.Count == 0 ? "нет" : string.Join(", ", statuses.Select(Quote)))}}.
            Пространства: {{(spaces.Count == 0 ? "нет" : string.Join(", ", spaces.Select(s => $"{s.KeyPrefix} ({s.Name})")))}}.
            «Мои задачи» означает assignee = currentUser(). «Открытые» — resolution = Unresolved. Если не уверен в поле — используй text ~ "...".
            Не добавляй условия, о которых пользователь не просил.
            """;
    }

    private static void Throttle(Guid userId)
    {
        var now = DateTime.UtcNow;
        var queue = Usage.GetOrAdd(userId, _ => new Queue<DateTime>());
        lock (queue)
        {
            while (queue.Count > 0 && now - queue.Peek() > Window) queue.Dequeue();
            if (queue.Count >= RequestsPerWindow) throw new InvalidOperationException("Слишком много запросов к ИИ. Подождите несколько минут.");
            queue.Enqueue(now);
        }
    }

    private static string Quote(string value) => "\"" + value.Replace("\"", "'") + "\"";

    private static string Clip(string? text, int max)
    {
        var value = (text ?? "").Trim();
        return value.Length <= max ? value : value[..max] + "…";
    }

    private static string LanguageName(string? language) => (language ?? "ru").ToLowerInvariant() switch
    {
        var l when l.StartsWith("en") => "английский",
        var l when l.StartsWith("uk") => "украинский",
        var l when l.StartsWith("de") => "немецкий",
        var l when l.StartsWith("es") => "испанский",
        var l when l.StartsWith("fr") => "французский",
        var l when l.StartsWith("zh") => "китайский",
        var l when l.StartsWith("ru") || l.Length == 0 => "русский",
        var l => $"язык с кодом {l}",
    };
}
