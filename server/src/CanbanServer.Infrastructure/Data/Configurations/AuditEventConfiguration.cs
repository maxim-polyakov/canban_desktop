using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class AuditEventConfiguration : IEntityTypeConfiguration<AuditEvent>
{
    public void Configure(EntityTypeBuilder<AuditEvent> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.BoardName).HasMaxLength(200);
        b.Property(x => x.ActorName).HasMaxLength(200);
        b.Property(x => x.Action).HasMaxLength(80);
        b.Property(x => x.Category).HasMaxLength(40);
        b.Property(x => x.ObjectType).HasMaxLength(40);
        b.Property(x => x.ObjectName).HasMaxLength(300);
        b.Property(x => x.DetailsJson).HasColumnType("text");
        b.Property(x => x.IpAddress).HasMaxLength(64);
        b.HasIndex(x => new { x.TeamId, x.CreatedAt });
    }
}

public class AuditSettingConfiguration : IEntityTypeConfiguration<AuditSetting>
{
    public void Configure(EntityTypeBuilder<AuditSetting> b)
    {
        b.HasKey(x => x.TeamId);
        b.HasOne<Team>().WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Cascade);
    }
}
