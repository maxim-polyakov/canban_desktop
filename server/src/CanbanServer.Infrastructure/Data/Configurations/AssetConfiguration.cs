using CanbanServer.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CanbanServer.Infrastructure.Data.Configurations;

public class AssetSchemaConfiguration : IEntityTypeConfiguration<AssetSchema>
{
    public void Configure(EntityTypeBuilder<AssetSchema> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(200);
        b.Property(x => x.Key).HasMaxLength(10);
        b.HasIndex(x => x.Key).IsUnique();
        b.HasIndex(x => x.TeamId);
        b.HasOne<Team>().WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class AssetObjectTypeConfiguration : IEntityTypeConfiguration<AssetObjectType>
{
    public void Configure(EntityTypeBuilder<AssetObjectType> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(200);
        b.Property(x => x.Icon).HasMaxLength(32);
        b.HasIndex(x => new { x.SchemaId, x.Name }).IsUnique();
        b.HasOne<AssetSchema>().WithMany().HasForeignKey(x => x.SchemaId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<AssetObjectType>().WithMany().HasForeignKey(x => x.ParentTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}

public class AssetAttributeConfiguration : IEntityTypeConfiguration<AssetAttribute>
{
    public void Configure(EntityTypeBuilder<AssetAttribute> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(200);
        b.HasIndex(x => new { x.ObjectTypeId, x.Name }).IsUnique();
        b.HasOne<AssetObjectType>().WithMany().HasForeignKey(x => x.ObjectTypeId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class AssetObjectConfiguration : IEntityTypeConfiguration<AssetObject>
{
    public void Configure(EntityTypeBuilder<AssetObject> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Key).HasMaxLength(32);
        b.Property(x => x.Label).HasMaxLength(500);
        b.HasIndex(x => x.Key).IsUnique();
        b.HasIndex(x => new { x.ObjectTypeId, x.Label });
        b.HasOne<AssetSchema>().WithMany().HasForeignKey(x => x.SchemaId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<AssetObjectType>().WithMany().HasForeignKey(x => x.ObjectTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}

public class AssetAttributeValueConfiguration : IEntityTypeConfiguration<AssetAttributeValue>
{
    public void Configure(EntityTypeBuilder<AssetAttributeValue> b)
    {
        b.HasKey(x => x.Id);
        b.HasIndex(x => new { x.ObjectId, x.AttributeId }).IsUnique();
        b.HasIndex(x => x.ReferencedObjectId);
        b.HasOne<AssetObject>().WithMany().HasForeignKey(x => x.ObjectId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<AssetAttribute>().WithMany().HasForeignKey(x => x.AttributeId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<AssetObject>().WithMany().HasForeignKey(x => x.ReferencedObjectId).OnDelete(DeleteBehavior.SetNull);
    }
}

public class AssetQuestLinkConfiguration : IEntityTypeConfiguration<AssetQuestLink>
{
    public void Configure(EntityTypeBuilder<AssetQuestLink> b)
    {
        b.HasKey(x => new { x.ObjectId, x.QuestId });
        b.HasIndex(x => x.QuestId);
        b.HasOne<AssetObject>().WithMany().HasForeignKey(x => x.ObjectId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne<Quest>().WithMany().HasForeignKey(x => x.QuestId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class AssetObjectChangeConfiguration : IEntityTypeConfiguration<AssetObjectChange>
{
    public void Configure(EntityTypeBuilder<AssetObjectChange> b)
    {
        b.HasKey(x => x.Id);
        b.Property(x => x.Field).HasMaxLength(200);
        b.HasIndex(x => new { x.ObjectId, x.CreatedAt });
        b.HasOne<AssetObject>().WithMany().HasForeignKey(x => x.ObjectId).OnDelete(DeleteBehavior.Cascade);
    }
}
