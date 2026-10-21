using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class ServiceDeskSettingsConfiguration : IEntityTypeConfiguration<ServiceDeskSettings>
{
    public void Configure(EntityTypeBuilder<ServiceDeskSettings> b)
    {
        b.HasKey(x => x.BoardId);
        b.Property(x => x.PortalSlug).HasMaxLength(64);
        b.Property(x => x.WelcomeTitle).HasMaxLength(200);
        b.Property(x => x.WelcomeText).HasMaxLength(4000);
        b.HasIndex(x => x.PortalSlug).IsUnique().HasFilter("\"PortalSlug\" <> ''");
        b.HasOne(x => x.Board).WithOne().HasForeignKey<ServiceDeskSettings>(x => x.BoardId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class ServiceRequestTypeConfiguration : IEntityTypeConfiguration<ServiceRequestType>
{
    public void Configure(EntityTypeBuilder<ServiceRequestType> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(120);
        b.Property(x => x.Description).HasMaxLength(2000);
        b.Property(x => x.Icon).HasMaxLength(32);
        b.Property(x => x.FieldsJson).HasColumnType("text");
        b.HasIndex(x => new { x.BoardId, x.Order });
        b.HasOne(x => x.Board).WithMany().HasForeignKey(x => x.BoardId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class ServiceQueueConfiguration : IEntityTypeConfiguration<ServiceQueue>
{
    public void Configure(EntityTypeBuilder<ServiceQueue> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(120);
        b.Property(x => x.Description).HasMaxLength(2000);
        b.Property(x => x.Jql).HasMaxLength(2000);
        b.HasIndex(x => new { x.BoardId, x.Order });
        b.HasOne(x => x.Board).WithMany().HasForeignKey(x => x.BoardId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class SlaPolicyConfiguration : IEntityTypeConfiguration<SlaPolicy>
{
    public void Configure(EntityTypeBuilder<SlaPolicy> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(120);
        b.Property(x => x.PauseStatusTitlesJson).HasColumnType("text");
        b.Property(x => x.CalendarJson).HasColumnType("text");
        b.HasIndex(x => x.BoardId);
        b.HasOne(x => x.Board).WithMany().HasForeignKey(x => x.BoardId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class SlaClockConfiguration : IEntityTypeConfiguration<SlaClock>
{
    public void Configure(EntityTypeBuilder<SlaClock> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Metric).HasMaxLength(32);
        b.Property(x => x.Status).HasMaxLength(16);
        b.HasIndex(x => new { x.QuestId, x.Metric }).IsUnique();
        b.HasIndex(x => new { x.Status, x.TargetAt });
        b.HasOne(x => x.Quest).WithMany().HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Policy).WithMany().HasForeignKey(x => x.PolicyId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class ApprovalRequestConfiguration : IEntityTypeConfiguration<ApprovalRequest>
{
    public void Configure(EntityTypeBuilder<ApprovalRequest> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Title).HasMaxLength(200);
        b.Property(x => x.Status).HasMaxLength(16);
        b.Property(x => x.BlockedTransitionKey).HasMaxLength(64);
        b.HasIndex(x => new { x.QuestId, x.Status });
        b.HasIndex(x => x.BoardId);
        b.HasOne(x => x.Quest).WithMany().HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Board).WithMany().HasForeignKey(x => x.BoardId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class ApprovalDecisionConfiguration : IEntityTypeConfiguration<ApprovalDecision>
{
    public void Configure(EntityTypeBuilder<ApprovalDecision> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Status).HasMaxLength(16);
        b.Property(x => x.Comment).HasMaxLength(2000);
        b.HasIndex(x => x.ApprovalRequestId);
        b.HasOne(x => x.ApprovalRequest).WithMany(x => x.Decisions).HasForeignKey(x => x.ApprovalRequestId).OnDelete(DeleteBehavior.Cascade);
    }
}
