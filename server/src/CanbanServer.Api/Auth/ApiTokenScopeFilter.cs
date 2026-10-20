using CanbanServer.Api.Auditing;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace CanbanServer.Api.Auth;

/// <summary>Rejects calls a scoped API token was not granted; configuration changes are the actions recorded in the audit log.</summary>
public sealed class ApiTokenScopeFilter : IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var granted = ApiTokenAuthenticationHandler.Scopes(context.HttpContext.User);
        if (granted is null) return;
        var request = context.HttpContext.Request;
        var configuration = context.ActionDescriptor.EndpointMetadata.OfType<AuditAttribute>().Any();
        var required = ApiTokenService.RequiredScopes(request.Method, request.Path.Value ?? "", configuration);
        if (ApiTokenService.Allows(granted, required)) return;
        context.Result = new ObjectResult(new { error = $"API-токену не хватает области доступа: {string.Join(" или ", required)}" }) { StatusCode = StatusCodes.Status403Forbidden };
    }
}
