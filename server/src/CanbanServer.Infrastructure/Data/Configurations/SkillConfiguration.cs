using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class SkillConfiguration : IEntityTypeConfiguration<Skill>
{
    public void Configure(EntityTypeBuilder<Skill> builder)
    {
        builder.HasKey(s => s.Id);
        builder.HasOne(s => s.ParentSkill).WithMany(s => s.Children).HasForeignKey(s => s.ParentSkillId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(s => s.RequiredAchievement).WithMany(a => a.UnlocksSkills).HasForeignKey(s => s.RequiredAchievementId).OnDelete(DeleteBehavior.SetNull);
    }
}
