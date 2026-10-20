using System.Reflection;
using CanbanServer.Api.Extensions;
using CanbanServer.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace CanbanServer.Api.Auditing;

public sealed class AuditActionFilter : IAsyncActionFilter
{
    private readonly ILogger<AuditActionFilter> _logger;

    public AuditActionFilter(ILogger<AuditActionFilter> logger) => _logger = logger;

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var attribute = context.ActionDescriptor.EndpointMetadata.OfType<AuditAttribute>().FirstOrDefault();
        if (attribute is null)
        {
            await next();
            return;
        }

        var audit = context.HttpContext.RequestServices.GetRequiredService<AuditLogService>();
        var ct = context.HttpContext.RequestAborted;
        AuditScope? scope = null;
        try { scope = await ResolveBeforeAsync(attribute, context, audit, ct); }
        catch (Exception ex) { _logger.LogWarning(ex, "Audit scope resolution failed for {Action}", attribute.Action); }
        var arguments = context.ActionArguments
            .Where(a => a.Value is not CancellationToken and not Guid and not IFormFile and not IFormFileCollection and not Stream)
            .ToDictionary(a => a.Key, a => a.Value);

        var executed = await next();
        if (executed.Exception is not null && !executed.ExceptionHandled) return;
        if (executed.Result is IStatusCodeActionResult { StatusCode: >= 400 }) return;

        try
        {
            var value = (executed.Result as ObjectResult)?.Value;
            scope ??= await ResolveFromValueAsync(value, attribute, audit, ct);
            if (scope is null) return;

            var objectId = scope.ObjectId ?? ReadGuid(value, "Id");
            var objectName = scope.ObjectName
                ?? arguments.Values.Select(NameOf).FirstOrDefault(n => n is not null)
                ?? NameOf(value);
            if (scope.ObjectType == "user" && objectId is { } userId && objectName is null)
                objectName = await audit.UserNameAsync(userId, ct);

            await audit.RecordAsync(new AuditEntry(
                scope.TeamId, scope.BoardId, scope.BoardName, context.HttpContext.User.GetUserId(), attribute.Action,
                scope.ObjectType, objectId, objectName, AuditLogService.SerializeDetails(arguments),
                context.HttpContext.Connection.RemoteIpAddress?.ToString()), CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Audit record failed for {Action}", attribute.Action);
        }
    }

    private static async Task<AuditScope?> ResolveBeforeAsync(AuditAttribute attribute, ActionExecutingContext context, AuditLogService audit, CancellationToken ct)
    {
        AuditScope? scope;
        if (attribute.Target == AuditTarget.Body)
        {
            var body = context.ActionArguments.Values.FirstOrDefault(v => ReadGuid(v, "TeamId") is not null || ReadGuid(v, "BoardId") is not null);
            if (body is null) return null;
            scope = ReadGuid(body, "BoardId") is { } boardId
                ? await audit.ResolveAsync(AuditTarget.Board, boardId, ct)
                : await audit.ResolveAsync(AuditTarget.Team, ReadGuid(body, "TeamId")!.Value, ct);
            return scope is null ? null : scope with { ObjectType = attribute.ObjectType, ObjectId = null, ObjectName = null };
        }

        if (RouteGuid(context, attribute.Key) is not { } id) return null;
        scope = await audit.ResolveAsync(attribute.Target, id, ct);
        if (scope is null || attribute.ObjectType is null) return scope;
        return scope with
        {
            ObjectType = attribute.ObjectType,
            ObjectId = attribute.ObjectKey is null ? null : RouteGuid(context, attribute.ObjectKey),
            ObjectName = null,
        };
    }

    private static async Task<AuditScope?> ResolveFromValueAsync(object? value, AuditAttribute attribute, AuditLogService audit, CancellationToken ct)
    {
        AuditScope? scope = null;
        if (ReadGuid(value, "BoardId") is { } boardId) scope = await audit.ResolveAsync(AuditTarget.Board, boardId, ct);
        else if (ReadGuid(value, "TeamId") is { } teamId) scope = await audit.ResolveAsync(AuditTarget.Team, teamId, ct);
        else if (attribute.Target != AuditTarget.Body && ReadGuid(value, "Id") is { } id)
        {
            scope = await audit.ResolveAsync(attribute.Target, id, ct);
            if (attribute.ObjectType is null) return scope;
        }
        return scope is null ? null : scope with { ObjectType = attribute.ObjectType ?? attribute.Target.ToString().ToLowerInvariant(), ObjectId = null, ObjectName = null };
    }

    private static Guid? RouteGuid(ActionExecutingContext context, string key) =>
        (context.RouteData.Values.TryGetValue(key, out var raw) ? raw?.ToString() : context.HttpContext.Request.Query[key].FirstOrDefault()) is { } text
            && Guid.TryParse(text, out var id) ? id : null;

    private static Guid? ReadGuid(object? source, string property) => Read(source, property) switch
    {
        Guid g when g != Guid.Empty => g,
        _ => null,
    };

    private static string? NameOf(object? source)
    {
        foreach (var property in new[] { "Name", "Title", "DisplayName", "Email" })
            if (Read(source, property) is string s && !string.IsNullOrWhiteSpace(s)) return s.Trim();
        return null;
    }

    private static object? Read(object? source, string property)
    {
        if (source is null || source is string || source.GetType().IsPrimitive) return null;
        return source.GetType().GetProperty(property, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase)?.GetValue(source);
    }
}
