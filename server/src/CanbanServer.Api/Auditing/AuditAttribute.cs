using CanbanServer.Infrastructure.Services;

namespace CanbanServer.Api.Auditing;

/// <summary>
/// Records a successful call of the action in the team audit log.
/// <paramref name="key"/> names the route value resolved through <paramref name="target"/>;
/// objects created by the call are picked up from the response (Id, Name/Title, TeamId/BoardId).
/// </summary>
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public sealed class AuditAttribute : Attribute
{
    public AuditAttribute(string action, AuditTarget target, string key = "id")
    {
        Action = action;
        Target = target;
        Key = key;
    }

    public string Action { get; }
    public AuditTarget Target { get; }
    public string Key { get; }
    /// <summary>Overrides the object type stored with the event (defaults to the resolved target).</summary>
    public string? ObjectType { get; init; }
    /// <summary>Route value that identifies the affected object when it differs from <see cref="Key"/>.</summary>
    public string? ObjectKey { get; init; }
}
