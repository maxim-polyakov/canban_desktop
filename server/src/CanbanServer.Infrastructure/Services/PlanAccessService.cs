using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CanbanServer.Infrastructure.Services;

/// <summary>Thrown when a feature or limit needs a higher plan; mapped to 402 Payment Required.</summary>
public sealed class PlanRequiredException : Exception
{
    public PlanRequiredException(string requiredPlan, string message) : base(message) => RequiredPlan = requiredPlan;
    public string RequiredPlan { get; }
}

    /// <summary>Effective plans: a team gets the plan of its owner; personal feature access uses the user's own subscription.</summary>
public class PlanAccessService
{
    /// <summary>Paid features stay on for a few days after the period ends while the renewal is retried.</summary>
    public static readonly TimeSpan Grace = TimeSpan.FromDays(3);

    private readonly CanbanDbContext _db;
    private readonly IConfiguration _config;

    public PlanAccessService(CanbanDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    public static string Effective(string? plan, DateTime? paidUntil, DateTime now)
    {
        var id = BillingPlans.Find(plan).Id;
        if (id == BillingPlans.Free || paidUntil == null) return id;
        return paidUntil.Value + Grace >= now ? id : BillingPlans.Free;
    }

    public async Task<string> PlanOfOwnerAsync(Guid? ownerId, CancellationToken ct)
    {
        if (ownerId == null) return BillingPlans.Free;
        var owner = await _db.Users.AsNoTracking().Where(u => u.Id == ownerId).Select(u => new { u.Email }).FirstOrDefaultAsync(ct);
        if (owner == null) return BillingPlans.Free;
        if (BillingPlans.IsListed(_config["Billing:EnterpriseEmails"], owner.Email)) return BillingPlans.Enterprise;
        var sub = await _db.BillingSubscriptions.AsNoTracking().Where(s => s.UserId == ownerId).Select(s => new { s.Plan, s.PaidUntil }).FirstOrDefaultAsync(ct);
        return sub == null ? BillingPlans.Free : Effective(sub.Plan, sub.PaidUntil, DateTime.UtcNow);
    }

    public async Task<string> PlanForTeamAsync(Guid teamId, CancellationToken ct)
    {
        var ownerId = await _db.Teams.AsNoTracking().Where(t => t.Id == teamId).Select(t => t.OwnerId).FirstOrDefaultAsync(ct);
        return await PlanOfOwnerAsync(ownerId, ct);
    }

    public async Task<string> PlanForUserAsync(Guid userId, CancellationToken ct)
        => await PlanOfOwnerAsync(userId, ct);

    public async Task EnsureUserAsync(Guid userId, string minPlan, CancellationToken ct)
    {
        if (BillingPlans.Rank(await PlanForUserAsync(userId, ct)) >= BillingPlans.Rank(minPlan)) return;
        throw new PlanRequiredException(minPlan, $"Эта возможность доступна в плане {BillingPlans.Find(minPlan).Name}.");
    }

    public async Task EnsureTeamAsync(Guid teamId, string minPlan, CancellationToken ct)
    {
        if (BillingPlans.Rank(await PlanForTeamAsync(teamId, ct)) >= BillingPlans.Rank(minPlan)) return;
        throw new PlanRequiredException(minPlan, $"Эта возможность доступна в плане {BillingPlans.Find(minPlan).Name}.");
    }

    /// <summary>People across all teams of the owner, the same count the invoice uses.</summary>
    public async Task<HashSet<Guid>> SeatsAsync(Guid ownerId, CancellationToken ct)
    {
        var teamIds = _db.Teams.Where(t => t.OwnerId == ownerId).Select(t => t.Id);
        var members = await _db.TeamMembers.AsNoTracking().Where(m => teamIds.Contains(m.TeamId)).Select(m => m.UserId).Distinct().ToListAsync(ct);
        return members.Append(ownerId).ToHashSet();
    }

    /// <summary>Blocks adding a person beyond the owner's plan limit, like Jira Free's 10 users.</summary>
    public async Task EnsureSeatAsync(Guid teamId, Guid newUserId, CancellationToken ct)
    {
        var ownerId = await _db.Teams.AsNoTracking().Where(t => t.Id == teamId).Select(t => t.OwnerId).FirstOrDefaultAsync(ct);
        if (ownerId == null) return;
        var plan = BillingPlans.Find(await PlanOfOwnerAsync(ownerId, ct));
        if (plan.MaxUsers is not int max) return;
        var seats = await SeatsAsync(ownerId.Value, ct);
        if (seats.Contains(newUserId) || seats.Count < max) return;
        var next = BillingPlans.All.First(p => p.MaxUsers == null || p.MaxUsers > max);
        throw new PlanRequiredException(next.Id, $"В плане {plan.Name} до {max} пользователей. Чтобы добавить больше, перейдите на {next.Name}.");
    }
}
