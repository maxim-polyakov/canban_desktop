using CanbanServer.Application.Contracts;
using CanbanServer.Domain.Entities;
using CanbanServer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Services;

public record IssueVoterDto(Guid UserId, string DisplayName, string? AvatarUrl, DateTime VotedAt);

/// <summary>Voters is null when the caller may not see who voted.</summary>
public record IssueVotesDto(int Votes, bool HasVoted, bool CanVote, string? BlockedReason, List<IssueVoterDto>? Voters);

/// <summary>
/// Votes like in Jira: anyone who can see an issue may vote once, except its reporter;
/// votes on resolved issues are frozen; the voter list is visible to people who work in the space.
/// </summary>
public class IssueVoteService
{
    public const string ResolvedReason = "Нельзя голосовать за решённую задачу и менять голос в ней";
    public const string ReporterReason = "Нельзя голосовать за задачу, которую вы создали";

    private readonly CanbanDbContext _db;
    private readonly IProjectAccessService _access;
    private readonly PermissionSchemeService _permissions;

    public IssueVoteService(CanbanDbContext db, IProjectAccessService access, PermissionSchemeService permissions)
    {
        _db = db;
        _access = access;
        _permissions = permissions;
    }

    public async Task<IssueVotesDto> GetAsync(Guid questId, Guid userId, CancellationToken ct)
    {
        var (quest, canSeeVoters) = await LoadAsync(questId, userId, ct);
        return await BuildAsync(quest, userId, canSeeVoters, ct);
    }

    public async Task<IssueVotesDto> SetAsync(Guid questId, Guid userId, bool vote, CancellationToken ct)
    {
        var (quest, canSeeVoters) = await LoadAsync(questId, userId, ct);
        var blocked = BlockedReason(quest, userId);
        if (blocked != null) throw new InvalidOperationException(blocked);
        var existing = await _db.QuestVotes.FirstOrDefaultAsync(v => v.QuestId == questId && v.UserId == userId, ct);
        if (vote && existing == null)
        {
            _db.QuestVotes.Add(new QuestVote { Id = Guid.NewGuid(), QuestId = questId, UserId = userId, CreatedAt = DateTime.UtcNow });
            try { await _db.SaveChangesAsync(ct); }
            catch (DbUpdateException)
            {
                _db.ChangeTracker.Clear();
                if (!await _db.QuestVotes.AsNoTracking().AnyAsync(v => v.QuestId == questId && v.UserId == userId, ct)) throw;
            }
        }
        else if (!vote && existing != null)
        {
            _db.QuestVotes.Remove(existing);
            await _db.SaveChangesAsync(ct);
        }
        return await BuildAsync(quest, userId, canSeeVoters, ct);
    }

    public static string? BlockedReason(Quest quest, Guid userId)
    {
        if (quest.CompletedAt != null || quest.Column?.Kind is ColumnKind.Done or ColumnKind.Archive) return ResolvedReason;
        if (quest.ReporterId == userId) return ReporterReason;
        return null;
    }

    private async Task<(Quest Quest, bool CanSeeVoters)> LoadAsync(Guid questId, Guid userId, CancellationToken ct)
    {
        await _access.EnsureQuestPermissionAsync(questId, userId, BoardPermission.View, ct);
        var canSeeVoters = await _permissions.HasOnQuestAsync(questId, userId, JiraPermissions.ViewVoters, ct);
        var quest = await _db.Quests.AsNoTracking().Include(q => q.Column).FirstOrDefaultAsync(q => q.Id == questId, ct)
            ?? throw new KeyNotFoundException("Quest not found");
        return (quest, canSeeVoters);
    }

    private async Task<IssueVotesDto> BuildAsync(Quest quest, Guid userId, bool canSeeVoters, CancellationToken ct)
    {
        var voters = await _db.QuestVotes.AsNoTracking().Where(v => v.QuestId == quest.Id)
            .OrderBy(v => v.CreatedAt)
            .Select(v => new IssueVoterDto(v.UserId, v.User.DisplayName, v.User.AvatarUrl, v.CreatedAt))
            .ToListAsync(ct);
        var blocked = BlockedReason(quest, userId);
        return new IssueVotesDto(voters.Count, voters.Any(v => v.UserId == userId), blocked == null, blocked,
            canSeeVoters ? voters : null);
    }
}
