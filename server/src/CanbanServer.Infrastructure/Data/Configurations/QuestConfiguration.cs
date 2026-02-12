using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class QuestConfiguration : IEntityTypeConfiguration<Quest>
{
    public void Configure(EntityTypeBuilder<Quest> builder)
    {
        builder.HasKey(q => q.Id);
        builder.HasOne(q => q.Column).WithMany(c => c.Quests).HasForeignKey(q => q.ColumnId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(q => q.Board).WithMany().HasForeignKey(q => q.BoardId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(q => q.Assignee).WithMany(u => u.AssignedQuests).HasForeignKey(q => q.AssigneeId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(q => q.ParentEpic).WithMany(q => q.SubQuests).HasForeignKey(q => q.ParentEpicId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(q => new { q.ColumnId, q.Order });
    }
}
