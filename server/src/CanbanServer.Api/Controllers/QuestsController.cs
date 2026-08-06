using Microsoft.AspNetCore.Mvc;
using CanbanServer.Api.Extensions;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;

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

    public QuestsController(
        IQuestService questService,
        IQuestAttachmentService attachmentService,
        IQuestCollaborationService collaborationService)
    {
        _questService = questService;
        _attachmentService = attachmentService;
        _collaborationService = collaborationService;
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<QuestDto>> Get(Guid id, CancellationToken ct)
    {
        var quest = await _questService.GetByIdAsync(id, ct);
        return quest == null ? NotFound() : Ok(quest);
    }

    [HttpGet("column/{columnId:guid}")]
    public async Task<ActionResult<List<QuestDto>>> GetByColumn(Guid columnId, CancellationToken ct)
    {
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
        var list = await _questService.GetArchivedByBoardIdAsync(boardId, ct);
        return Ok(list);
    }

    [HttpPost]
    public async Task<ActionResult<QuestDto>> Create([FromBody] CreateQuestRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var quest = await _questService.CreateAsync(request, userId.Value, ct);
        return CreatedAtAction(nameof(Get), new { id = quest.Id }, quest);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<QuestDto>> Update(Guid id, [FromBody] UpdateQuestRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var quest = await _questService.UpdateAsync(id, request, userId.Value, ct);
        return quest == null ? NotFound() : Ok(quest);
    }

    [HttpPut("{questId:guid}/notification-recipients")]
    public async Task<ActionResult> SetNotificationRecipients(Guid questId, [FromBody] UpdateQuestNotificationRecipientsRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var status = await _collaborationService.SetRecipientsAsync(questId, userId.Value, request.UserIds, ct);
        return status switch { QuestAttachmentOperationStatus.Success => NoContent(), QuestAttachmentOperationStatus.NotFound => NotFound(), QuestAttachmentOperationStatus.Forbidden => Forbid(), _ => BadRequest() };
    }

    [HttpGet("{questId:guid}/comments")]
    public async Task<ActionResult<List<QuestCommentDto>>> GetComments(Guid questId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var result = await _collaborationService.GetCommentsAsync(questId, userId.Value, ct);
        return result.Status switch { QuestAttachmentOperationStatus.Success => Ok(result.Comments), QuestAttachmentOperationStatus.NotFound => NotFound(), QuestAttachmentOperationStatus.Forbidden => Forbid(), _ => BadRequest() };
    }

    [HttpPost("{questId:guid}/comments")]
    public async Task<ActionResult<QuestCommentDto>> AddComment(Guid questId, [FromBody] CreateQuestCommentRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Text) || request.Text.Trim().Length > 5000) return BadRequest("Комментарий должен содержать от 1 до 5000 символов.");
        var result = await _collaborationService.AddCommentAsync(questId, userId.Value, request.Text, ct);
        return result.Status switch { QuestAttachmentOperationStatus.Success => Ok(result.Comment), QuestAttachmentOperationStatus.NotFound => NotFound(), QuestAttachmentOperationStatus.Forbidden => Forbid(), _ => BadRequest() };
    }

    [HttpDelete("{questId:guid}/comments/{commentId:guid}")]
    public async Task<ActionResult> DeleteComment(Guid questId, Guid commentId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var status = await _collaborationService.DeleteCommentAsync(questId, commentId, userId.Value, ct);
        return status switch { QuestAttachmentOperationStatus.Success => NoContent(), QuestAttachmentOperationStatus.NotFound => NotFound(), QuestAttachmentOperationStatus.Forbidden => Forbid(), _ => BadRequest() };
    }

    /// <summary>Перемещение квеста между колонками (drag-n-drop). При переносе в «Готово» начисляется XP.</summary>
    [HttpPost("move")]
    public async Task<ActionResult<QuestDto>> Move([FromBody] MoveQuestRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var quest = await _questService.MoveAsync(request, userId.Value, ct);
        return quest == null ? NotFound() : Ok(quest);
    }

    [HttpPost("board/{boardId:guid}/archive-completed")]
    public async Task<ActionResult<ArchiveCompletedQuestsResult>> ArchiveCompleted(Guid boardId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var result = await _questService.ArchiveCompletedAsync(boardId, userId.Value, ct);
        return result == null ? NotFound() : Ok(result);
    }

    [HttpPut("reorder")]
    public async Task<ActionResult> Reorder([FromBody] ReorderQuestsRequest request, CancellationToken ct)
    {
        await _questService.ReorderAsync(request, ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!userId.HasValue) return Unauthorized();
        var access = await _attachmentService.CheckQuestAccessAsync(id, userId.Value, ct);
        if (access == QuestAttachmentOperationStatus.NotFound) return NotFound();
        if (access == QuestAttachmentOperationStatus.Forbidden) return Forbid();

        var deleted = await _questService.DeleteAsync(id, ct);
        return deleted ? NoContent() : NotFound();
    }

}
