using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class QuestConfiguration : IEntityTypeConfiguration<Quest>
{
    public void Configure(EntityTypeBuilder<Quest> builder)
    {
        builder.HasKey(q => q.Id);
        builder.Property(q => q.IssueKey).HasMaxLength(64);
        builder.Property(q => q.Labels).HasMaxLength(1000);
        builder.Property(q => q.Component).HasMaxLength(200);
        builder.Property(q => q.FixVersion).HasMaxLength(200);
        builder.Property(q => q.DescriptionDocumentJson).HasColumnType("text");
        builder.Property(q => q.CustomFieldsJson).HasColumnType("text");
        builder.HasOne<IssueTypeDefinition>().WithMany().HasForeignKey(q => q.IssueTypeId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(q => q.Column).WithMany(c => c.Quests).HasForeignKey(q => q.ColumnId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(q => q.Board).WithMany().HasForeignKey(q => q.BoardId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(q => q.Assignee).WithMany(u => u.AssignedQuests).HasForeignKey(q => q.AssigneeId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(q => q.ParentEpic).WithMany(q => q.SubQuests).HasForeignKey(q => q.ParentEpicId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(q => q.ParentQuest).WithMany(q => q.Children).HasForeignKey(q => q.ParentQuestId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(q => q.Sprint).WithMany(s => s.Quests).HasForeignKey(q => q.SprintId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(q => new { q.ColumnId, q.Order });
        builder.HasIndex(q => q.IssueKey);
        builder.HasIndex(q => new { q.BoardId, q.IssueNumber }).IsUnique();
        builder.HasIndex(q => q.SprintId);
        builder.HasIndex(q => q.ParentQuestId);
    }
}
