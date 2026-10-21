using CanbanServer.Infrastructure.Services;
using CanbanServer.Api.Auditing;
using Microsoft.AspNetCore.Mvc;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using System.Text.RegularExpressions;

namespace CanbanServer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class QuestsController : ControllerBase
{
    private const long MaxAttachmentSize = 1024L * 1024 * 1024;
    private const long MaxAttachmentRequestSize = 1034L * 1024 * 1024;

    private readonly IQuestService _questService;
    private readonly IQuestAttachmentService _attachmentService;
    private readonly IQuestCollaborationService _collaborationService;
    private readonly IProjectAccessService _access;
    private readonly PermissionSchemeService _permissions;

    public QuestsController(
        IQuestService questService,
        IQuestAttachmentService attachmentService,
        IQuestCollaborationService collaborationService,
        IProjectAccessService access,
        PermissionSchemeService permissions)
    {
        _permissions = permissions;
        _questService = questService;
        _attachmentService = attachmentService;
        _collaborationService = collaborationService;
        _access = access;
    }

    private async Task<bool> CanQuest(Guid questId, BoardPermission permission, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return false;
        var access = await _access.GetQuestAccessAsync(questId, userId.Value, ct);
        return access.Status == ProjectAccessStatus.Success && access.Permission >= permission;
    }

    private async Task<bool> Can(Guid questId, string permission, CancellationToken ct)
    {
        var userId = User.GetUserId();
        return userId.HasValue && await _permissions.HasOnQuestAsync(questId, userId.Value, permission, ct);
    }

    private async Task<bool> CanBoard(Guid boardId, BoardPermission permission, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return false;
        var access = await _access.GetBoardAccessAsync(boardId, userId.Value, ct);
        return access.Status == ProjectAccessStatus.Success && access.Permission >= permission;
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<QuestDto>> Get(Guid id, CancellationToken ct)
    {
        if (!await CanQuest(id, BoardPermission.View, ct)) return Forbid();
        var quest = await _questService.GetByIdAsync(id, ct);
        return quest == null ? NotFound() : Ok(quest);
    }

    [HttpGet("column/{columnId:guid}")]
    public async Task<ActionResult<List<QuestDto>>> GetByColumn(Guid columnId, CancellationToken ct)
    {
        var probe = await _questService.GetByColumnIdAsync(columnId, ct);
        if (probe.Count > 0 && !await CanBoard(probe[0].BoardId, BoardPermission.View, ct)) return Forbid();
        var list = await _questService.GetByColumnIdAsync(columnId, ct);
        return Ok(list);
    }

    [HttpGet("{questId:guid}/attachments")]
    public async Task<ActionResult<List<QuestAttachmentDto>>> GetAttachments(
        Guid questId,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();

        var result = await _attachmentService.GetByQuestAsync(questId, userId.Value, ct);
        return result.Status switch
        {
            QuestAttachmentOperationStatus.Success => Ok(result.Items),
            QuestAttachmentOperationStatus.NotFound => NotFound(),
            QuestAttachmentOperationStatus.Forbidden => Forbid(),
            _ => StatusCode(500, "Не удалось получить вложения.")
        };
    }

    [HttpPost("{questId:guid}/attachments")]
    [RequestSizeLimit(MaxAttachmentRequestSize)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxAttachmentRequestSize)]
    public async Task<ActionResult<QuestAttachmentDto>> UploadAttachment(
        Guid questId,
        IFormFile? file,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        if (file == null || file.Length == 0)
            return BadRequest("Выберите непустой файл.");
        if (file.Length > MaxAttachmentSize)
            return BadRequest("Размер файла не должен превышать 1 ГБ.");
        if (await _permissions.FindQuestAsync(questId, ct) == null) return NotFound();
        if (!await Can(questId, JiraPermissions.CreateAttachments, ct)) return Forbid();

        await using var stream = file.OpenReadStream();
        var result = await _attachmentService.UploadAsync(
            questId,
            userId.Value,
            stream,
            file.FileName,
            file.ContentType,
            file.Length,
            ct);

        return result.Status switch
        {
            QuestAttachmentOperationStatus.Success => Ok(result.Attachment),
            QuestAttachmentOperationStatus.NotFound => NotFound(),
            QuestAttachmentOperationStatus.Forbidden => Forbid(),
            _ => StatusCode(500, "Не удалось загрузить файл в S3.")
        };
    }

    [HttpGet("{questId:guid}/attachments/{attachmentId:guid}/download-url")]
    public async Task<ActionResult<QuestAttachmentDownloadDto>> GetAttachmentDownloadUrl(
        Guid questId,
        Guid attachmentId,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();

        var result = await _attachmentService.GetDownloadAsync(
            questId,
            attachmentId,
            userId.Value,
            ct);
        return result.Status switch
        {
            QuestAttachmentOperationStatus.Success => Ok(result.Download),
            QuestAttachmentOperationStatus.NotFound => NotFound(),
            QuestAttachmentOperationStatus.Forbidden => Forbid(),
            _ => StatusCode(500, "Не удалось создать ссылку на скачивание.")
        };
    }

    [HttpDelete("{questId:guid}/attachments/{attachmentId:guid}")]
    public async Task<ActionResult> DeleteAttachment(
        Guid questId,
        Guid attachmentId,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();

        var status = await _attachmentService.DeleteAsync(
            questId,
            attachmentId,
            userId.Value,
            ct);
        return status switch
        {
            QuestAttachmentOperationStatus.Success => NoContent(),
            QuestAttachmentOperationStatus.NotFound => NotFound(),
            QuestAttachmentOperationStatus.Forbidden => Forbid(),
            _ => StatusCode(500, "Не удалось удалить вложение из S3.")
        };
    }

    [HttpGet("board/{boardId:guid}/archive")]
    public async Task<ActionResult<List<QuestDto>>> GetArchive(Guid boardId, CancellationToken ct)
    {
        if (!await CanBoard(boardId, BoardPermission.View, ct)) return Forbid();
        var list = await _questService.GetArchivedByBoardIdAsync(boardId, ct);
        return Ok(list);
    }

    [HttpGet("board/{boardId:guid}/backlog")]
    public async Task<ActionResult<List<QuestDto>>> GetBacklog(
        Guid boardId,
        [FromQuery] Guid? sprintId,
        [FromQuery] bool? unassignedSprint,
        [FromQuery] int? issueType,
        [FromQuery] int? priority,
        [FromQuery] Guid? assigneeId,
        [FromQuery] string? text,
        [FromQuery] string? label,
        [FromQuery] string? component,
        [FromQuery] string? fixVersion,
        [FromQuery] string? jql,
        CancellationToken ct)
    {
        if (!await CanBoard(boardId, BoardPermission.View, ct)) return Forbid();
        var filter = new QuestFilterRequest(
            SprintId: sprintId,
            UnassignedSprint: unassignedSprint,
            IssueType: issueType.HasValue ? (IssueType)issueType.Value : null,
            Priority: priority.HasValue ? (IssuePriority)priority.Value : null,
            AssigneeId: assigneeId,
            Text: text,
            Label: label,
            Component: component,
            FixVersion: fixVersion,
            BacklogOnly: true);
        filter = ApplyJql(filter, jql, User.GetUserId());
        var list = await _questService.GetBacklogByBoardIdAsync(boardId, filter, ct);
        return Ok(list);
    }

    [HttpGet("board/{boardId:guid}/filter")]
    public async Task<ActionResult<List<QuestDto>>> Filter(
        Guid boardId,
        [FromQuery] Guid? sprintId,
        [FromQuery] bool? unassignedSprint,
        [FromQuery] int? issueType,
        [FromQuery] int? priority,
        [FromQuery] Guid? assigneeId,
        [FromQuery] string? text,
        [FromQuery] string? label,
        [FromQuery] string? component,
        [FromQuery] string? fixVersion,
        [FromQuery] Guid? columnId,
        [FromQuery] bool? backlogOnly,
        [FromQuery] string? jql,
        CancellationToken ct)
    {
        if (!await CanBoard(boardId, BoardPermission.View, ct)) return Forbid();
        var filter = new QuestFilterRequest(
            SprintId: sprintId,
            UnassignedSprint: unassignedSprint,
            IssueType: issueType.HasValue ? (IssueType)issueType.Value : null,
            Priority: priority.HasValue ? (IssuePriority)priority.Value : null,
            AssigneeId: assigneeId,
            Text: text,
            Label: label,
            Component: component,
            FixVersion: fixVersion,
            ColumnId: columnId,
            BacklogOnly: backlogOnly);
        filter = ApplyJql(filter, jql, User.GetUserId());
        var list = await _questService.FilterByBoardIdAsync(boardId, filter, ct);
        return Ok(list);
    }

    private static QuestFilterRequest ApplyJql(QuestFilterRequest filter, string? jql, Guid? currentUserId)
    {
        if (string.IsNullOrWhiteSpace(jql)) return filter;

        var plainText = new List<string>();
        foreach (Match match in Regex.Matches(jql, @"(?<field>[a-zA-Z]+):(?:""(?<quoted>[^""]+)""|(?<value>\S+))|(?<plain>\S+)"))
        {
            if (match.Groups["plain"].Success)
            {
                plainText.Add(match.Groups["plain"].Value);
                continue;
            }

            var field = match.Groups["field"].Value.ToLowerInvariant();
            var value = (match.Groups["quoted"].Success
                ? match.Groups["quoted"].Value
                : match.Groups["value"].Value).Trim();
            switch (field)
            {
                case "assignee" when value.Equals("me", StringComparison.OrdinalIgnoreCase):
                    filter = filter with { AssigneeId = currentUserId };
                    break;
                case "priority" when Enum.TryParse<IssuePriority>(value, true, out var priority):
                    filter = filter with { Priority = priority };
                    break;
                case "type" when Enum.TryParse<IssueType>(value, true, out var issueType):
                    filter = filter with { IssueType = issueType };
                    break;
                case "label":
                    filter = filter with { Label = value };
                    break;
                case "component":
                    filter = filter with { Component = value };
                    break;
                case "version":
                case "fixversion":
                    filter = filter with { FixVersion = value };
                    break;
                default:
                    plainText.Add(match.Value);
                    break;
            }
        }

        if (plainText.Count > 0)
            filter = filter with { Text = string.Join(' ', plainText) };
        return filter;
    }

    [HttpPost]
    public async Task<ActionResult<QuestDto>> Create([FromBody] CreateQuestRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var boardId = await _permissions.BoardOfColumnAsync(request.ColumnId, ct);
        if (boardId == null) return NotFound();
        if (!await _permissions.HasAsync(boardId.Value, userId.Value, JiraPermissions.Create, ct)) return Forbid();
        try
        {
            var quest = await _questService.CreateAsync(request, userId.Value, ct);
            return CreatedAtAction(nameof(Get), new { id = quest.Id }, quest);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<QuestDto>> Update(Guid id, [FromBody] UpdateQuestRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        if (!await Can(id, JiraPermissions.Edit, ct)) return Forbid();
        try
        {
            var quest = await _questService.UpdateAsync(id, request, userId.Value, ct);
            return quest == null ? NotFound() : Ok(quest);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPut("{questId:guid}/notification-recipients")]
    public async Task<ActionResult> SetNotificationRecipients(Guid questId, [FromBody] UpdateQuestNotificationRecipientsRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        if (!await CanQuest(questId, BoardPermission.View, ct)) return Forbid();
        var status = await _collaborationService.SetRecipientsAsync(
            questId,
            userId.Value,
            request.UserIds,
            ct,
            externalRecipients: request.ExternalNotificationRecipients,
            checkWatcherPermission: true);
        return status switch { QuestAttachmentOperationStatus.Success => NoContent(), QuestAttachmentOperationStatus.NotFound => NotFound(), QuestAttachmentOperationStatus.Forbidden => Forbid(), _ => BadRequest() };
    }

    [HttpGet("{questId:guid}/comments")]
    public async Task<ActionResult<List<QuestCommentDto>>> GetComments(Guid questId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        if (!await CanQuest(questId, BoardPermission.View, ct)) return Forbid();
        var result = await _collaborationService.GetCommentsAsync(questId, userId.Value, ct);
        return result.Status switch { QuestAttachmentOperationStatus.Success => Ok(result.Comments), QuestAttachmentOperationStatus.NotFound => NotFound(), QuestAttachmentOperationStatus.Forbidden => Forbid(), _ => BadRequest() };
    }

    [HttpPost("{questId:guid}/comments")]
    public async Task<ActionResult<QuestCommentDto>> AddComment(Guid questId, [FromBody] CreateQuestCommentRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        if (!await Can(questId, JiraPermissions.AddComments, ct)) return Forbid();
        if (string.IsNullOrWhiteSpace(request.Text) || request.Text.Trim().Length > 5000) return BadRequest("Комментарий должен содержать от 1 до 5000 символов.");
        var result = await _collaborationService.AddCommentAsync(questId, userId.Value, request.Text, request.DocumentJson, ct, request.IsInternal);
        return result.Status switch { QuestAttachmentOperationStatus.Success => Ok(result.Comment), QuestAttachmentOperationStatus.NotFound => NotFound(), QuestAttachmentOperationStatus.Forbidden => Forbid(), _ => BadRequest() };
    }

    [HttpDelete("{questId:guid}/comments/{commentId:guid}")]
    public async Task<ActionResult> DeleteComment(Guid questId, Guid commentId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        if (!await CanQuest(questId, BoardPermission.View, ct)) return Forbid();
        var status = await _collaborationService.DeleteCommentAsync(questId, commentId, userId.Value, ct);
        return status switch { QuestAttachmentOperationStatus.Success => NoContent(), QuestAttachmentOperationStatus.NotFound => NotFound(), QuestAttachmentOperationStatus.Forbidden => Forbid(), _ => BadRequest() };
    }

    /// <summary>Перемещение квеста между колонками (drag-n-drop). При переносе в «Готово» начисляется XP.</summary>
    [HttpPost("move")]
    public async Task<ActionResult<QuestDto>> Move([FromBody] MoveQuestRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var current = await _permissions.FindQuestAsync(request.QuestId, ct);
        if (current == null) return NotFound();
        var permission = current.ColumnId == request.TargetColumnId ? JiraPermissions.Edit : JiraPermissions.Transition;
        if (!await Can(request.QuestId, permission, ct)) return Forbid();
        var quest = await _questService.MoveAsync(request, userId.Value, ct);
        return quest == null ? NotFound() : Ok(quest);
    }

    [HttpPost("board/{boardId:guid}/archive-completed")]
    public async Task<ActionResult<ArchiveCompletedQuestsResult>> ArchiveCompleted(Guid boardId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        if (!await CanBoard(boardId, BoardPermission.Manage, ct)) return Forbid();
        var result = await _questService.ArchiveCompletedAsync(boardId, userId.Value, ct);
        return result == null ? NotFound() : Ok(result);
    }

    [HttpPut("reorder")]
    public async Task<ActionResult> Reorder([FromBody] ReorderQuestsRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId(); if (!userId.HasValue) return Unauthorized();
        var boardId = await _permissions.BoardOfColumnAsync(request.ColumnId, ct);
        if (boardId == null) return NotFound();
        if (!await _permissions.HasAsync(boardId.Value, userId.Value, JiraPermissions.Edit, ct)) return Forbid();
        await _questService.ReorderAsync(request, ct);
        return NoContent();
    }

    [Audit("issue.delete", AuditTarget.Quest)]
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        if (await _permissions.FindQuestAsync(id, ct) == null) return NotFound();
        if (!await Can(id, JiraPermissions.Delete, ct)) return Forbid();

        var deleted = await _questService.DeleteAsync(id, ct);
        return deleted ? NoContent() : NotFound();
    }

}
