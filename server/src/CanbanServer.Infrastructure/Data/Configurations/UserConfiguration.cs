using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasKey(u => u.Id);
        builder.HasIndex(u => u.Email).IsUnique();
        builder.Property(u => u.EmailFormat).HasMaxLength(8);
        builder.Property(u => u.JobTitle).HasMaxLength(120);
        builder.Property(u => u.Department).HasMaxLength(120);
        builder.Property(u => u.Organization).HasMaxLength(120);
        builder.Property(u => u.Location).HasMaxLength(120);
        builder.Property(u => u.AboutMe).HasMaxLength(2000);
        builder.HasOne(u => u.Character).WithOne(c => c.User).HasForeignKey<Character>(c => c.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
