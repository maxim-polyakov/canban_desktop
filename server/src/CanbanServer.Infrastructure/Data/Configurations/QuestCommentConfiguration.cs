using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class QuestCommentConfiguration : IEntityTypeConfiguration<QuestComment>
{
    public void Configure(EntityTypeBuilder<QuestComment> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Text).HasMaxLength(5000).IsRequired();
        builder.HasIndex(x => new { x.QuestId, x.CreatedAt });
        builder.HasOne(x => x.Quest).WithMany(q => q.Comments)
            .HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(x => x.AuthorUser).WithMany()
            .HasForeignKey(x => x.AuthorUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
