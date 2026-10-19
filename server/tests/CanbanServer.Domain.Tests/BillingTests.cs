using CanbanServer.Infrastructure.Services;
using Xunit;

namespace CanbanServer.Domain.Tests;

public class BillingTests
{
    [Fact]
    public void ComplimentaryEmailsMatchCaseInsensitively()
    {
        Assert.True(BillingPlans.IsListed("a@x.ru, Maxim7012@gmail.com", "maxim7012@GMAIL.com"));
        Assert.False(BillingPlans.IsListed("maxim7012@gmail.com", "maxim7012@gmail.co"));
        Assert.False(BillingPlans.IsListed(null, "maxim7012@gmail.com"));
        Assert.False(BillingPlans.IsListed("maxim7012@gmail.com", ""));
    }

    [Fact]
    public void InvoiceUsesUsersAndAnnualDiscount()
    {
        var standard = BillingPlans.Find(BillingPlans.Standard);
        Assert.Equal(690 * 3, BillingPlans.InvoiceAmount(standard, "monthly", 3));
        Assert.Equal(690 * 3 * 10, BillingPlans.InvoiceAmount(standard, "annual", 3));
        Assert.Equal(0, BillingPlans.InvoiceAmount(BillingPlans.Find(BillingPlans.Free), "monthly", 7));
        Assert.Equal(BillingPlans.Free, BillingPlans.Find("unknown").Id);
    }

    [Fact]
    public void DowngradeIsBlockedWhenUsageExceedsLimits()
    {
        var free = BillingPlans.Find(BillingPlans.Free);
        Assert.Empty(BillingPlans.Violations(free, 10, 0, 10));
        Assert.Equal(2, BillingPlans.Violations(free, 11, 3L * 1024 * 1024 * 1024, 0).Count);
        Assert.Empty(BillingPlans.Violations(BillingPlans.Find(BillingPlans.Premium), 500, long.MaxValue / 2, 10_000));
    }

    [Fact]
    public void NextInvoiceDate()
    {
        var now = new DateTime(2026, 10, 19, 12, 0, 0, DateTimeKind.Utc);
        Assert.Equal(new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc), BillingPlans.NextInvoiceDate("monthly", now, now));
        Assert.Equal(new DateTime(2027, 3, 5, 0, 0, 0, DateTimeKind.Utc), BillingPlans.NextInvoiceDate("annual", new DateTime(2025, 3, 5, 0, 0, 0, DateTimeKind.Utc), now));
    }
}
