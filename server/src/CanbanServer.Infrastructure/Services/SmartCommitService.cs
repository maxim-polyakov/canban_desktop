using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CanbanServer.Infrastructure.Services;

public sealed class SmartCommitService : ISmartCommitService
{
    private static readonly Dictionary<string, ColumnKind> KindAliases = new()
    {
        ["done"] = ColumnKind.Done, ["close"] = ColumnKind.Done, ["closed"] = ColumnKind.Done,
        ["resolve"] = ColumnKind.Done, ["resolved"] = ColumnKind.Done, ["fixed"] = ColumnKind.Done,
        ["start"] = ColumnKind.InProgress, ["start-progress"] = ColumnKind.InProgress, ["in-progress"] = ColumnKind.InProgress,
        ["review"] = ColumnKind.Review, ["in-review"] = ColumnKind.Review,
        ["todo"] = ColumnKind.Backlog, ["to-do"] = ColumnKind.Backlog, ["backlog"] = ColumnKind.Backlog, ["reopen"] = ColumnKind.Backlog,
    };

    private readonly CanbanDbContext _db;
    private readonly IProjectAccessService _access;
    private readonly IQuestService _quests;
    private readonly IQuestCollaborationService _collaboration;
    private readonly IJiraPlatformService _jira;
    private readonly ILogger<SmartCommitService> _logger;

    public SmartCommitService(CanbanDbContext db, IProjectAccessService access, IQuestService quests,
        IQuestCollaborationService collaboration, IJiraPlatformService jira, ILogger<SmartCommitService> logger)
    {
        _db = db;
        _access = access;
        _quests = quests;
        _collaboration = collaboration;
        _jira = jira;
        _logger = logger;
    }

    public async Task ExecuteAsync(IReadOnlyList<SmartCommitRequest> commits, CancellationToken ct)
    {
        foreach (var commit in commits)
        {
            var commands = GitHubEventParser.ParseSmartCommands(commit.Message);
            if (commands.Count == 0 || string.IsNullOrWhiteSpace(commit.AuthorEmail)) continue;
            var email = commit.AuthorEmail.Trim().ToLowerInvariant();
            var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email.ToLower() == email, ct);
            var quest = await _db.Quests.AsNoTracking().FirstOrDefaultAsync(q => q.Id == commit.QuestId, ct);
            if (user == null || quest == null) continue;
            var (_, permission) = await _access.GetBoardAccessAsync(quest.BoardId, user.Id, ct);
            if (permission is not { } level || level < BoardPermission.Work) continue;

            foreach (var command in commands)
            {
                try
                {
                    await RunAsync(quest, user.Id, command, ct);
                }
                catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or UnauthorizedAccessException)
                {
                    _logger.LogWarning("Smart commit #{Command} on {IssueKey} skipped: {Reason}", command.Name, quest.IssueKey, ex.Message);
                }
            }
        }
    }

    private async Task RunAsync(Quest quest, Guid userId, SmartCommitCommand command, CancellationToken ct)
    {
        switch (command.Name)
        {
            case "comment":
                if (command.Arguments.Length > 0)
                    await _collaboration.AddCommentAsync(quest.Id, userId, command.Arguments, null, ct);
                return;
            case "time":
                var (minutes, note) = GitHubEventParser.ParseDuration(command.Arguments);
                if (minutes > 0)
                    await _jira.SaveWorkLogAsync(quest.Id, userId, null,
                        new UpsertWorkLogRequest(minutes, DateTime.UtcNow, note.Length > 0 ? note : null), ct);
                return;
        }

        var columns = await _db.Columns.AsNoTracking().Where(c => c.BoardId == quest.BoardId && c.Kind != ColumnKind.Archive)
            .OrderBy(c => c.Order).ToListAsync(ct);
        var target = columns.FirstOrDefault(c => Slug(c.Title) == command.Name)
            ?? (KindAliases.TryGetValue(command.Name, out var kind) ? columns.FirstOrDefault(c => c.Kind == kind) : null);
        if (target == null || target.Id == quest.ColumnId) return;
        await _quests.MoveAsync(new MoveQuestRequest(quest.Id, target.Id, 0), userId, ct);
    }

    public static string Slug(string title) =>
        string.Join('-', title.Trim().ToLowerInvariant().Split(new[] { ' ', '_', '\t' }, StringSplitOptions.RemoveEmptyEntries));
}
