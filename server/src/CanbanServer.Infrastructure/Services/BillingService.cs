using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

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
        new BillingPlan(Premium, "Premium", "Для планирования между командами и масштабирования", 1290, 50000, 500, null, true),
        new BillingPlan(Enterprise, "Enterprise", "Для организаций с повышенными требованиями к безопасности и поддержке", null, null, null, null, false),
    };

    /// <summary>Feature matrix: label and the lowest plan that includes it.</summary>
    public static readonly IReadOnlyList<(string Label, string MinPlan, string Group)> Features = new[]
    {
        ("Доски Scrum и Kanban, бэклог и спринты", Free, "Планирование и отслеживание"),
        ("Шаблоны разделов", Standard, "Планирование и отслеживание"),
        ("Отчёты и дашборды", Free, "Планирование и отслеживание"),
        ("Проекты и цели с обновлениями статуса", Free, "Планирование и отслеживание"),
        ("Планы на несколько разделов: таймлайн, ёмкость, сценарии", Premium, "Планирование и отслеживание"),
        ("Активы и CMDB", Premium, "Планирование и отслеживание"),
        ("Автоматизация", Free, "Автоматизация и интеграции"),
        ("Интеграция с GitHub и вебхуки", Free, "Автоматизация и интеграции"),
        ("Открытые и ограниченные разделы", Free, "Администрирование"),
        ("Журнал изменений задач", Free, "Администрирование"),
        ("Общие схемы прав и уведомлений", Standard, "Администрирование"),
        ("Гарантия доступности 99,9%", Premium, "Надёжность и поддержка"),
        ("Поддержка 24/7", Enterprise, "Надёжность и поддержка"),
        ("Выделенный менеджер и договор с SLA", Enterprise, "Надёжность и поддержка"),
    };

    public static BillingPlan Find(string? id) => All.FirstOrDefault(p => p.Id == id) ?? All[0];

    public static int Rank(string plan) => All.ToList().FindIndex(p => p.Id == plan);

    public static long? StorageLimitBytes(BillingPlan plan) =>
        plan.StorageGb is int gb ? gb * 1024L * 1024 * 1024 : null;

    public static BillingPlan? NextWithMoreStorage(BillingPlan plan) =>
        All.Skip(Rank(plan.Id) + 1)
            .FirstOrDefault(candidate => candidate.StorageGb == null || candidate.StorageGb > plan.StorageGb);

    public static decimal MonthlyAmount(BillingPlan plan, int users) => (plan.PricePerUser ?? 0) * Math.Max(users, 1);

    public static decimal InvoiceAmount(BillingPlan plan, string cycle, int users) =>
        cycle == "annual" ? MonthlyAmount(plan, users) * AnnualMonths : MonthlyAmount(plan, users);

    public static DateTime PeriodEnd(string cycle, DateTime from) => cycle == "annual" ? from.AddYears(1) : from.AddMonths(1);

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
        if (plan.StorageGb is int gb && storageBytes > StorageLimitBytes(plan)) result.Add($"В плане {plan.Name} до {gb} ГБ хранилища");
        if (plan.AutomationRules is int rules && automationRules > rules) result.Add($"В плане {plan.Name} до {rules} правил автоматизации, у вас {automationRules}");
        return result;
    }

    public static bool IsListed(string? emails, string email) =>
        !string.IsNullOrWhiteSpace(email) && (emails ?? "")
            .Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries)
            .Any(e => string.Equals(e.Trim(), email.Trim(), StringComparison.OrdinalIgnoreCase));
}

/// <summary>
/// Plans and online payments (YooKassa) for site owners. Paid plans start only after a successful payment;
/// accounts listed in Billing:EnterpriseEmails get Enterprise free of charge.
/// </summary>
public class BillingService
{
    /// <summary>Subscriptions switched on before online payments get this long to pay.</summary>
    public static readonly TimeSpan LegacyGrace = TimeSpan.FromDays(7);

    private readonly CanbanDbContext _db;
    private readonly IConfiguration _config;
    private readonly YooKassaClient _yookassa;
    private readonly ILogger<BillingService> _logger;

    public BillingService(CanbanDbContext db, IConfiguration config, YooKassaClient yookassa, ILogger<BillingService> logger)
    {
        _db = db;
        _config = config;
        _yookassa = yookassa;
        _logger = logger;
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

    private async Task<(BillingSubscription? Subscription, bool Complimentary, string Plan, string Cycle, string Email)> ResolveAsync(Guid userId, CancellationToken ct)
    {
        var email = await _db.Users.AsNoTracking().Where(u => u.Id == userId).Select(u => u.Email).FirstOrDefaultAsync(ct)
            ?? throw new KeyNotFoundException("User not found");
        var subscription = await _db.BillingSubscriptions.AsNoTracking().FirstOrDefaultAsync(s => s.UserId == userId, ct);
        if (BillingPlans.IsListed(_config["Billing:EnterpriseEmails"], email))
            return (subscription, true, BillingPlans.Enterprise, "annual", email);
        var plan = PlanAccessService.Effective(subscription?.Plan, subscription?.PaidUntil, DateTime.UtcNow);
        return (subscription, false, plan, subscription?.Cycle ?? "monthly", email);
    }

    public async Task<object> GetAsync(Guid userId, CancellationToken ct)
    {
        var (subscription, complimentary, planId, cycle, _) = await ResolveAsync(userId, ct);
        var plan = BillingPlans.Find(planId);
        var usage = await UsageAsync(userId, ct);
        var now = DateTime.UtcNow;
        var amount = complimentary ? 0 : BillingPlans.InvoiceAmount(plan, cycle, usage.Users);
        var paid = !complimentary && plan.Id != BillingPlans.Free;
        var paidUntil = paid ? subscription?.PaidUntil : null;
        var history = await _db.BillingPlanChanges.AsNoTracking().Where(c => c.UserId == userId)
            .OrderByDescending(c => c.CreatedAt).Take(20).ToListAsync(ct);
        var payments = await _db.BillingPayments.AsNoTracking().Where(p => p.UserId == userId && p.Status != "pending")
            .OrderByDescending(p => p.CreatedAt).Take(20).ToListAsync(ct);
        return new
        {
            plan = plan.Id,
            planName = plan.Name,
            cycle,
            complimentary,
            hideUpsell = complimentary || plan.Id == BillingPlans.Enterprise,
            startedAt = subscription?.StartedAt,
            nextInvoiceAt = !paid || amount == 0 ? (DateTime?)null : paidUntil ?? BillingPlans.NextInvoiceDate(cycle, subscription?.StartedAt ?? now, now),
            amount,
            pricePerUser = complimentary ? 0 : plan.PricePerUser,
            paidUntil,
            paymentDue = paid && paidUntil.HasValue && paidUntil.Value <= now.AddDays(7)
                && !(subscription!.AutoRenew && subscription.PaymentMethodId != null && _yookassa.RecurringEnabled),
            expired = paid && paidUntil.HasValue && paidUntil.Value < now,
            onlinePayments = _yookassa.IsEnabled,
            autoRenew = paid && subscription!.AutoRenew && subscription.PaymentMethodId != null && _yookassa.RecurringEnabled,
            paymentMethod = paid ? subscription?.PaymentMethodTitle : null,
            usage = new { users = usage.Users, teams = usage.Teams, spaces = usage.Spaces, storageBytes = usage.StorageBytes, automationRules = usage.AutomationRules },
            limits = new { maxUsers = plan.MaxUsers, storageGb = plan.StorageGb, automationRules = plan.AutomationRules },
            overLimit = complimentary ? new List<string>() : BillingPlans.Violations(plan, usage.Users, usage.StorageBytes, usage.AutomationRules),
            history = history.Select(h => new { h.Id, h.FromPlan, h.ToPlan, h.Cycle, h.Users, h.Amount, h.CreatedAt }),
            payments = payments.Select(p => new { p.Id, p.Plan, p.Cycle, p.Users, p.Amount, p.Status, p.Kind, p.Error, p.CreatedAt, p.PaidAt }),
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
        var (subscription, complimentary, current, currentCycle, _) = await ResolveAsync(userId, ct);
        if (complimentary) throw new InvalidOperationException("Your Enterprise plan is provided free of charge");
        var target = ValidateTarget(plan, cycle);
        var usage = await UsageAsync(userId, ct);
        var now = DateTime.UtcNow;
        var isChange = target.Id != current || cycle != currentCycle;
        var paidUntil = current == BillingPlans.Free ? null : subscription?.PaidUntil;
        var renewal = !isChange && target.Id != BillingPlans.Free;
        var amount = BillingPlans.InvoiceAmount(target, cycle, usage.Users);
        return new
        {
            plan = target.Id,
            planName = target.Name,
            cycle,
            currentPlan = current,
            currentCycle,
            isChange,
            renewal,
            direction = Math.Sign(BillingPlans.Rank(target.Id) - BillingPlans.Rank(current)),
            users = usage.Users,
            pricePerUser = target.PricePerUser,
            monthly = BillingPlans.MonthlyAmount(target, usage.Users),
            amount,
            requiresPayment = amount > 0,
            onlinePayments = _yookassa.IsEnabled,
            paidUntil,
            periodEnd = target.Id == BillingPlans.Free ? (DateTime?)null
                : BillingPlans.PeriodEnd(cycle, renewal && paidUntil > now ? paidUntil.Value : now),
            nextInvoiceAt = target.Id == BillingPlans.Free ? (DateTime?)null
                : BillingPlans.PeriodEnd(cycle, renewal && paidUntil > now ? paidUntil.Value : now),
            blockers = BillingPlans.Violations(target, usage.Users, usage.StorageBytes, usage.AutomationRules),
        };
    }

    /// <summary>Free applies at once; a paid plan creates a YooKassa payment and returns its checkout URL.</summary>
    public async Task<object> ChangeAsync(Guid userId, string plan, string cycle, CancellationToken ct)
    {
        var (_, complimentary, current, _, email) = await ResolveAsync(userId, ct);
        if (complimentary) throw new InvalidOperationException("Your Enterprise plan is provided free of charge");
        var target = ValidateTarget(plan, cycle);
        var usage = await UsageAsync(userId, ct);
        var blockers = BillingPlans.Violations(target, usage.Users, usage.StorageBytes, usage.AutomationRules);
        if (blockers.Count > 0) throw new InvalidOperationException(string.Join("; ", blockers));

        var amount = BillingPlans.InvoiceAmount(target, cycle, usage.Users);
        if (amount <= 0)
        {
            if (current == target.Id) return await GetAsync(userId, ct);
            await ApplyPlanAsync(userId, current, target.Id, cycle, usage.Users, 0, null, null, null, ct);
            return await GetAsync(userId, ct);
        }
        if (!_yookassa.IsEnabled) throw new InvalidOperationException("Онлайн-оплата пока не подключена. Попробуйте позже.");

        var payment = new BillingPayment
        {
            Id = Guid.NewGuid(), UserId = userId, Plan = target.Id, Cycle = cycle, Users = usage.Users, Amount = amount,
            Status = "pending", Kind = "purchase", CreatedAt = DateTime.UtcNow,
        };
        _db.BillingPayments.Add(payment);
        await _db.SaveChangesAsync(ct);
        try
        {
            var created = await _yookassa.CreatePaymentAsync(new YooKassaPaymentRequest(
                amount, Description(target, cycle, usage.Users), payment.Id.ToString(),
                new Dictionary<string, string> { ["paymentId"] = payment.Id.ToString(), ["userId"] = userId.ToString() },
                $"{AppUrl()}/admin/billing/payment?id={payment.Id}", null, _yookassa.RecurringEnabled, email), ct);
            payment.ProviderPaymentId = created.Id;
            payment.ConfirmationUrl = created.ConfirmationUrl;
            await _db.SaveChangesAsync(ct);
            if (created.Status is "succeeded" or "canceled") await SettleAsync(payment.Id, created, ct);
            return new { paymentId = payment.Id, confirmationUrl = created.ConfirmationUrl, status = created.Status };
        }
        catch (InvalidOperationException ex)
        {
            payment.Status = "canceled";
            payment.Error = ex.Message.Length > 500 ? ex.Message[..500] : ex.Message;
            await _db.SaveChangesAsync(CancellationToken.None);
            throw;
        }
    }

    /// <summary>Status of the user's payment; asks YooKassa while it is still pending.</summary>
    public async Task<object> GetPaymentAsync(Guid userId, Guid paymentId, CancellationToken ct)
    {
        var payment = await _db.BillingPayments.AsNoTracking().FirstOrDefaultAsync(p => p.Id == paymentId && p.UserId == userId, ct)
            ?? throw new KeyNotFoundException("Платёж не найден.");
        if (payment.Status == "pending" && payment.ProviderPaymentId != null && _yookassa.IsEnabled)
        {
            await SettleAsync(payment.Id, await _yookassa.GetPaymentAsync(payment.ProviderPaymentId, ct), ct);
            payment = await _db.BillingPayments.AsNoTracking().FirstAsync(p => p.Id == paymentId, ct);
        }
        return new
        {
            id = payment.Id, status = payment.Status, plan = payment.Plan, planName = BillingPlans.Find(payment.Plan).Name, cycle = payment.Cycle,
            amount = payment.Amount, error = payment.Error, confirmationUrl = payment.Status == "pending" ? payment.ConfirmationUrl : null,
        };
    }

    /// <summary>YooKassa notification. The body is not trusted: the payment is re-read from the API.</summary>
    public async Task HandleNotificationAsync(string? providerPaymentId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(providerPaymentId) || !_yookassa.IsEnabled) return;
        var local = await _db.BillingPayments.AsNoTracking().Where(p => p.ProviderPaymentId == providerPaymentId).Select(p => (Guid?)p.Id).FirstOrDefaultAsync(ct);
        if (local == null) return;
        await SettleAsync(local.Value, await _yookassa.GetPaymentAsync(providerPaymentId, ct), ct);
    }

    public async Task<object> SetAutoRenewAsync(Guid userId, bool enabled, CancellationToken ct)
    {
        var subscription = await _db.BillingSubscriptions.FirstOrDefaultAsync(s => s.UserId == userId, ct)
            ?? throw new InvalidOperationException("У вас нет платной подписки.");
        subscription.AutoRenew = enabled;
        if (!enabled) { subscription.PaymentMethodId = null; subscription.PaymentMethodTitle = null; }
        subscription.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return await GetAsync(userId, ct);
    }

    /// <summary>Applies a finished payment exactly once; webhook and return page may race.</summary>
    private async Task SettleAsync(Guid paymentId, YooKassaPayment remote, CancellationToken ct)
    {
        if (remote.Status is not ("succeeded" or "canceled")) return;
        var payment = await _db.BillingPayments.AsNoTracking().FirstAsync(p => p.Id == paymentId, ct);
        if (payment.Status != "pending" || payment.ProviderPaymentId != remote.Id) return;
        var now = DateTime.UtcNow;
        if (remote.Status == "succeeded" && (!remote.Paid || remote.Amount != payment.Amount))
        {
            _logger.LogWarning("YooKassa payment {Payment} amount mismatch", paymentId);
            return;
        }
        var status = remote.Status;
        var error = status == "canceled" ? CancellationText(remote.CancellationReason) : null;
        var claimed = await _db.BillingPayments.Where(p => p.Id == paymentId && p.Status == "pending")
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Status, status).SetProperty(p => p.Error, error)
                .SetProperty(p => p.PaidAt, status == "succeeded" ? now : (DateTime?)null), ct);
        if (claimed == 0 || status != "succeeded") return;

        var (_, _, current, _, _) = await ResolveAsync(payment.UserId, ct);
        await ApplyPlanAsync(payment.UserId, current, payment.Plan, payment.Cycle, payment.Users, payment.Amount,
            remote.PaymentMethodSaved ? remote.PaymentMethodId : null, remote.PaymentMethodTitle, now, ct);
    }

    private async Task ApplyPlanAsync(Guid userId, string fromPlan, string plan, string cycle, int users, decimal amount,
        string? paymentMethodId, string? paymentMethodTitle, DateTime? paidAt, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var subscription = await _db.BillingSubscriptions.FirstOrDefaultAsync(s => s.UserId == userId, ct);
        if (subscription == null)
        {
            subscription = new BillingSubscription { UserId = userId, StartedAt = now };
            _db.BillingSubscriptions.Add(subscription);
        }
        var sameTerms = subscription.Plan == plan && subscription.Cycle == cycle;
        if (plan == BillingPlans.Free)
        {
            subscription.PaidUntil = null;
            subscription.PaymentMethodId = null;
            subscription.PaymentMethodTitle = null;
        }
        else if (paidAt.HasValue)
        {
            var from = sameTerms && subscription.PaidUntil > now ? subscription.PaidUntil.Value : now;
            subscription.PaidUntil = BillingPlans.PeriodEnd(cycle, from);
            if (paymentMethodId != null)
            {
                subscription.PaymentMethodId = paymentMethodId;
                subscription.PaymentMethodTitle = paymentMethodTitle;
            }
        }
        if (!sameTerms) subscription.StartedAt = now;
        subscription.Plan = plan;
        subscription.Cycle = cycle;
        subscription.UpdatedAt = now;
        _db.BillingPlanChanges.Add(new BillingPlanChange
        {
            Id = Guid.NewGuid(), UserId = userId, FromPlan = fromPlan, ToPlan = plan, Cycle = cycle, Users = users, Amount = amount, CreatedAt = now,
        });
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>Hourly: gives legacy subscriptions a deadline, charges saved cards and downgrades unpaid ones.</summary>
    public async Task ProcessRenewalsAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var complimentary = _config["Billing:EnterpriseEmails"];
        var paid = await _db.BillingSubscriptions.Where(s => s.Plan != BillingPlans.Free && s.Plan != BillingPlans.Enterprise)
            .Join(_db.Users, s => s.UserId, u => u.Id, (s, u) => new { Subscription = s, u.Email }).ToListAsync(ct);
        foreach (var item in paid.Where(x => !BillingPlans.IsListed(complimentary, x.Email)))
        {
            var s = item.Subscription;
            if (s.PaidUntil == null)
            {
                s.PaidUntil = now + LegacyGrace;
                s.UpdatedAt = now;
                await _db.SaveChangesAsync(ct);
                continue;
            }
            if (s.PaidUntil.Value + PlanAccessService.Grace < now)
            {
                _logger.LogInformation("Subscription of {User} expired, switching to Free", s.UserId);
                await ApplyPlanAsync(s.UserId, s.Plan, BillingPlans.Free, s.Cycle, 0, 0, null, null, null, ct);
                continue;
            }
            if (s.PaidUntil.Value > now.AddDays(1) || !s.AutoRenew || s.PaymentMethodId == null || !_yookassa.RecurringEnabled) continue;
            var recent = await _db.BillingPayments.AnyAsync(p => p.UserId == s.UserId && p.Kind == "renewal" && p.CreatedAt > now.AddHours(-12), ct);
            if (recent) continue;
            await RenewAsync(s, item.Email, ct);
        }
    }

    private async Task RenewAsync(BillingSubscription s, string email, CancellationToken ct)
    {
        var plan = BillingPlans.Find(s.Plan);
        var users = (await UsageAsync(s.UserId, ct)).Users;
        var payment = new BillingPayment
        {
            Id = Guid.NewGuid(), UserId = s.UserId, Plan = plan.Id, Cycle = s.Cycle, Users = users,
            Amount = BillingPlans.InvoiceAmount(plan, s.Cycle, users), Status = "pending", Kind = "renewal", CreatedAt = DateTime.UtcNow,
        };
        _db.BillingPayments.Add(payment);
        await _db.SaveChangesAsync(ct);
        try
        {
            var created = await _yookassa.CreatePaymentAsync(new YooKassaPaymentRequest(
                payment.Amount, "Продление: " + Description(plan, s.Cycle, users), payment.Id.ToString(),
                new Dictionary<string, string> { ["paymentId"] = payment.Id.ToString(), ["userId"] = s.UserId.ToString() },
                null, s.PaymentMethodId, false, email), ct);
            payment.ProviderPaymentId = created.Id;
            await _db.SaveChangesAsync(ct);
            await SettleAsync(payment.Id, created, ct);
        }
        catch (InvalidOperationException ex)
        {
            payment.Status = "canceled";
            payment.Error = ex.Message.Length > 500 ? ex.Message[..500] : ex.Message;
            await _db.SaveChangesAsync(CancellationToken.None);
        }
    }

    private string AppUrl() => (_config["Billing:AppUrl"] ?? _config["App:PublicUrl"] ?? "https://kanban.baxic.ru").TrimEnd('/');

    private static string Description(BillingPlan plan, string cycle, int users) =>
        $"Канбан {plan.Name}, {(cycle == "annual" ? "год" : "месяц")}, пользователей: {users}";

    private static string CancellationText(string? reason) => reason switch
    {
        "expired_on_confirmation" => "Время на оплату истекло.",
        "insufficient_funds" => "Недостаточно средств.",
        "card_expired" => "Срок действия карты истёк.",
        "canceled_by_merchant" => "Платёж отменён.",
        "3d_secure_failed" => "Не пройдена проверка 3-D Secure.",
        "permission_revoked" => "Автоплатёж отключён в банке.",
        null => "Платёж отменён.",
        _ => "Банк отклонил платёж.",
    };

    private static BillingPlan ValidateTarget(string plan, string cycle)
    {
        var target = BillingPlans.All.FirstOrDefault(p => p.Id == plan) ?? throw new ArgumentException("Unknown plan");
        if (!BillingPlans.Cycles.Contains(cycle)) throw new ArgumentException("Unknown billing cycle");
        if (!target.SelfServe) throw new ArgumentException("Contact sales to switch to Enterprise");
        return target;
    }
}
