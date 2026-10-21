using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class BillingSubscriptionConfiguration : IEntityTypeConfiguration<BillingSubscription>
{
    public void Configure(EntityTypeBuilder<BillingSubscription> b)
    {
        b.HasKey(x => x.UserId);
        b.Property(x => x.Plan).HasMaxLength(16);
        b.Property(x => x.Cycle).HasMaxLength(16);
        b.HasOne<User>().WithOne().HasForeignKey<BillingSubscription>(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class BillingPlanChangeConfiguration : IEntityTypeConfiguration<BillingPlanChange>
{
    public void Configure(EntityTypeBuilder<BillingPlanChange> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.FromPlan).HasMaxLength(16);
        b.Property(x => x.ToPlan).HasMaxLength(16);
        b.Property(x => x.Cycle).HasMaxLength(16);
        b.Property(x => x.Amount).HasPrecision(12, 2);
        b.HasIndex(x => new { x.UserId, x.CreatedAt });
        b.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class BillingPaymentConfiguration : IEntityTypeConfiguration<BillingPayment>
{
    public void Configure(EntityTypeBuilder<BillingPayment> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Provider).HasMaxLength(16);
        b.Property(x => x.ProviderPaymentId).HasMaxLength(64);
        b.Property(x => x.Plan).HasMaxLength(16);
        b.Property(x => x.Cycle).HasMaxLength(16);
        b.Property(x => x.Status).HasMaxLength(16);
        b.Property(x => x.Kind).HasMaxLength(16);
        b.Property(x => x.ConfirmationUrl).HasMaxLength(1000);
        b.Property(x => x.Error).HasMaxLength(500);
        b.Property(x => x.Amount).HasPrecision(12, 2);
        b.HasIndex(x => new { x.UserId, x.CreatedAt });
        b.HasIndex(x => x.ProviderPaymentId).IsUnique().HasFilter("\"ProviderPaymentId\" IS NOT NULL");
        b.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
