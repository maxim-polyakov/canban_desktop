namespace CanbanServer.Domain.Entities;

/// <summary>A page in a space's "Документы" tab (in-app replacement for Confluence pages).</summary>
public class SpaceDocument
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public Guid? ParentId { get; set; }
    public string Title { get; set; } = "";
    /// <summary>Markdown body.</summary>
    public string Content { get; set; } = "";
    public Guid CreatedByUserId { get; set; }
    public Guid UpdatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>An intake form in a space's "Формы" tab; every submission becomes an issue.</summary>
public class SpaceForm
{
    public Guid Id { get; set; }
    public Guid BoardId { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public IssueType IssueType { get; set; } = IssueType.Task;
    /// <summary>JSON array of { id, label, type, required, options? }.</summary>
    public string FieldsJson { get; set; } = "[]";
    public bool IsOpen { get; set; } = true;
    public int SubmissionCount { get; set; }
    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
