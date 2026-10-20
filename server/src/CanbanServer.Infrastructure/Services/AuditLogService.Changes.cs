using System.Globalization;
using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public sealed record AuditChange(string Field, string? From, string? To);

public partial class AuditLogService
{
    public const int MaxChangeValueLength = 300;
    public const int DefaultRetentionDays = 365;
    public static readonly int[] RetentionOptions = { 30, 90, 180, 365, 730, 1095, 1825, 2555, 3650 };

    private static readonly Dictionary<string, Type> SnapshotTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["team"] = typeof(Team),
        ["board"] = typeof(Board),
        ["status"] = typeof(Column),
        ["issue"] = typeof(Quest),
        ["sprint"] = typeof(Sprint),
        ["component"] = typeof(BoardComponent),
        ["release"] = typeof(BoardRelease),
        ["issuetype"] = typeof(IssueTypeDefinition),
        ["field"] = typeof(CustomFieldDefinition),
        ["assetschema"] = typeof(AssetSchema),
        ["group"] = typeof(UserGroup),
        ["layout"] = typeof(IssueLayoutObject),
        ["transition"] = typeof(WorkflowTransition),
        ["automation"] = typeof(AutomationRule),
        ["webhook"] = typeof(OutboundWebhook),
        ["github"] = typeof(GitHubIntegration),
    };

    private static readonly HashSet<string> IgnoredFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "Id", "CreatedAt", "UpdatedAt", "RowVersion", "Version", "TeamId", "BoardId",
    };

    /// <summary>Current scalar values of an audited object, or null when it does not exist (or the type is not tracked).</summary>
    public async Task<Dictionary<string, string?>?> SnapshotAsync(string? objectType, Guid? id, Guid? teamId, CancellationToken ct)
    {
        if (objectType is null || id is not { } objectId) return null;
        if (objectType == "user")
        {
            if (teamId is not { } team) return null;
            var member = await _db.TeamMembers.AsNoTracking().Where(m => m.TeamId == team && m.UserId == objectId)
                .Select(m => new { m.Role }).FirstOrDefaultAsync(ct);
            return member is null ? null : new Dictionary<string, string?> { ["Role"] = member.Role.ToString() };
        }
        if (objectType == "auditsettings")
        {
            var days = await _db.AuditSettings.AsNoTracking().Where(s => s.TeamId == objectId).Select(s => (int?)s.RetentionDays).FirstOrDefaultAsync(ct);
            return new Dictionary<string, string?> { ["RetentionDays"] = (days ?? DefaultRetentionDays).ToString(CultureInfo.InvariantCulture) };
        }
        if (!SnapshotTypes.TryGetValue(objectType, out var type)) return null;
        var entityType = _db.Model.FindEntityType(type);
        if (entityType is null) return null;
        var load = typeof(AuditLogService).GetMethod(nameof(LoadAsync), System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!
            .MakeGenericMethod(type);
        var entity = await (Task<object?>)load.Invoke(this, new object[] { objectId, ct })!;
        if (entity is null) return null;

        var snapshot = new Dictionary<string, string?>();
        foreach (var property in entityType.GetProperties())
        {
            if (property.IsPrimaryKey() || property.IsShadowProperty() || property.PropertyInfo is null) continue;
            var name = property.Name;
            if (IgnoredFields.Contains(name) || name.EndsWith("Hash", StringComparison.Ordinal)) continue;
            snapshot[name] = FormatValue(name, property.PropertyInfo.GetValue(entity));
        }
        return snapshot;
    }

    private async Task<object?> LoadAsync<T>(Guid id, CancellationToken ct) where T : class =>
        await _db.Set<T>().AsNoTracking().FirstOrDefaultAsync(e => EF.Property<Guid>(e, "Id") == id, ct);

    public static List<AuditChange> Diff(IReadOnlyDictionary<string, string?>? before, IReadOnlyDictionary<string, string?>? after)
    {
        var changes = new List<AuditChange>();
        if (before is null && after is null) return changes;
        var keys = (before?.Keys ?? Enumerable.Empty<string>()).Concat(after?.Keys ?? Enumerable.Empty<string>()).Distinct();
        foreach (var key in keys)
        {
            var from = before?.GetValueOrDefault(key);
            var to = after?.GetValueOrDefault(key);
            if (from == to) continue;
            if (IsEmpty(from) && IsEmpty(to)) continue;
            changes.Add(IsSecret(key)
                ? new AuditChange(key, IsEmpty(from) ? null : "***", IsEmpty(to) ? null : "***")
                : new AuditChange(key, Clip(from, MaxChangeValueLength), Clip(to, MaxChangeValueLength)));
        }
        return changes;
    }

    public static string? FormatValue(string name, object? value) => value switch
    {
        null => null,
        string s => s,
        DateTime d => d.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
        DateTimeOffset d => d.UtcDateTime.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
        bool b => b ? "true" : "false",
        Enum e => e.ToString(),
        IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
        System.Collections.IEnumerable => null,
        _ => value.GetType().IsClass ? null : value.ToString(),
    };

    private static bool IsEmpty(string? value) => string.IsNullOrEmpty(value) || value is "[]" or "{}";

    private static bool IsSecret(string name)
    {
        var lowered = new string(name.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
        return SecretMarkers.Any(lowered.Contains);
    }

    /// <summary>Teams where the user is the owner or a member.</summary>
    public async Task<List<Guid>> UserTeamIdsAsync(Guid userId, CancellationToken ct) =>
        await _db.Teams.AsNoTracking().Where(t => t.OwnerId == userId || t.Members.Any(m => m.UserId == userId))
            .Select(t => t.Id).ToListAsync(ct);

    public async Task RecordForUserAsync(Guid userId, string action, string? objectType, Guid? objectId, string? objectName,
        string? detailsJson, string? ipAddress, CancellationToken ct)
    {
        foreach (var teamId in await UserTeamIdsAsync(userId, ct))
            await RecordAsync(new AuditEntry(teamId, null, null, userId, action, objectType, objectId, objectName, detailsJson, ipAddress), ct);
    }

    public async Task<object> GetSettingsAsync(Guid userId, Guid teamId, CancellationToken ct)
    {
        await RequireAdminAsync(userId, teamId, ct);
        var days = await _db.AuditSettings.AsNoTracking().Where(s => s.TeamId == teamId).Select(s => (int?)s.RetentionDays).FirstOrDefaultAsync(ct);
        return new { teamId, retentionDays = days ?? DefaultRetentionDays, options = RetentionOptions };
    }

    public async Task<object> SetRetentionAsync(Guid userId, Guid teamId, int retentionDays, CancellationToken ct)
    {
        await RequireAdminAsync(userId, teamId, ct);
        if (!RetentionOptions.Contains(retentionDays)) throw new ArgumentException("Недопустимый срок хранения");
        var settings = await _db.AuditSettings.FirstOrDefaultAsync(s => s.TeamId == teamId, ct);
        if (settings is null) _db.AuditSettings.Add(new AuditSetting { TeamId = teamId, RetentionDays = retentionDays });
        else settings.RetentionDays = retentionDays;
        await _db.SaveChangesAsync(ct);
        return new { teamId, retentionDays, options = RetentionOptions };
    }

    /// <summary>Deletes events older than each team's retention period.</summary>
    public Task<int> PurgeExpiredAsync(CancellationToken ct) =>
        _db.Database.ExecuteSqlRawAsync(
            """
            DELETE FROM "AuditEvents" e
            WHERE e."CreatedAt" < now() - make_interval(days => COALESCE(
              (SELECT s."RetentionDays" FROM "AuditSettings" s WHERE s."TeamId" = e."TeamId"), {0}))
            """, new object[] { DefaultRetentionDays }, ct);

    private async Task RequireAdminAsync(Guid userId, Guid teamId, CancellationToken ct)
    {
        if ((await AdminTeamsAsync(userId, ct)).All(t => t.Id != teamId))
            throw new UnauthorizedAccessException("Журнал аудита доступен только администраторам команды.");
    }
}
