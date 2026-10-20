using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class SpaceDocumentConfiguration : IEntityTypeConfiguration<SpaceDocument>
{
    public void Configure(EntityTypeBuilder<SpaceDocument> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Title).HasMaxLength(255);
        b.HasIndex(x => x.BoardId);
        b.HasOne<Board>().WithMany().HasForeignKey(x => x.BoardId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<SpaceDocument>().WithMany().HasForeignKey(x => x.ParentId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class SpaceFormConfiguration : IEntityTypeConfiguration<SpaceForm>
{
    public void Configure(EntityTypeBuilder<SpaceForm> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Title).HasMaxLength(255);
        b.Property(x => x.Description).HasMaxLength(2000);
        b.HasIndex(x => x.BoardId);
        b.HasOne<Board>().WithMany().HasForeignKey(x => x.BoardId).OnDelete(DeleteBehavior.Cascade);
    }
}
