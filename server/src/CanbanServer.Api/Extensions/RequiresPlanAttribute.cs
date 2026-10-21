using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace CanbanServer.Api.Extensions;

/// <summary>Rejects the action with 402 unless one of the user's teams has at least this plan.</summary>
public sealed class RequiresPlanAttribute : TypeFilterAttribute
{
    public RequiresPlanAttribute(string plan) : base(typeof(RequiresPlanFilter)) => Arguments = new object[] { plan };
}

public sealed class RequiresPlanFilter : IAsyncActionFilter
{
    private readonly string _plan;
    private readonly PlanAccessService _plans;

    public RequiresPlanFilter(string plan, PlanAccessService plans)
    {
        _plan = plan;
        _plans = plans;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var userId = context.HttpContext.User.GetUserId();
        if (userId.HasValue) await _plans.EnsureUserAsync(userId.Value, _plan, context.HttpContext.RequestAborted);
        await next();
    }
}
