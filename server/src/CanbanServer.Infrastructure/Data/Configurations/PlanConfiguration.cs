using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class PlanConfiguration : IEntityTypeConfiguration<Plan>
{
    public void Configure(EntityTypeBuilder<Plan> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(200);
        b.Property(x => x.Access).HasMaxLength(16);
        b.Property(x => x.ExcludedIssueTypes).HasMaxLength(64);
        b.HasIndex(x => x.OwnerUserId);
        b.HasOne<User>().WithMany().HasForeignKey(x => x.OwnerUserId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany(x => x.Sources).WithOne().HasForeignKey(x => x.PlanId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany(x => x.Teams).WithOne().HasForeignKey(x => x.PlanId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany(x => x.Scenarios).WithOne().HasForeignKey(x => x.PlanId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany(x => x.Exclusions).WithOne().HasForeignKey(x => x.PlanId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class PlanSourceConfiguration : IEntityTypeConfiguration<PlanSource>
{
    public void Configure(EntityTypeBuilder<PlanSource> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Kind).HasMaxLength(16);
        b.HasIndex(x => x.PlanId);
        b.HasOne<Board>().WithMany().HasForeignKey(x => x.BoardId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<SavedFilter>().WithMany().HasForeignKey(x => x.FilterId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class PlanTeamConfiguration : IEntityTypeConfiguration<PlanTeam>
{
    public void Configure(EntityTypeBuilder<PlanTeam> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(200);
        b.HasIndex(x => x.PlanId);
        b.HasOne<Team>().WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.SetNull);
    }
}

public class PlanScenarioConfiguration : IEntityTypeConfiguration<PlanScenario>
{
    public void Configure(EntityTypeBuilder<PlanScenario> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(200);
        b.Property(x => x.Color).HasMaxLength(16);
        b.HasIndex(x => x.PlanId);
        b.HasMany(x => x.Items).WithOne().HasForeignKey(x => x.ScenarioId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class PlanScheduleItemConfiguration : IEntityTypeConfiguration<PlanScheduleItem>
{
    public void Configure(EntityTypeBuilder<PlanScheduleItem> b)
    {
        b.HasKey(x => new { x.ScenarioId, x.QuestId });
        b.HasOne<Quest>().WithMany().HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<PlanTeam>().WithMany().HasForeignKey(x => x.PlanTeamId).OnDelete(DeleteBehavior.SetNull);
    }
}

public class PlanExclusionConfiguration : IEntityTypeConfiguration<PlanExclusion>
{
    public void Configure(EntityTypeBuilder<PlanExclusion> b)
    {
        b.HasKey(x => new { x.PlanId, x.QuestId });
        b.HasOne<Quest>().WithMany().HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
    }
}
