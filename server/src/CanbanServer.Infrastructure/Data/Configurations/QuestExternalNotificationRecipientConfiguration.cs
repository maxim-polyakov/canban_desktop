using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class QuestExternalNotificationRecipientConfiguration : IEntityTypeConfiguration<QuestExternalNotificationRecipient>
{
    public void Configure(EntityTypeBuilder<QuestExternalNotificationRecipient> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Email).HasMaxLength(320).IsRequired();
        builder.Property(x => x.DisplayName).HasMaxLength(200);
        builder.HasIndex(x => new { x.QuestId, x.Email }).IsUnique();
        builder.HasOne(x => x.Quest).WithMany(q => q.ExternalNotificationRecipients)
            .HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
    }
}
