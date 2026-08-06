using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

public class QuestAttachmentService : IQuestAttachmentService
{
    private static readonly TimeSpan DownloadUrlLifetime = TimeSpan.FromMinutes(5);

    private readonly CanbanDbContext _db;
    private readonly IQuestAttachmentStorageService _storage;
    private readonly IQuestNotificationService _notifications;
    private readonly ILogger<QuestAttachmentService> _logger;

    public QuestAttachmentService(
        CanbanDbContext db,
        IQuestAttachmentStorageService storage,
        IQuestNotificationService notifications,
        ILogger<QuestAttachmentService> logger)
    {
        _db = db;
        _storage = storage;
        _notifications = notifications;
        _logger = logger;
    }

    public async Task<QuestAttachmentOperationStatus> CheckQuestAccessAsync(
        Guid questId,
        Guid userId,
        CancellationToken ct = default) =>
        (await GetAccessStatusAsync(questId, userId, ct)).Status;

    public async Task<QuestAttachmentOperationStatus> CheckColumnAccessAsync(
        Guid columnId,
        Guid userId,
        CancellationToken ct = default)
    {
        var teamId = await _db.Columns
            .AsNoTracking()
            .Where(c => c.Id == columnId)
            .Select(c => (Guid?)c.Board.TeamId)
            .FirstOrDefaultAsync(ct);
        if (!teamId.HasValue)
            return QuestAttachmentOperationStatus.NotFound;

        return await GetTeamAccessStatusAsync(teamId.Value, userId, ct);
    }

    public async Task<(QuestAttachmentOperationStatus Status, List<QuestAttachmentDto> Items)> GetByQuestAsync(
        Guid questId,
        Guid userId,
        CancellationToken ct = default)
    {
        var access = await GetAccessStatusAsync(questId, userId, ct);
        if (access.Status != QuestAttachmentOperationStatus.Success)
            return (access.Status, new List<QuestAttachmentDto>());

        var attachments = await _db.QuestAttachments
            .AsNoTracking()
            .Include(a => a.UploadedByUser)
            .Where(a => a.QuestId == questId)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync(ct);

        return (QuestAttachmentOperationStatus.Success, attachments.Select(Map).ToList());
    }

    public async Task<(QuestAttachmentOperationStatus Status, QuestAttachmentDto? Attachment)> UploadAsync(
        Guid questId,
        Guid userId,
        Stream data,
        string fileName,
        string contentType,
        long sizeBytes,
        CancellationToken ct = default)
    {
        var access = await GetAccessStatusAsync(questId, userId, ct);
        if (access.Status != QuestAttachmentOperationStatus.Success)
            return (access.Status, null);

        var safeFileName = NormalizeFileName(fileName);
        var safeContentType = NormalizeContentType(contentType);
        var storageKey = await _storage.UploadAsync(
            access.TeamId!.Value,
            questId,
            data,
            safeContentType,
            safeFileName,
            ct);
        if (string.IsNullOrEmpty(storageKey))
            return (QuestAttachmentOperationStatus.StorageError, null);

        var attachment = new QuestAttachment
        {
            Id = Guid.NewGuid(),
            QuestId = questId,
            UploadedByUserId = userId,
            FileName = safeFileName,
            ContentType = safeContentType,
            SizeBytes = sizeBytes,
            StorageKey = storageKey,
            CreatedAt = DateTime.UtcNow
        };

        try
        {
            _db.QuestAttachments.Add(attachment);
            await _db.SaveChangesAsync(ct);
            attachment.UploadedByUser = await _db.Users.FirstAsync(u => u.Id == userId, ct);
            await _notifications.NotifyAsync(questId, userId, "Добавлено вложение", safeFileName, ct);
            return (QuestAttachmentOperationStatus.Success, Map(attachment));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Не удалось сохранить метаданные вложения {StorageKey}", storageKey);
            _db.Entry(attachment).State = EntityState.Detached;
            await _storage.DeleteAsync(storageKey, CancellationToken.None);
            return (QuestAttachmentOperationStatus.StorageError, null);
        }
    }

    public async Task<(QuestAttachmentOperationStatus Status, QuestAttachmentDownloadDto? Download)> GetDownloadAsync(
        Guid questId,
        Guid attachmentId,
        Guid userId,
        CancellationToken ct = default)
    {
        var access = await GetAccessStatusAsync(questId, userId, ct);
        if (access.Status != QuestAttachmentOperationStatus.Success)
            return (access.Status, null);

        var attachment = await _db.QuestAttachments
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == attachmentId && a.QuestId == questId, ct);
        if (attachment == null)
            return (QuestAttachmentOperationStatus.NotFound, null);

        var url = _storage.CreateDownloadUrl(
            attachment.StorageKey,
            attachment.FileName,
            DownloadUrlLifetime);
        if (string.IsNullOrEmpty(url))
            return (QuestAttachmentOperationStatus.StorageError, null);

        return (
            QuestAttachmentOperationStatus.Success,
            new QuestAttachmentDownloadDto(url, DateTime.UtcNow.Add(DownloadUrlLifetime)));
    }

    public async Task<QuestAttachmentOperationStatus> DeleteAsync(
        Guid questId,
        Guid attachmentId,
        Guid userId,
        CancellationToken ct = default)
    {
        var access = await GetAccessStatusAsync(questId, userId, ct);
        if (access.Status != QuestAttachmentOperationStatus.Success)
            return access.Status;

        var attachment = await _db.QuestAttachments
            .FirstOrDefaultAsync(a => a.Id == attachmentId && a.QuestId == questId, ct);
        if (attachment == null)
            return QuestAttachmentOperationStatus.NotFound;

        if (!await _storage.DeleteAsync(attachment.StorageKey, ct))
            return QuestAttachmentOperationStatus.StorageError;

        _db.QuestAttachments.Remove(attachment);
        await _db.SaveChangesAsync(ct);
        await _notifications.NotifyAsync(questId, userId, "Удалено вложение", attachment.FileName, ct);
        return QuestAttachmentOperationStatus.Success;
    }

    public async Task DeleteFilesForQuestIdsAsync(
        IReadOnlyCollection<Guid> questIds,
        CancellationToken ct = default)
    {
        if (questIds.Count == 0)
            return;

        var attachments = await _db.QuestAttachments
            .AsNoTracking()
            .Where(a => questIds.Contains(a.QuestId))
            .ToListAsync(ct);

        foreach (var attachment in attachments)
        {
            if (!await _storage.DeleteAsync(attachment.StorageKey, ct))
                throw new InvalidOperationException(
                    $"Не удалось удалить вложение {attachment.Id} из S3.");
        }
    }

    private async Task<(QuestAttachmentOperationStatus Status, Guid? TeamId)> GetAccessStatusAsync(
        Guid questId,
        Guid userId,
        CancellationToken ct)
    {
        var quest = await _db.Quests
            .AsNoTracking()
            .Where(q => q.Id == questId)
            .Select(q => new { TeamId = q.Board.TeamId })
            .FirstOrDefaultAsync(ct);
        if (quest == null)
            return (QuestAttachmentOperationStatus.NotFound, null);

        var status = await GetTeamAccessStatusAsync(quest.TeamId, userId, ct);
        return (status, quest.TeamId);
    }

    private async Task<QuestAttachmentOperationStatus> GetTeamAccessStatusAsync(
        Guid teamId,
        Guid userId,
        CancellationToken ct)
    {
        var isMember = await _db.TeamMembers
            .AsNoTracking()
            .AnyAsync(m => m.TeamId == teamId && m.UserId == userId, ct);
        if (!isMember)
        {
            var isOwner = await _db.Teams
                .AsNoTracking()
                .AnyAsync(t => t.Id == teamId && t.OwnerId == userId, ct);
            if (!isOwner)
                return QuestAttachmentOperationStatus.Forbidden;
        }

        return QuestAttachmentOperationStatus.Success;
    }

    private static QuestAttachmentDto Map(QuestAttachment attachment) => new(
        attachment.Id,
        attachment.QuestId,
        attachment.FileName,
        attachment.ContentType,
        attachment.SizeBytes,
        attachment.UploadedByUserId,
        attachment.UploadedByUser?.DisplayName ?? string.Empty,
        attachment.CreatedAt);

    private static string NormalizeFileName(string fileName)
    {
        var normalizedPath = (fileName ?? string.Empty).Replace('\\', '/');
        var name = Path.GetFileName(normalizedPath).Trim();
        name = new string(name.Where(c => !char.IsControl(c)).ToArray());
        if (string.IsNullOrWhiteSpace(name))
            name = "attachment";
        return name.Length <= 255 ? name : name[..255];
    }

    private static string NormalizeContentType(string contentType)
    {
        var value = new string((contentType ?? string.Empty)
            .Where(c => !char.IsControl(c))
            .ToArray())
            .Trim();
        if (string.IsNullOrWhiteSpace(value))
            return "application/octet-stream";
        return value.Length <= 255 ? value : value[..255];
    }
}
