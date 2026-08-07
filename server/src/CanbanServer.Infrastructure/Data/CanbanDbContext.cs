using Microsoft.EntityFrameworkCore;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Infrastructure.Data;

public class CanbanDbContext : DbContext
{
    public CanbanDbContext(DbContextOptions<CanbanDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Character> Characters => Set<Character>();
    public DbSet<Level> Levels => Set<Level>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<TeamMember> TeamMembers => Set<TeamMember>();
    public DbSet<TeamInvite> TeamInvites => Set<TeamInvite>();
    public DbSet<Board> Boards => Set<Board>();
    public DbSet<Column> Columns => Set<Column>();
    public DbSet<Quest> Quests => Set<Quest>();
    public DbSet<QuestAssignee> QuestAssignees => Set<QuestAssignee>();
    public DbSet<QuestAttachment> QuestAttachments => Set<QuestAttachment>();
    public DbSet<QuestNotificationRecipient> QuestNotificationRecipients => Set<QuestNotificationRecipient>();
    public DbSet<QuestComment> QuestComments => Set<QuestComment>();
    public DbSet<QuestReview> QuestReviews => Set<QuestReview>();
    public DbSet<XpTransaction> XpTransactions => Set<XpTransaction>();
    public DbSet<Achievement> Achievements => Set<Achievement>();
    public DbSet<UserAchievement> UserAchievements => Set<UserAchievement>();
    public DbSet<Skill> Skills => Set<Skill>();
    public DbSet<SkillUnlock> SkillUnlocks => Set<SkillUnlock>();
    public DbSet<Activity> Activities => Set<Activity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CanbanDbContext).Assembly);
    }
}
