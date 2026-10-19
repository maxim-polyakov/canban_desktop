using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class HomeItemConfiguration : IEntityTypeConfiguration<HomeItem>
{
    public void Configure(EntityTypeBuilder<HomeItem> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Kind).HasMaxLength(16);
        b.Property(x => x.Name).HasMaxLength(200);
        b.Property(x => x.Icon).HasMaxLength(16);
        b.Property(x => x.Status).HasMaxLength(16);
        b.Property(x => x.Tags).HasMaxLength(500);
        b.HasIndex(x => x.Kind);
        b.HasIndex(x => x.OwnerUserId);
        b.HasIndex(x => x.ParentId);
        b.HasOne<User>().WithMany().HasForeignKey(x => x.OwnerUserId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<User>().WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Team>().WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.SetNull);
        b.HasOne<HomeItem>().WithMany().HasForeignKey(x => x.ParentId).OnDelete(DeleteBehavior.SetNull);
        b.HasMany(x => x.Members).WithOne().HasForeignKey(x => x.ItemId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany(x => x.Updates).WithOne().HasForeignKey(x => x.ItemId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class HomeItemMemberConfiguration : IEntityTypeConfiguration<HomeItemMember>
{
    public void Configure(EntityTypeBuilder<HomeItemMember> b)
    {
        b.HasKey(x => new { x.ItemId, x.UserId, x.Role });
        b.Property(x => x.Role).HasMaxLength(16);
        b.HasIndex(x => x.UserId);
        b.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class HomeItemLinkConfiguration : IEntityTypeConfiguration<HomeItemLink>
{
    public void Configure(EntityTypeBuilder<HomeItemLink> b)
    {
        b.HasKey(x => new { x.GoalId, x.ProjectId });
        b.HasIndex(x => x.ProjectId);
        b.HasOne<HomeItem>().WithMany().HasForeignKey(x => x.GoalId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<HomeItem>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class HomeItemWorkConfiguration : IEntityTypeConfiguration<HomeItemWork>
{
    public void Configure(EntityTypeBuilder<HomeItemWork> b)
    {
        b.HasKey(x => new { x.ItemId, x.QuestId });
        b.HasOne<HomeItem>().WithMany().HasForeignKey(x => x.ItemId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Quest).WithMany().HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class HomeStatusUpdateConfiguration : IEntityTypeConfiguration<HomeStatusUpdate>
{
    public void Configure(EntityTypeBuilder<HomeStatusUpdate> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Status).HasMaxLength(16);
        b.Property(x => x.PreviousStatus).HasMaxLength(16);
        b.HasIndex(x => new { x.ItemId, x.CreatedAt });
        b.HasOne<User>().WithMany().HasForeignKey(x => x.AuthorUserId).OnDelete(DeleteBehavior.Cascade);
    }
}
