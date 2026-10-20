using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

public record FilterSubscriptionRequest(
    Guid? GroupId, string Frequency, int Hour, int Minute, List<int>? DaysOfWeek, int DayOfMonth, int IntervalHours,
    string? TimeZone, bool EmailWhenEmpty);

public record FilterSubscriptionDto(
    Guid Id, Guid FilterId, string FilterName, Guid OwnerUserId, string OwnerName, Guid? GroupId, string? GroupName,
    string Frequency, int Hour, int Minute, List<int> DaysOfWeek, int DayOfMonth, int IntervalHours, string TimeZone,
    bool EmailWhenEmpty, DateTime? LastRunAt, DateTime NextRunAt, bool CanEdit);

public record SubscribableGroupDto(Guid Id, string Name, string TeamName);

/// <summary>Jira-style filter subscriptions: scheduled emails with a saved filter's results, run as each recipient.</summary>
public class FilterSubscriptionService
{
    public const int MaxIssuesPerEmail = 50;
    private static readonly string[] Frequencies = { "daily", "weekly", "monthly", "hourly" };
    private static readonly int[] Intervals = { 1, 2, 3, 4, 6, 8, 12 };

    private readonly CanbanDbContext _db;
    private readonly IJqlQueryService _jql;
    private readonly IEmailSender _email;
    private readonly ILogger<FilterSubscriptionService> _logger;
    private readonly string _siteUrl;
    private readonly string _logoUrl;

    public FilterSubscriptionService(CanbanDbContext db, IJqlQueryService jql, IEmailSender email, IConfiguration config,
        ILogger<FilterSubscriptionService> logger)
    {
        _db = db;
        _jql = jql;
        _email = email;
        _logger = logger;
        _siteUrl = EmailLayout.SiteUrl(config);
        _logoUrl = EmailLayout.LogoUrl(config);
    }

    public static TimeZoneInfo ResolveTimeZone(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return TimeZoneInfo.Utc;
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException) { return TimeZoneInfo.Utc; }
    }

    public static List<int> ParseDays(string? days) =>
        (days ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => int.TryParse(x, out var d) ? d : 0).Where(d => d is >= 1 and <= 7).Distinct().OrderBy(d => d).ToList();

    private static int IsoDay(DayOfWeek day) => day == DayOfWeek.Sunday ? 7 : (int)day;

    /// <summary>The first scheduled moment strictly after <paramref name="afterUtc"/>, in UTC.</summary>
    public static DateTime NextRun(FilterSubscription s, DateTime afterUtc)
    {
        afterUtc = DateTime.SpecifyKind(afterUtc, DateTimeKind.Utc);
        var zone = ResolveTimeZone(s.TimeZone);
        var local = TimeZoneInfo.ConvertTimeFromUtc(afterUtc, zone);
        if (s.Frequency == "hourly")
        {
            var interval = Math.Max(1, s.IntervalHours);
            var hour = new DateTime(local.Year, local.Month, local.Day, local.Hour, 0, 0);
            for (var i = 0; i < 24 * 3; i++)
            {
                var candidate = hour.AddHours(i).AddMinutes(s.Minute);
                if (candidate.Hour % interval != 0 || zone.IsInvalidTime(candidate)) continue;
                var utc = TimeZoneInfo.ConvertTimeToUtc(candidate, zone);
                if (utc > afterUtc) return utc;
            }
            return afterUtc.AddHours(interval);
        }
        var days = ParseDays(s.DaysOfWeek);
        for (var i = 0; i < 400; i++)
        {
            var date = local.Date.AddDays(i);
            var matches = s.Frequency switch
            {
                "weekly" => days.Count == 0 || days.Contains(IsoDay(date.DayOfWeek)),
                "monthly" => date.Day == Math.Min(s.DayOfMonth, DateTime.DaysInMonth(date.Year, date.Month)),
                _ => true,
            };
            if (!matches) continue;
            var candidate = date.AddHours(s.Hour).AddMinutes(s.Minute);
            if (zone.IsInvalidTime(candidate)) candidate = candidate.AddHours(1);
            var utc = TimeZoneInfo.ConvertTimeToUtc(candidate, zone);
            if (utc > afterUtc) return utc;
        }
        return afterUtc.AddDays(1);
    }

    private async Task<SavedFilter> VisibleFilterAsync(Guid filterId, Guid userId, CancellationToken ct) =>
        await _db.SavedFilters.AsNoTracking().FirstOrDefaultAsync(f => f.Id == filterId && (f.OwnerUserId == userId || f.Shared), ct)
        ?? throw new KeyNotFoundException("Фильтр не найден");

    /// <summary>Groups of teams the user owns or administers; only those can be subscribed as a whole.</summary>
    public async Task<List<SubscribableGroupDto>> GroupsAsync(Guid userId, CancellationToken ct) =>
        await _db.UserGroups.AsNoTracking()
            .Where(g => _db.Teams.Any(t => t.Id == g.TeamId && (t.OwnerId == userId || t.Members.Any(m => m.UserId == userId && m.Role == TeamRole.Admin))))
            .OrderBy(g => g.Name)
            .Join(_db.Teams, g => g.TeamId, t => t.Id, (g, t) => new SubscribableGroupDto(g.Id, g.Name, t.Name))
            .ToListAsync(ct);

    public async Task<List<FilterSubscriptionDto>> ListAsync(Guid userId, Guid? filterId, CancellationToken ct)
    {
        var query = _db.FilterSubscriptions.AsNoTracking()
            .Where(s => s.OwnerUserId == userId || _db.SavedFilters.Any(f => f.Id == s.FilterId && f.OwnerUserId == userId));
        if (filterId.HasValue) query = query.Where(s => s.FilterId == filterId);
        var items = await query.OrderBy(s => s.CreatedAt).ToListAsync(ct);
        return await MapAsync(items, userId, ct);
    }

    private async Task<List<FilterSubscriptionDto>> MapAsync(List<FilterSubscription> items, Guid userId, CancellationToken ct)
    {
        var filterIds = items.Select(s => s.FilterId).Distinct().ToList();
        var filters = await _db.SavedFilters.AsNoTracking().Where(f => filterIds.Contains(f.Id)).ToDictionaryAsync(f => f.Id, ct);
        var ownerIds = items.Select(s => s.OwnerUserId).Distinct().ToList();
        var owners = await _db.Users.AsNoTracking().Where(u => ownerIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);
        var groupIds = items.Where(s => s.GroupId.HasValue).Select(s => s.GroupId!.Value).Distinct().ToList();
        var groups = await _db.UserGroups.AsNoTracking().Where(g => groupIds.Contains(g.Id)).ToDictionaryAsync(g => g.Id, g => g.Name, ct);
        return items.Select(s => new FilterSubscriptionDto(
            s.Id, s.FilterId, filters.TryGetValue(s.FilterId, out var f) ? f.Name : "", s.OwnerUserId, owners.GetValueOrDefault(s.OwnerUserId, ""),
            s.GroupId, s.GroupId.HasValue ? groups.GetValueOrDefault(s.GroupId.Value) : null,
            s.Frequency, s.Hour, s.Minute, ParseDays(s.DaysOfWeek), s.DayOfMonth, s.IntervalHours, s.TimeZone, s.EmailWhenEmpty,
            s.LastRunAt, s.NextRunAt, s.OwnerUserId == userId || (f != null && f.OwnerUserId == userId))).ToList();
    }

    private async Task ApplyAsync(FilterSubscription s, FilterSubscriptionRequest r, Guid userId, CancellationToken ct)
    {
        var frequency = (r.Frequency ?? "").Trim().ToLowerInvariant();
        if (!Frequencies.Contains(frequency)) throw new ArgumentException("Неизвестная периодичность.");
        if (r.Hour is < 0 or > 23 || r.Minute is < 0 or > 59) throw new ArgumentException("Укажите время от 00:00 до 23:59.");
        var days = (r.DaysOfWeek ?? new()).Where(d => d is >= 1 and <= 7).Distinct().OrderBy(d => d).ToList();
        if (frequency == "weekly" && days.Count == 0) throw new ArgumentException("Выберите хотя бы один день недели.");
        if (frequency == "monthly" && r.DayOfMonth is < 1 or > 31) throw new ArgumentException("День месяца должен быть от 1 до 31.");
        if (frequency == "hourly" && !Intervals.Contains(r.IntervalHours)) throw new ArgumentException("Недопустимый интервал.");
        if (r.GroupId.HasValue && !(await GroupsAsync(userId, ct)).Any(g => g.Id == r.GroupId))
            throw new UnauthorizedAccessException("Подписать группу может только владелец или администратор её команды.");
        var zone = ResolveTimeZone(r.TimeZone);
        s.GroupId = r.GroupId;
        s.Frequency = frequency;
        s.Hour = r.Hour;
        s.Minute = r.Minute;
        s.DaysOfWeek = frequency == "weekly" ? string.Join(',', days) : "";
        s.DayOfMonth = frequency == "monthly" ? r.DayOfMonth : 1;
        s.IntervalHours = frequency == "hourly" ? r.IntervalHours : 1;
        s.TimeZone = zone == TimeZoneInfo.Utc ? "UTC" : zone.Id;
        s.EmailWhenEmpty = r.EmailWhenEmpty;
        s.NextRunAt = NextRun(s, DateTime.UtcNow);
    }

    public async Task<FilterSubscriptionDto> CreateAsync(Guid userId, Guid filterId, FilterSubscriptionRequest request, CancellationToken ct)
    {
        await VisibleFilterAsync(filterId, userId, ct);
        if (await _db.FilterSubscriptions.CountAsync(s => s.OwnerUserId == userId, ct) >= 100)
            throw new InvalidOperationException("Можно создать не больше 100 подписок.");
        var entity = new FilterSubscription { Id = Guid.NewGuid(), FilterId = filterId, OwnerUserId = userId, CreatedAt = DateTime.UtcNow };
        await ApplyAsync(entity, request, userId, ct);
        _db.FilterSubscriptions.Add(entity);
        await _db.SaveChangesAsync(ct);
        return (await MapAsync(new() { entity }, userId, ct))[0];
    }

    private async Task<FilterSubscription> EditableAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var entity = await _db.FilterSubscriptions.FirstOrDefaultAsync(s => s.Id == id, ct) ?? throw new KeyNotFoundException("Подписка не найдена");
        var filterOwner = await _db.SavedFilters.Where(f => f.Id == entity.FilterId).Select(f => f.OwnerUserId).FirstOrDefaultAsync(ct);
        if (entity.OwnerUserId != userId && filterOwner != userId) throw new KeyNotFoundException("Подписка не найдена");
        return entity;
    }

    public async Task<FilterSubscriptionDto> UpdateAsync(Guid userId, Guid id, FilterSubscriptionRequest request, CancellationToken ct)
    {
        var entity = await EditableAsync(id, userId, ct);
        if (entity.OwnerUserId != userId) throw new UnauthorizedAccessException("Изменить подписку может только её автор.");
        await ApplyAsync(entity, request, userId, ct);
        await _db.SaveChangesAsync(ct);
        return (await MapAsync(new() { entity }, userId, ct))[0];
    }

    public async Task DeleteAsync(Guid userId, Guid id, CancellationToken ct)
    {
        _db.FilterSubscriptions.Remove(await EditableAsync(id, userId, ct));
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>Sends the subscription now without moving its schedule; returns how many emails went out.</summary>
    public async Task<int> RunNowAsync(Guid userId, Guid id, CancellationToken ct)
    {
        var entity = await EditableAsync(id, userId, ct);
        var sent = await SendAsync(entity, ct);
        entity.LastRunAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return sent;
    }

    public async Task<int> RunDueAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var due = await _db.FilterSubscriptions.Where(s => s.NextRunAt <= now).OrderBy(s => s.NextRunAt).Take(50).ToListAsync(ct);
        foreach (var s in due)
        {
            try { await SendAsync(s, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Filter subscription {SubscriptionId} failed", s.Id);
            }
            s.LastRunAt = now;
            s.NextRunAt = NextRun(s, now);
        }
        if (due.Count > 0) await _db.SaveChangesAsync(ct);
        return due.Count;
    }

    private async Task<int> SendAsync(FilterSubscription s, CancellationToken ct)
    {
        var filter = await _db.SavedFilters.AsNoTracking().FirstOrDefaultAsync(f => f.Id == s.FilterId, ct);
        if (filter == null) return 0;
        var recipientIds = s.GroupId.HasValue
            ? await _db.Set<UserGroupMember>().AsNoTracking().Where(m => m.GroupId == s.GroupId).Select(m => m.UserId).ToListAsync(ct)
            : new List<Guid> { s.OwnerUserId };
        var recipients = await _db.Users.AsNoTracking().Where(u => recipientIds.Contains(u.Id) && u.Email != "").ToListAsync(ct);
        var sent = 0;
        foreach (var user in recipients)
        {
            var result = await _jql.SearchAsync(filter.Jql, user.Id, 1, MaxIssuesPerEmail, filter.BoardId, ct);
            if (result.Total == 0 && !s.EmailWhenEmpty) continue;
            var details = (result.Details ?? new()).ToDictionary(d => d.Id);
            var rows = string.Concat(result.Items.Select(q =>
            {
                details.TryGetValue(q.Id, out var d);
                var url = $"{_siteUrl}/board/{q.BoardId}/issue/{q.Id}";
                return $"""
                    <tr>
                      <td style="padding:6px 12px 6px 0;border-bottom:1px solid #ebecf0;white-space:nowrap"><a href="{EmailLayout.Encode(url)}" style="color:#0c66e4;text-decoration:none">{EmailLayout.Encode(q.IssueKey)}</a></td>
                      <td style="padding:6px 12px 6px 0;border-bottom:1px solid #ebecf0">{EmailLayout.Encode(q.Title)}</td>
                      <td style="padding:6px 12px 6px 0;border-bottom:1px solid #ebecf0;white-space:nowrap">{EmailLayout.Encode(d?.StatusName ?? "")}</td>
                      <td style="padding:6px 0;border-bottom:1px solid #ebecf0;white-space:nowrap">{EmailLayout.Encode(q.AssigneeName ?? "Не назначен")}</td>
                    </tr>
                    """;
            }));
            var summary = result.Total == 0 ? "Задач не найдено."
                : result.Total > result.Items.Count ? $"Найдено задач: {result.Total}. Показаны первые {result.Items.Count}."
                : $"Найдено задач: {result.Total}.";
            var table = result.Total == 0 ? "" : $"""
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse">
                  <tr style="color:#6b778c;text-align:left"><th style="padding:0 12px 6px 0">Ключ</th><th style="padding:0 12px 6px 0">Тема</th><th style="padding:0 12px 6px 0">Статус</th><th style="padding:0 0 6px">Исполнитель</th></tr>
                  {rows}
                </table>
                """;
            var content = $"""
                <p style="margin:0 0 12px">Здравствуйте, <strong>{EmailLayout.Encode(user.DisplayName)}</strong>.</p>
                <p style="margin:0 0 16px">Результаты фильтра «{EmailLayout.Encode(filter.Name)}». {EmailLayout.Encode(summary)}</p>
                {table}
                """;
            var body = EmailLayout.Render(_siteUrl, _logoUrl, $"Фильтр «{filter.Name}»", content, "Открыть фильтр", $"{_siteUrl}/issues?filter={filter.Id}",
                "Вы получили это письмо, потому что подписаны на фильтр. Изменить или удалить подписку можно на странице «Фильтры».");
            if (await _email.SendAsync(user.Email, user.DisplayName, $"Подписка на фильтр: {filter.Name}", body, ct, plainTextOnly: user.EmailFormat == "text"))
                sent++;
        }
        return sent;
    }
}
