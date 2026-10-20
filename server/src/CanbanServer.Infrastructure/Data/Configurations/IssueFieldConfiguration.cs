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
        b.HasIndex(x => x.TeamId);
        b.HasOne<Team>().WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Cascade);
    }
}
