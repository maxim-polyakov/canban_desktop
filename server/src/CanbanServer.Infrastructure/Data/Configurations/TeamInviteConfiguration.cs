using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class TeamInviteConfiguration : IEntityTypeConfiguration<TeamInvite>
{
    public void Configure(EntityTypeBuilder<TeamInvite> builder)
    {
        builder.HasKey(i => i.Id);
        builder.HasOne(i => i.Team).WithMany().HasForeignKey(i => i.TeamId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(i => i.InvitedUser).WithMany().HasForeignKey(i => i.InvitedUserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(i => i.InvitedByUser).WithMany().HasForeignKey(i => i.InvitedByUserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(i => new { i.TeamId, i.InvitedUserId }).IsUnique();
    }
}
