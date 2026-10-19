using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Application.Contracts;

public interface IJiraPlatformService
{
    Task ValidateTransitionAsync(Quest quest, Guid targetColumnId, BoardPermission permission, CancellationToken ct);
    Task AddChangeAsync(Guid questId, Guid? userId, string changeType, string? field, string? oldValue, string? newValue, CancellationToken ct);
    Task EnqueueAsync(string type, object payload, CancellationToken ct);

    Task<List<WorkflowTransitionDto>> GetTransitionsAsync(Guid boardId, CancellationToken ct);
    Task<WorkflowTransitionDto> SaveTransitionAsync(Guid boardId, Guid? id, UpsertWorkflowTransitionRequest request, CancellationToken ct);
    Task<bool> DeleteTransitionAsync(Guid boardId, Guid id, CancellationToken ct);
    Task<List<QuestLinkDto>> GetLinksAsync(Guid questId, CancellationToken ct);
    Task<QuestLinkDto> AddLinkAsync(Guid questId, Guid userId, CreateQuestLinkRequest request, CancellationToken ct);
    Task<bool> DeleteLinkAsync(Guid questId, Guid id, CancellationToken ct);
    Task<List<BoardComponentDto>> GetComponentsAsync(Guid boardId, CancellationToken ct);
    Task<BoardComponentDto> SaveComponentAsync(Guid boardId, Guid? id, UpsertBoardComponentRequest request, CancellationToken ct);
    Task<List<BoardReleaseDto>> GetReleasesAsync(Guid boardId, CancellationToken ct);
    Task<BoardReleaseDto> SaveReleaseAsync(Guid boardId, Guid? id, UpsertBoardReleaseRequest request, CancellationToken ct);
    Task<List<WorkLogDto>> GetWorkLogsAsync(Guid questId, CancellationToken ct);
    Task<WorkLogDto> SaveWorkLogAsync(Guid questId, Guid userId, Guid? id, UpsertWorkLogRequest request, CancellationToken ct);
    Task<bool> DeleteWorkLogAsync(Guid questId, Guid id, Guid userId, bool canManage, CancellationToken ct);
    Task<List<QuestChangeDto>> GetHistoryAsync(Guid questId, CancellationToken ct);
    Task<List<AppNotificationDto>> GetNotificationsAsync(Guid userId, bool unreadOnly, CancellationToken ct);
    Task<bool> MarkNotificationReadAsync(Guid id, Guid userId, CancellationToken ct);
    Task<List<SavedFilterDto>> GetFiltersAsync(Guid userId, CancellationToken ct);
    Task<SavedFilterDto> SaveFilterAsync(Guid userId, Guid? id, UpsertSavedFilterRequest request, CancellationToken ct);
    Task<bool> DeleteFilterAsync(Guid userId, Guid id, CancellationToken ct);
    Task<BulkEditResult> BulkEditAsync(Guid boardId, Guid userId, BulkEditQuestsRequest request, CancellationToken ct);
    Task<QuestDto> CloneQuestAsync(Guid questId, Guid userId, CloneQuestRequest request, CancellationToken ct);
    Task<BoardDto> CloneBoardAsync(Guid boardId, Guid userId, CloneBoardRequest request, CancellationToken ct);
    ImportPreviewResult PreviewImport(ImportPreviewRequest request);
    Task<ImportExecuteResult> ExecuteImportAsync(Guid userId, ImportExecuteRequest request, CancellationToken ct);
    Task<string> ExportAsync(Guid boardId, string format, CancellationToken ct);
    Task<object> GetReportAsync(Guid boardId, string kind, Guid? releaseId, CancellationToken ct);
    Task<List<DashboardDto>> GetDashboardsAsync(Guid userId, CancellationToken ct);
    Task<DashboardDto> SaveDashboardAsync(Guid userId, Guid? id, UpsertDashboardRequest request, CancellationToken ct);
    Task<List<AutomationRuleDto>> GetAutomationRulesAsync(Guid boardId, CancellationToken ct);
    Task<AutomationRuleDto> SaveAutomationRuleAsync(Guid boardId, Guid? id, UpsertAutomationRuleRequest request, CancellationToken ct);
    Task<List<OutboundWebhookDto>> GetWebhooksAsync(Guid boardId, CancellationToken ct);
    Task<OutboundWebhookDto> SaveWebhookAsync(Guid boardId, Guid? id, UpsertOutboundWebhookRequest request, CancellationToken ct);
    Task<List<GitHubIntegrationDto>> GetGitHubIntegrationsAsync(Guid boardId, CancellationToken ct);
    Task<GitHubIntegrationDto> SaveGitHubIntegrationAsync(Guid boardId, Guid? id, UpsertGitHubIntegrationRequest request, CancellationToken ct);
    Task ProcessGitHubWebhookAsync(string eventName, string payload, string signature, CancellationToken ct);
}
