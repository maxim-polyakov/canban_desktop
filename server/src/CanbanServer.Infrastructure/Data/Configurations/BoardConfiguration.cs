using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class BoardConfiguration : IEntityTypeConfiguration<Board>
{
    public void Configure(EntityTypeBuilder<Board> builder)
    {
        builder.HasKey(b => b.Id);
        builder.HasOne(b => b.Team).WithMany(t => t.Boards).HasForeignKey(b => b.TeamId).OnDelete(DeleteBehavior.Cascade);
        builder.Property(b => b.CreatedByUserId).IsRequired(false);
    }
}
