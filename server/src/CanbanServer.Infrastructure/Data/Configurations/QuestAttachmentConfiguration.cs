using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class QuestAttachmentConfiguration : IEntityTypeConfiguration<QuestAttachment>
{
    public void Configure(EntityTypeBuilder<QuestAttachment> builder)
    {
        builder.HasKey(a => a.Id);
        builder.Property(a => a.FileName).HasMaxLength(255).IsRequired();
        builder.Property(a => a.ContentType).HasMaxLength(255).IsRequired();
        builder.Property(a => a.StorageKey).HasMaxLength(1024).IsRequired();
        builder.HasIndex(a => a.StorageKey).IsUnique();
        builder.HasIndex(a => new { a.QuestId, a.CreatedAt });
        builder.HasOne(a => a.Quest)
            .WithMany(q => q.Attachments)
            .HasForeignKey(a => a.QuestId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(a => a.UploadedByUser)
            .WithMany()
            .HasForeignKey(a => a.UploadedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
