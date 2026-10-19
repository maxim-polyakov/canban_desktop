using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class SprintConfiguration : IEntityTypeConfiguration<Sprint>
{
    public void Configure(EntityTypeBuilder<Sprint> builder)
    {
        builder.HasKey(s => s.Id);
        builder.Property(s => s.Name).HasMaxLength(200).IsRequired();
        builder.Property(s => s.Goal).HasMaxLength(2000);
        builder.HasOne(s => s.Board).WithMany(b => b.Sprints).HasForeignKey(s => s.BoardId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(s => new { s.BoardId, s.Order });
        builder.HasIndex(s => new { s.BoardId, s.Status });
    }
}
