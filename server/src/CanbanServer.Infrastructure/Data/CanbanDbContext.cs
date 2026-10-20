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
    public DbSet<Sprint> Sprints => Set<Sprint>();
    public DbSet<Quest> Quests => Set<Quest>();
    public DbSet<QuestAssignee> QuestAssignees => Set<QuestAssignee>();
    public DbSet<QuestAttachment> QuestAttachments => Set<QuestAttachment>();
    public DbSet<QuestNotificationRecipient> QuestNotificationRecipients => Set<QuestNotificationRecipient>();
    public DbSet<QuestExternalNotificationRecipient> QuestExternalNotificationRecipients => Set<QuestExternalNotificationRecipient>();
    public DbSet<QuestComment> QuestComments => Set<QuestComment>();
    public DbSet<QuestReview> QuestReviews => Set<QuestReview>();
    public DbSet<XpTransaction> XpTransactions => Set<XpTransaction>();
    public DbSet<Achievement> Achievements => Set<Achievement>();
    public DbSet<UserAchievement> UserAchievements => Set<UserAchievement>();
    public DbSet<Skill> Skills => Set<Skill>();
    public DbSet<SkillUnlock> SkillUnlocks => Set<SkillUnlock>();
    public DbSet<Activity> Activities => Set<Activity>();
    public DbSet<WorkflowTransition> WorkflowTransitions => Set<WorkflowTransition>();
    public DbSet<QuestLink> QuestLinks => Set<QuestLink>();
    public DbSet<BoardComponent> BoardComponents => Set<BoardComponent>();
    public DbSet<BoardRelease> BoardReleases => Set<BoardRelease>();
    public DbSet<QuestComponent> QuestComponents => Set<QuestComponent>();
    public DbSet<QuestRelease> QuestReleases => Set<QuestRelease>();
    public DbSet<WorkLog> WorkLogs => Set<WorkLog>();
    public DbSet<QuestChange> QuestChanges => Set<QuestChange>();
    public DbSet<AppNotification> AppNotifications => Set<AppNotification>();
    public DbSet<SavedFilter> SavedFilters => Set<SavedFilter>();
    public DbSet<Kudos> Kudos => Set<Kudos>();
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();
    public DbSet<AutomationRule> AutomationRules => Set<AutomationRule>();
    public DbSet<OutboundWebhook> OutboundWebhooks => Set<OutboundWebhook>();
    public DbSet<WebhookDelivery> WebhookDeliveries => Set<WebhookDelivery>();
    public DbSet<GitHubIntegration> GitHubIntegrations => Set<GitHubIntegration>();
    public DbSet<DevelopmentLink> DevelopmentLinks => Set<DevelopmentLink>();
    public DbSet<Dashboard> Dashboards => Set<Dashboard>();
    public DbSet<DashboardStar> DashboardStars => Set<DashboardStar>();
    public DbSet<SpaceDocument> SpaceDocuments => Set<SpaceDocument>();
    public DbSet<SpaceForm> SpaceForms => Set<SpaceForm>();
    public DbSet<AssetSchema> AssetSchemas => Set<AssetSchema>();
    public DbSet<AssetObjectType> AssetObjectTypes => Set<AssetObjectType>();
    public DbSet<AssetAttribute> AssetAttributes => Set<AssetAttribute>();
    public DbSet<AssetObject> AssetObjects => Set<AssetObject>();
    public DbSet<AssetAttributeValue> AssetAttributeValues => Set<AssetAttributeValue>();
    public DbSet<AssetQuestLink> AssetQuestLinks => Set<AssetQuestLink>();
    public DbSet<AssetObjectChange> AssetObjectChanges => Set<AssetObjectChange>();
    public DbSet<Plan> Plans => Set<Plan>();
    public DbSet<PlanSource> PlanSources => Set<PlanSource>();
    public DbSet<PlanTeam> PlanTeams => Set<PlanTeam>();
    public DbSet<PlanScenario> PlanScenarios => Set<PlanScenario>();
    public DbSet<PlanScheduleItem> PlanScheduleItems => Set<PlanScheduleItem>();
    public DbSet<PlanExclusion> PlanExclusions => Set<PlanExclusion>();
    public DbSet<HomeItem> HomeItems => Set<HomeItem>();
    public DbSet<HomeItemMember> HomeItemMembers => Set<HomeItemMember>();
    public DbSet<HomeItemLink> HomeItemLinks => Set<HomeItemLink>();
    public DbSet<HomeItemWork> HomeItemWorks => Set<HomeItemWork>();
    public DbSet<HomeStatusUpdate> HomeStatusUpdates => Set<HomeStatusUpdate>();
    public DbSet<HomeEntry> HomeEntries => Set<HomeEntry>();
    public DbSet<BillingSubscription> BillingSubscriptions => Set<BillingSubscription>();
    public DbSet<BillingPlanChange> BillingPlanChanges => Set<BillingPlanChange>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CanbanDbContext).Assembly);
    }
}
