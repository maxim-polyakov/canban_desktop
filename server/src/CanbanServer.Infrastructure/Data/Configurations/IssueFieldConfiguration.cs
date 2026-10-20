using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class IssueTypeDefinitionConfiguration : IEntityTypeConfiguration<IssueTypeDefinition>
{
    public void Configure(EntityTypeBuilder<IssueTypeDefinition> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(60);
        b.Property(x => x.Description).HasMaxLength(500);
        b.Property(x => x.Icon).HasMaxLength(16);
        b.Property(x => x.Color).HasMaxLength(16);
        b.HasIndex(x => x.TeamId);
        b.HasOne<Team>().WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class CustomFieldDefinitionConfiguration : IEntityTypeConfiguration<CustomFieldDefinition>
{
    public void Configure(EntityTypeBuilder<CustomFieldDefinition> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(100);
        b.Property(x => x.Description).HasMaxLength(500);
        b.Property(x => x.FieldType).HasMaxLength(16);
        b.Property(x => x.OptionsJson).HasColumnType("text");
        b.Property(x => x.Boards).HasColumnType("text");
        b.Property(x => x.IssueTypes).HasColumnType("text");
        b.Property(x => x.CascadeJson).HasColumnType("text");
        b.Property(x => x.DefaultValueJson).HasColumnType("text");
        b.Property(x => x.ContextsJson).HasColumnType("text");
        b.HasIndex(x => x.TeamId);
        b.HasOne<Team>().WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class UserGroupConfiguration : IEntityTypeConfiguration<UserGroup>
{
    public void Configure(EntityTypeBuilder<UserGroup> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(100);
        b.Property(x => x.Description).HasMaxLength(500);
        b.HasIndex(x => x.TeamId);
        b.HasOne<Team>().WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany(x => x.Members).WithOne().HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class UserGroupMemberConfiguration : IEntityTypeConfiguration<UserGroupMember>
{
    public void Configure(EntityTypeBuilder<UserGroupMember> b)
    {
        b.HasKey(x => new { x.GroupId, x.UserId });
        b.HasIndex(x => x.UserId);
        b.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
