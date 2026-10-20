using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class WorkflowTransitionConfiguration : IEntityTypeConfiguration<WorkflowTransition>
{
    public void Configure(EntityTypeBuilder<WorkflowTransition> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(200);
        b.Property(x => x.AllowedIssueTypes).HasMaxLength(2000);
        b.Property(x => x.AllowedRoles).HasMaxLength(200);
        b.HasIndex(x => new { x.BoardId, x.SourceColumnId, x.TargetColumnId });
    }
}

public class QuestLinkConfiguration : IEntityTypeConfiguration<QuestLink>
{
    public void Configure(EntityTypeBuilder<QuestLink> b)
    {
        b.HasKey(x => x.Id);
        b.HasOne(x => x.SourceQuest).WithMany(q => q.OutgoingLinks).HasForeignKey(x => x.SourceQuestId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.TargetQuest).WithMany(q => q.IncomingLinks).HasForeignKey(x => x.TargetQuestId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => new { x.SourceQuestId, x.TargetQuestId, x.Type }).IsUnique();
    }
}

public class BoardComponentConfiguration : IEntityTypeConfiguration<BoardComponent>
{
    public void Configure(EntityTypeBuilder<BoardComponent> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(200);
        b.HasIndex(x => new { x.BoardId, x.Name }).IsUnique();
    }
}

public class BoardReleaseConfiguration : IEntityTypeConfiguration<BoardRelease>
{
    public void Configure(EntityTypeBuilder<BoardRelease> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(200);
        b.HasIndex(x => new { x.BoardId, x.Name }).IsUnique();
    }
}

public class QuestComponentConfiguration : IEntityTypeConfiguration<QuestComponent>
{
    public void Configure(EntityTypeBuilder<QuestComponent> b)
    {
        b.HasKey(x => new { x.QuestId, x.ComponentId });
        b.HasOne(x => x.Quest).WithMany(q => q.QuestComponents).HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Component).WithMany().HasForeignKey(x => x.ComponentId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class QuestReleaseConfiguration : IEntityTypeConfiguration<QuestRelease>
{
    public void Configure(EntityTypeBuilder<QuestRelease> b)
    {
        b.HasKey(x => new { x.QuestId, x.ReleaseId });
        b.HasOne(x => x.Quest).WithMany(q => q.QuestReleases).HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Release).WithMany().HasForeignKey(x => x.ReleaseId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class WorkLogConfiguration : IEntityTypeConfiguration<WorkLog>
{
    public void Configure(EntityTypeBuilder<WorkLog> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Note).HasMaxLength(2000);
        b.HasOne<Quest>().WithMany(q => q.WorkLogs).HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => new { x.QuestId, x.StartedAt });
    }
}

public class QuestChangeConfiguration : IEntityTypeConfiguration<QuestChange>
{
    public void Configure(EntityTypeBuilder<QuestChange> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.ChangeType).HasMaxLength(64);
        b.Property(x => x.Field).HasMaxLength(128);
        b.HasOne<Quest>().WithMany(q => q.Changes).HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => new { x.QuestId, x.CreatedAt });
    }
}

public class AppNotificationConfiguration : IEntityTypeConfiguration<AppNotification>
{
    public void Configure(EntityTypeBuilder<AppNotification> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Type).HasMaxLength(64);
        b.Property(x => x.Title).HasMaxLength(300);
        b.HasIndex(x => new { x.UserId, x.Read, x.CreatedAt });
    }
}

public class SavedFilterConfiguration : IEntityTypeConfiguration<SavedFilter>
{
    public void Configure(EntityTypeBuilder<SavedFilter> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(200);
        b.Property(x => x.Jql).HasMaxLength(4000);
        b.HasIndex(x => new { x.OwnerUserId, x.Name });
    }
}

public class OutboxMessageConfiguration : IEntityTypeConfiguration<OutboxMessage>
{
    public void Configure(EntityTypeBuilder<OutboxMessage> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Type).HasMaxLength(128);
        b.HasIndex(x => new { x.Status, x.AvailableAt });
    }
}

public class AutomationRuleConfiguration : IEntityTypeConfiguration<AutomationRule>
{
    public void Configure(EntityTypeBuilder<AutomationRule> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(200);
        b.HasIndex(x => new { x.BoardId, x.Enabled });
    }
}

public class OutboundWebhookConfiguration : IEntityTypeConfiguration<OutboundWebhook>
{
    public void Configure(EntityTypeBuilder<OutboundWebhook> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Url).HasMaxLength(1000);
        b.Property(x => x.SecretConfigurationKey).HasMaxLength(200);
        b.Property(x => x.Events).HasMaxLength(1000);
    }
}

public class WebhookDeliveryConfiguration : IEntityTypeConfiguration<WebhookDelivery>
{
    public void Configure(EntityTypeBuilder<WebhookDelivery> b)
    {
        b.HasKey(x => x.Id);
        b.HasIndex(x => new { x.Status, x.NextAttemptAt });
    }
}

public class GitHubIntegrationConfiguration : IEntityTypeConfiguration<GitHubIntegration>
{
    public void Configure(EntityTypeBuilder<GitHubIntegration> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.RepositoryOwner).HasMaxLength(200);
        b.Property(x => x.RepositoryName).HasMaxLength(200);
        b.Property(x => x.WebhookSecretConfigurationKey).HasMaxLength(200);
        b.HasIndex(x => new { x.BoardId, x.RepositoryOwner, x.RepositoryName }).IsUnique();
    }
}

public class DevelopmentLinkConfiguration : IEntityTypeConfiguration<DevelopmentLink>
{
    public void Configure(EntityTypeBuilder<DevelopmentLink> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Kind).HasMaxLength(64);
        b.Property(x => x.ExternalId).HasMaxLength(200);
        b.Property(x => x.Url).HasMaxLength(1000);
        b.Property(x => x.Title).HasMaxLength(500);
        b.HasOne<Quest>().WithMany(q => q.DevelopmentLinks).HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => new { x.QuestId, x.Kind, x.ExternalId }).IsUnique();
    }
}

public class DashboardConfiguration : IEntityTypeConfiguration<Dashboard>
{
    public void Configure(EntityTypeBuilder<Dashboard> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(200);
        b.Property(x => x.Description).HasMaxLength(2000);
        b.Property(x => x.Template).HasMaxLength(32);
        b.Property(x => x.Viewers).HasMaxLength(16);
        b.Property(x => x.Editors).HasMaxLength(16);
        b.HasIndex(x => x.OwnerUserId);
    }
}

public class DashboardStarConfiguration : IEntityTypeConfiguration<DashboardStar>
{
    public void Configure(EntityTypeBuilder<DashboardStar> b)
    {
        b.HasKey(x => new { x.DashboardId, x.UserId });
        b.HasIndex(x => x.UserId);
        b.HasOne<Dashboard>().WithMany().HasForeignKey(x => x.DashboardId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
