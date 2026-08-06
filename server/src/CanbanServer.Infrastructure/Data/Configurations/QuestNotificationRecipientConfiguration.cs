using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class QuestNotificationRecipientConfiguration : IEntityTypeConfiguration<QuestNotificationRecipient>
{
    public void Configure(EntityTypeBuilder<QuestNotificationRecipient> builder)
    {
        builder.HasKey(x => x.Id);
        builder.HasIndex(x => new { x.QuestId, x.UserId }).IsUnique();
        builder.HasOne(x => x.Quest).WithMany(q => q.NotificationRecipients)
            .HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(x => x.User).WithMany()
            .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
