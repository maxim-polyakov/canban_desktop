using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class FilterSubscriptionScheduleTests
{
    private static DateTime Utc(int y, int m, int d, int h, int min = 0) => new(y, m, d, h, min, 0, DateTimeKind.Utc);

    [Fact]
    public void Daily_runs_at_the_local_hour()
    {
        var s = new FilterSubscription { Frequency = "daily", Hour = 9, TimeZone = "Europe/Moscow" };
        Assert.Equal(Utc(2026, 10, 21, 6), FilterSubscriptionService.NextRun(s, Utc(2026, 10, 20, 21)));
        Assert.Equal(Utc(2026, 10, 22, 6), FilterSubscriptionService.NextRun(s, Utc(2026, 10, 21, 6)));
    }

    [Fact]
    public void Weekly_skips_days_that_are_not_selected()
    {
        // 2026-10-21 is a Wednesday; only Mondays and Fridays are chosen.
        var s = new FilterSubscription { Frequency = "weekly", Hour = 8, DaysOfWeek = "1,5", TimeZone = "UTC" };
        Assert.Equal(Utc(2026, 10, 23, 8), FilterSubscriptionService.NextRun(s, Utc(2026, 10, 21, 12)));
        Assert.Equal(Utc(2026, 10, 26, 8), FilterSubscriptionService.NextRun(s, Utc(2026, 10, 23, 8)));
    }

    [Fact]
    public void Monthly_uses_the_last_day_in_short_months()
    {
        var s = new FilterSubscription { Frequency = "monthly", Hour = 10, DayOfMonth = 31, TimeZone = "UTC" };
        Assert.Equal(Utc(2026, 11, 30, 10), FilterSubscriptionService.NextRun(s, Utc(2026, 11, 1, 0)));
    }

    [Fact]
    public void Hourly_follows_the_interval()
    {
        var s = new FilterSubscription { Frequency = "hourly", IntervalHours = 3, TimeZone = "UTC" };
        Assert.Equal(Utc(2026, 10, 20, 12), FilterSubscriptionService.NextRun(s, Utc(2026, 10, 20, 10, 15)));
    }

    [Fact]
    public void Unknown_time_zone_falls_back_to_utc()
    {
        var s = new FilterSubscription { Frequency = "daily", Hour = 7, TimeZone = "Nowhere/Land" };
        Assert.Equal(Utc(2026, 10, 21, 7), FilterSubscriptionService.NextRun(s, Utc(2026, 10, 20, 8)));
    }
}
