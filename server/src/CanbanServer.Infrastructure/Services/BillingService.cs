using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Limits are null when unlimited. Prices are per user per month in rubles; null means "contact sales".</summary>
public record BillingPlan(string Id, string Name, string Tagline, decimal? PricePerUser, int? MaxUsers, int? StorageGb, int? AutomationRules, bool SelfServe);

public static class BillingPlans
{
    public const string Free = "free";
    public const string Standard = "standard";
    public const string Premium = "premium";
    public const string Enterprise = "enterprise";
    public static readonly string[] Cycles = { "monthly", "annual" };
    /// <summary>Annual billing charges 10 months for 12.</summary>
    public const int AnnualMonths = 10;

    public static readonly IReadOnlyList<BillingPlan> All = new[]
    {
        new BillingPlan(Free, "Free", "Для небольших команд, которые только начинают", 0, 10, 2, 10, true),
        new BillingPlan(Standard, "Standard", "Для растущих команд, которым нужны роли и больше места", 690, 50000, 250, 100, true),
        new BillingPlan(Premium, "Premium", "Для планирования между командами и масштабирования", 1290, 50000, null, null, true),
        new BillingPlan(Enterprise, "Enterprise", "Для организаций с повышенными требованиями к безопасности и поддержке", null, null, null, null, false),
    };

    /// <summary>Feature matrix: label and the lowest plan that includes it.</summary>
    public static readonly IReadOnlyList<(string Label, string MinPlan, string Group)> Features = new[]
    {
        ("Доски Scrum и Kanban, бэклог и спринты", Free, "Планирование и отслеживание"),
        ("Шаблоны разделов", Free, "Планирование и отслеживание"),
        ("Отчёты и дашборды", Free, "Планирование и отслеживание"),
        ("Проекты и цели с обновлениями статуса", Free, "Планирование и отслеживание"),
        ("Планы на несколько разделов: таймлайн, ёмкость, сценарии", Premium, "Планирование и отслеживание"),
        ("Активы и CMDB", Premium, "Планирование и отслеживание"),
        ("Автоматизация", Free, "Автоматизация и интеграции"),
        ("Интеграция с GitHub и вебхуки", Free, "Автоматизация и интеграции"),
        ("Роли и разрешения в разделах", Standard, "Администрирование"),
        ("Открытые и ограниченные разделы", Standard, "Администрирование"),
        ("Журнал изменений задач", Standard, "Администрирование"),
        ("Гарантия доступности 99,9%", Premium, "Надёжность и поддержка"),
        ("Поддержка 24/7", Enterprise, "Надёжность и поддержка"),
        ("Выделенный менеджер и договор с SLA", Enterprise, "Надёжность и поддержка"),
    };

    public static BillingPlan Find(string? id) => All.FirstOrDefault(p => p.Id == id) ?? All[0];

    public static int Rank(string plan) => All.ToList().FindIndex(p => p.Id == plan);

    public static decimal MonthlyAmount(BillingPlan plan, int users) => (plan.PricePerUser ?? 0) * Math.Max(users, 1);

    public static decimal InvoiceAmount(BillingPlan plan, string cycle, int users) =>
        cycle == "annual" ? MonthlyAmount(plan, users) * AnnualMonths : MonthlyAmount(plan, users);

    public static DateTime NextInvoiceDate(string cycle, DateTime startedAt, DateTime now)
    {
        if (cycle != "annual") return new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1);
        var next = new DateTime(startedAt.Year, startedAt.Month, startedAt.Day, 0, 0, 0, DateTimeKind.Utc);
        while (next <= now) next = next.AddYears(1);
        return next;
    }

    /// <summary>Reasons the usage does not fit the plan; empty when it fits.</summary>
    public static List<string> Violations(BillingPlan plan, int users, long storageBytes, int automationRules)
    {
        var result = new List<string>();
        if (plan.MaxUsers is int maxUsers && users > maxUsers) result.Add($"В плане {plan.Name} до {maxUsers} пользователей, у вас {users}");
        if (plan.StorageGb is int gb && storageBytes > gb * 1024L * 1024 * 1024) result.Add($"В плане {plan.Name} до {gb} ГБ хранилища");
        if (plan.AutomationRules is int rules && automationRules > rules) result.Add($"В плане {plan.Name} до {rules} правил автоматизации, у вас {automationRules}");
        return result;
    }

    public static bool IsListed(string? emails, string email) =>
        !string.IsNullOrWhiteSpace(email) && (emails ?? "")
            .Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries)
            .Any(e => string.Equals(e.Trim(), email.Trim(), StringComparison.OrdinalIgnoreCase));
}

/// <summary>Plans and invoices for site owners. Accounts listed in Billing:EnterpriseEmails get Enterprise free of charge.</summary>
public class BillingService
{
    private readonly CanbanDbContext _db;
    private readonly IConfiguration _config;

    public BillingService(CanbanDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    private sealed record Usage(int Users, int Teams, int Spaces, long StorageBytes, int AutomationRules);

    private async Task<Usage> UsageAsync(Guid userId, CancellationToken ct)
    {
        var teamIds = await _db.Teams.AsNoTracking().Where(t => t.OwnerId == userId).Select(t => t.Id).ToListAsync(ct);
        var members = await _db.TeamMembers.AsNoTracking().Where(m => teamIds.Contains(m.TeamId)).Select(m => m.UserId).Distinct().ToListAsync(ct);
        var boardIds = await _db.Boards.AsNoTracking().Where(b => teamIds.Contains(b.TeamId)).Select(b => b.Id).ToListAsync(ct);
        var storage = await _db.QuestAttachments.AsNoTracking().Where(a => boardIds.Contains(a.Quest.BoardId)).SumAsync(a => (long?)a.SizeBytes, ct) ?? 0;
        var rules = await _db.AutomationRules.AsNoTracking().CountAsync(r => boardIds.Contains(r.BoardId), ct);
        return new Usage(members.Append(userId).Distinct().Count(), teamIds.Count, boardIds.Count, storage, rules);
    }

    private async Task<(BillingSubscription? Subscription, bool Complimentary, string Plan, string Cycle)> ResolveAsync(Guid userId, CancellationToken ct)
    {
        var email = await _db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.Email).FirstOrDefaultAsync(ct)
            ?? throw new KeyNotFoundException("User not found");
        var subscription = await _db.BillingSubscriptions.AsNoTracking().FirstOrDefaultAsync(s => s.UserId == userId, ct);
        if (BillingPlans.IsListed(_config["Billing:EnterpriseEmails"], email))
            return (subscription, true, BillingPlans.Enterprise, "annual");
        return (subscription, false, BillingPlans.Find(subscription?.Plan).Id, subscription?.Cycle ?? "monthly");
    }

    public async Task<object> GetAsync(Guid userId, CancellationToken ct)
    {
        var (subscription, complimentary, planId, cycle) = await ResolveAsync(userId, ct);
        var plan = BillingPlans.Find(planId);
        var usage = await UsageAsync(userId, ct);
        var now = DateTime.UtcNow;
        var amount = complimentary ? 0 : BillingPlans.InvoiceAmount(plan, cycle, usage.Users);
        var history = await _db.BillingPlanChanges.AsNoTracking().Where(c => c.UserId == userId)
            .OrderByDescending(c => c.CreatedAt).Take(20).ToListAsync(ct);
        return new
        {
            plan = plan.Id,
            planName = plan.Name,
            cycle,
            complimentary,
            hideUpsell = complimentary || plan.Id == BillingPlans.Enterprise,
            startedAt = subscription?.StartedAt,
            nextInvoiceAt = complimentary || amount == 0 ? (DateTime?)null : BillingPlans.NextInvoiceDate(cycle, subscription?.StartedAt ?? now, now),
            amount,
            pricePerUser = complimentary ? 0 : plan.PricePerUser,
            usage = new { users = usage.Users, teams = usage.Teams, spaces = usage.Spaces, storageBytes = usage.StorageBytes, automationRules = usage.AutomationRules },
            limits = new { maxUsers = plan.MaxUsers, storageGb = plan.StorageGb, automationRules = plan.AutomationRules },
            overLimit = complimentary ? new List<string>() : BillingPlans.Violations(plan, usage.Users, usage.StorageBytes, usage.AutomationRules),
            history = history.Select(h => new { h.Id, h.FromPlan, h.ToPlan, h.Cycle, h.Users, h.Amount, h.CreatedAt }),
            plans = complimentary ? null : Catalog(),
        };
    }

    public static object Catalog() => new
    {
        plans = BillingPlans.All.Select(p => new { p.Id, p.Name, p.Tagline, p.PricePerUser, p.MaxUsers, p.StorageGb, p.AutomationRules, p.SelfServe }),
        features = BillingPlans.Features.Select(f => new { label = f.Label, minPlan = f.MinPlan, group = f.Group }),
        annualMonths = BillingPlans.AnnualMonths,
    };

    public async Task<object> QuoteAsync(Guid userId, string plan, string cycle, CancellationToken ct)
    {
        var (_, complimentary, current, currentCycle) = await ResolveAsync(userId, ct);
        if (complimentary) throw new InvalidOperationException("Your Enterprise plan is provided free of charge");
        var target = ValidateTarget(plan, cycle);
        var usage = await UsageAsync(userId, ct);
        var now = DateTime.UtcNow;
        return new
        {
            plan = target.Id,
            planName = target.Name,
            cycle,
            currentPlan = current,
            currentCycle,
            isChange = target.Id != current || cycle != currentCycle,
            direction = Math.Sign(BillingPlans.Rank(target.Id) - BillingPlans.Rank(current)),
            users = usage.Users,
            pricePerUser = target.PricePerUser,
            monthly = BillingPlans.MonthlyAmount(target, usage.Users),
            amount = BillingPlans.InvoiceAmount(target, cycle, usage.Users),
            nextInvoiceAt = target.Id == BillingPlans.Free ? (DateTime?)null : BillingPlans.NextInvoiceDate(cycle, now, now),
            blockers = BillingPlans.Violations(target, usage.Users, usage.StorageBytes, usage.AutomationRules),
        };
    }

    public async Task<object> ChangeAsync(Guid userId, string plan, string cycle, CancellationToken ct)
    {
        var (_, complimentary, current, _) = await ResolveAsync(userId, ct);
        if (complimentary) throw new InvalidOperationException("Your Enterprise plan is provided free of charge");
        var target = ValidateTarget(plan, cycle);
        var usage = await UsageAsync(userId, ct);
        var blockers = BillingPlans.Violations(target, usage.Users, usage.StorageBytes, usage.AutomationRules);
        if (blockers.Count > 0) throw new InvalidOperationException(string.Join("; ", blockers));

        var now = DateTime.UtcNow;
        var subscription = await _db.BillingSubscriptions.FirstOrDefaultAsync(s => s.UserId == userId, ct);
        if (subscription == null)
        {
            subscription = new BillingSubscription { UserId = userId, StartedAt = now };
            _db.BillingSubscriptions.Add(subscription);
        }
        else if (subscription.Plan != target.Id || subscription.Cycle != cycle) subscription.StartedAt = now;
        subscription.Plan = target.Id;
        subscription.Cycle = cycle;
        subscription.UpdatedAt = now;
        _db.BillingPlanChanges.Add(new BillingPlanChange
        {
            Id = Guid.NewGuid(), UserId = userId, FromPlan = current, ToPlan = target.Id, Cycle = cycle, Users = usage.Users,
            Amount = BillingPlans.InvoiceAmount(target, cycle, usage.Users), CreatedAt = now,
        });
        await _db.SaveChangesAsync(ct);
        return await GetAsync(userId, ct);
    }

    private static BillingPlan ValidateTarget(string plan, string cycle)
    {
        var target = BillingPlans.All.FirstOrDefault(p => p.Id == plan) ?? throw new ArgumentException("Unknown plan");
        if (!BillingPlans.Cycles.Contains(cycle)) throw new ArgumentException("Unknown billing cycle");
        if (!target.SelfServe) throw new ArgumentException("Contact sales to switch to Enterprise");
        return target;
    }
}
