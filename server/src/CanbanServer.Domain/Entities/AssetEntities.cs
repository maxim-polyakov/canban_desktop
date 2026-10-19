namespace CanbanServer.Domain.Entities;

public enum AssetAttributeType { Text, Number, Date, Boolean, Select, Status, User, Reference, Url, Email }

public class AssetSchema
{
    public Guid Id { get; set; }
    public Guid TeamId { get; set; }
    public string Name { get; set; } = "";
    public string Key { get; set; } = "";
    public string? Description { get; set; }
    public int NextObjectNumber { get; set; } = 1;
    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class AssetObjectType
{
    public Guid Id { get; set; }
    public Guid SchemaId { get; set; }
    public Guid? ParentTypeId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string Icon { get; set; } = "box";
    public int Position { get; set; }
}

public class AssetAttribute
{
    public Guid Id { get; set; }
    public Guid ObjectTypeId { get; set; }
    public string Name { get; set; } = "";
    public AssetAttributeType Type { get; set; }
    public bool Required { get; set; }
    /// <summary>Newline-separated choices for Select and Status attributes.</summary>
    public string? Options { get; set; }
    public Guid? ReferenceTypeId { get; set; }
    public int Position { get; set; }
}

public class AssetObject
{
    public Guid Id { get; set; }
    public Guid SchemaId { get; set; }
    public Guid ObjectTypeId { get; set; }
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class AssetAttributeValue
{
    public Guid Id { get; set; }
    public Guid ObjectId { get; set; }
    public Guid AttributeId { get; set; }
    public string? Value { get; set; }
    public Guid? ReferencedObjectId { get; set; }
}

public class AssetQuestLink
{
    public Guid ObjectId { get; set; }
    public Guid QuestId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class AssetObjectChange
{
    public Guid Id { get; set; }
    public Guid ObjectId { get; set; }
    public Guid? UserId { get; set; }
    public string Field { get; set; } = "";
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
    public DateTime CreatedAt { get; set; }
}
