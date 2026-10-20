using CanbanServer.Domain.Entities;

namespace CanbanServer.Infrastructure.Services;

public sealed record SpaceTemplateColumn(string Title, ColumnKind Kind);

public sealed record SpaceTemplate(
    string Id,
    string Category,
    string Icon,
    string Title,
    string Description,
    string BestFor,
    IReadOnlyList<IssueType> IssueTypes,
    IReadOnlyList<SpaceTemplateColumn> Columns,
    IReadOnlyList<string> Features,
    bool CreatesSprint = false,
    bool Featured = false);

/// <summary>Jira-like space template gallery: each template defines its workflow (columns), work types and enabled views.</summary>
public static class SpaceTemplates
{
    public static readonly string[] AllFeatures = { "summary", "backlog", "board", "list", "timeline", "calendar", "docs", "forms", "development", "reports", "releases", "archive" };
    public static readonly string[] LegacyFeatures = { "board", "backlog", "timeline", "docs", "forms", "development", "releases", "reports", "archive" };
    /// <summary>Jira spaces always offer documents and forms; software spaces also get the development view.</summary>
    private static readonly string[] ContentFeatures = { "docs", "forms" };
    public static readonly string[] ManagementTypes = { "team", "company" };
    public static readonly string[] AccessLevels = { "open", "limited", "private" };

    public static readonly IReadOnlyList<(string Id, string Title)> Categories = new[]
    {
        ("software", "Разработка ПО"),
        ("work", "Управление работой"),
        ("marketing", "Маркетинг"),
        ("hr", "Кадры"),
        ("finance", "Финансы"),
        ("sales", "Продажи"),
        ("design", "Дизайн"),
        ("operations", "Операции"),
        ("personal", "Личное"),
    };

    private static SpaceTemplateColumn Todo(string title = "К выполнению") => new(title, ColumnKind.Backlog);
    private static SpaceTemplateColumn Doing(string title = "В работе") => new(title, ColumnKind.InProgress);
    private static SpaceTemplateColumn Review(string title) => new(title, ColumnKind.Review);
    private static SpaceTemplateColumn Step(string title) => new(title, ColumnKind.Custom);
    private static SpaceTemplateColumn Done(string title = "Готово") => new(title, ColumnKind.Done);

    private static readonly IssueType[] Software = { IssueType.Epic, IssueType.Story, IssueType.Task, IssueType.Bug, IssueType.Subtask };
    private static readonly IssueType[] Business = { IssueType.Epic, IssueType.Task, IssueType.Subtask };

    public static readonly IReadOnlyList<SpaceTemplate> All = Templates()
        .Select(t => t with
        {
            Features = t.Features.Concat(ContentFeatures).Concat(t.Category == "software" ? new[] { "development" } : Array.Empty<string>())
                .Distinct().ToList(),
        })
        .ToList();

    private static SpaceTemplate[] Templates() => new[]
    {
        new SpaceTemplate("kanban", "software", "board", "Канбан",
            "Визуализируйте работу на доске и ограничивайте незавершённую работу, чтобы задачи двигались быстрее.",
            "Командам, которые работают непрерывным потоком задач",
            Software, new[] { Todo(), Doing(), Done() },
            new[] { "summary", "board", "list", "timeline", "calendar", "reports", "releases", "archive" }, Featured: true),
        new SpaceTemplate("scrum", "software", "releases", "Scrum",
            "Планируйте спринты, ведите бэклог и отслеживайте скорость команды.",
            "Командам, которые выпускают результат короткими итерациями",
            Software, new[] { Todo(), Doing(), Review("На проверке"), Done() },
            new[] { "summary", "backlog", "board", "timeline", "reports", "releases", "archive" }, CreatesSprint: true, Featured: true),
        new SpaceTemplate("bugs", "software", "issues", "Отслеживание ошибок",
            "Собирайте, приоритизируйте и исправляйте ошибки в одном списке.",
            "Командам поддержки и QA",
            new[] { IssueType.Bug, IssueType.Task, IssueType.Subtask },
            new[] { Todo("Новая"), Step("Подтверждена"), Doing(), Review("На проверке"), Done("Исправлена") },
            new[] { "summary", "list", "board", "reports", "releases", "archive" }),
        new SpaceTemplate("top-level-planning", "software", "plans", "Планирование верхнего уровня",
            "Отслеживайте крупные инициативы и эпики нескольких команд на общем таймлайне.",
            "Руководителям программ и продуктов",
            Business, new[] { Todo(), Doing(), Done() },
            new[] { "summary", "timeline", "list", "board", "reports", "archive" }),

        new SpaceTemplate("project-management", "work", "projects", "Управление проектами",
            "Планируйте проект, распределяйте задачи и следите за сроками на таймлайне и в календаре.",
            "Командам любого профиля, которые ведут проекты",
            Business, new[] { Todo(), Doing(), Done() },
            new[] { "summary", "list", "board", "timeline", "calendar", "archive" }, Featured: true),
        new SpaceTemplate("task-tracking", "work", "check", "Отслеживание задач",
            "Простой список дел команды: кто что делает и что уже готово.",
            "Небольшим командам и личным задачам",
            Business, new[] { Todo(), Doing(), Done() },
            new[] { "summary", "list", "board", "calendar", "archive" }),
        new SpaceTemplate("process-control", "work", "workflow", "Контроль процессов",
            "Ведите повторяющиеся процессы по шагам и контролируйте, на каком этапе каждая заявка.",
            "Операционным командам",
            Business, new[] { Todo("Запрошено"), Doing(), Review("На согласовании"), Done("Выполнено") },
            new[] { "summary", "list", "board", "reports", "archive" }),
        new SpaceTemplate("document-approval", "work", "docs", "Согласование документов",
            "Проводите документы через черновик, проверку и согласование.",
            "Юристам, бухгалтерии и руководителям",
            Business, new[] { Todo("Черновик"), Review("На согласовании"), Step("Отклонено"), Done("Согласовано") },
            new[] { "summary", "list", "board", "calendar", "archive" }),

        new SpaceTemplate("campaign-management", "marketing", "sparkle", "Управление кампаниями",
            "Планируйте маркетинговые кампании от идеи до запуска и измеряйте результат.",
            "Маркетинговым командам",
            Business, new[] { Todo("Идея"), Step("Планирование"), Doing(), Review("На проверке"), Done("Запущено") },
            new[] { "summary", "list", "board", "timeline", "calendar", "archive" }),
        new SpaceTemplate("content-plan", "marketing", "docs", "Контент-план",
            "Ведите календарь публикаций: идеи, тексты, редактура и выход материалов.",
            "Редакциям и SMM",
            Business, new[] { Todo("Идея"), Doing("Пишется"), Review("Редактура"), Done("Опубликовано") },
            new[] { "summary", "calendar", "board", "list", "archive" }),
        new SpaceTemplate("event-planning", "marketing", "dashboards", "Планирование мероприятий",
            "Готовьте конференции, митапы и встречи: подрядчики, площадка, программа.",
            "Ивент-менеджерам",
            Business, new[] { Todo("Планирование"), Doing("Подготовка"), Review("Готово к проведению"), Done("Проведено") },
            new[] { "summary", "calendar", "list", "board", "timeline", "archive" }),

        new SpaceTemplate("recruitment", "hr", "person", "Найм",
            "Ведите кандидатов по этапам воронки найма — от отклика до оффера.",
            "HR и нанимающим менеджерам",
            new[] { IssueType.Task, IssueType.Subtask },
            new[] { Todo("Отклик"), Step("Скрининг"), Doing("Интервью"), Review("Оффер"), Done("Нанят") },
            new[] { "summary", "board", "list", "calendar", "reports", "archive" }, Featured: true),
        new SpaceTemplate("onboarding", "hr", "teams", "Онбординг сотрудников",
            "Чек-листы адаптации для каждого нового сотрудника: доступы, техника, обучение.",
            "HR и руководителям",
            Business, new[] { Todo(), Doing("В процессе"), Done("Завершено") },
            new[] { "summary", "list", "board", "calendar", "archive" }),

        new SpaceTemplate("procurement", "finance", "billing", "Закупки",
            "Принимайте заявки на закупку, согласовывайте и отслеживайте поставку.",
            "Отделам закупок и бухгалтерии",
            Business, new[] { Todo("Заявка"), Review("Согласование"), Doing("Заказано"), Done("Получено") },
            new[] { "summary", "list", "board", "reports", "archive" }),
        new SpaceTemplate("expense-approval", "finance", "card", "Согласование расходов",
            "Сотрудники подают расходы, финансы проверяют и выплачивают.",
            "Финансовым командам",
            Business, new[] { Todo("Подана"), Review("На проверке"), Step("Одобрена"), Done("Выплачена") },
            new[] { "summary", "list", "board", "calendar", "archive" }),

        new SpaceTemplate("sales-pipeline", "sales", "reports", "Воронка продаж",
            "Ведите сделки по этапам воронки и прогнозируйте выручку.",
            "Отделам продаж",
            Business, new[] { Todo("Лид"), Step("Квалификация"), Doing("Предложение"), Review("Переговоры"), Done("Сделка закрыта") },
            new[] { "summary", "board", "list", "reports", "archive" }),
        new SpaceTemplate("lead-tracking", "sales", "forYou", "Отслеживание лидов",
            "Собирайте входящие лиды, квалифицируйте и передавайте в продажи.",
            "Маркетингу и продажам",
            Business, new[] { Todo("Новый"), Doing(), Step("Отклонён"), Done("Квалифицирован") },
            new[] { "summary", "list", "board", "archive" }),

        new SpaceTemplate("design-requests", "design", "customize", "Дизайн-заявки",
            "Принимайте запросы на дизайн, ведите ревью и сдавайте макеты.",
            "Дизайн-командам",
            Business, new[] { Todo("Запрос"), Doing(), Review("На ревью"), Done() },
            new[] { "summary", "board", "list", "calendar", "archive" }),

        new SpaceTemplate("it-help", "operations", "help", "ИТ-поддержка",
            "Принимайте обращения сотрудников, решайте их и не теряйте ни одной заявки.",
            "ИТ-отделам и службам поддержки",
            new[] { IssueType.Task, IssueType.Bug, IssueType.Subtask },
            new[] { Todo("Открыта"), Doing(), Step("Ожидает пользователя"), Done("Решена") },
            new[] { "summary", "list", "board", "reports", "archive" }),
        new SpaceTemplate("legal-requests", "operations", "lock", "Юридические запросы",
            "Регистрируйте запросы к юристам, согласуйте договоры и фиксируйте решения.",
            "Юридическим отделам",
            Business, new[] { Todo("Новый запрос"), Doing(), Review("На согласовании"), Done("Закрыт") },
            new[] { "summary", "list", "board", "calendar", "archive" }),

        new SpaceTemplate("personal", "personal", "user", "Личный планировщик",
            "Планируйте личные дела и цели в списке, на доске и в календаре.",
            "Для себя",
            new[] { IssueType.Task, IssueType.Subtask },
            new[] { Todo(), Doing(), Done() },
            new[] { "list", "board", "calendar", "archive" }),
    };

    public static SpaceTemplate Find(string? id) =>
        All.FirstOrDefault(t => string.Equals(t.Id, id, StringComparison.OrdinalIgnoreCase)) ?? All[0];

    /// <summary>Keeps only known views, in canonical order, always including the board.</summary>
    public static string NormalizeFeatures(IEnumerable<string> features)
    {
        var set = features.Select(f => f.Trim().ToLowerInvariant()).ToHashSet();
        set.Add("board");
        return string.Join(',', AllFeatures.Where(set.Contains));
    }
}
