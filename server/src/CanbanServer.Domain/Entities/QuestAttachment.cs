namespace CanbanServer.Domain.Entities;

public class QuestAttachment
{
    public Guid Id { get; set; }
    public Guid QuestId { get; set; }
    public Guid UploadedByUserId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = "application/octet-stream";
    public long SizeBytes { get; set; }
    public string StorageKey { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }

    public Quest Quest { get; set; } = null!;
    public User UploadedByUser { get; set; } = null!;
}
