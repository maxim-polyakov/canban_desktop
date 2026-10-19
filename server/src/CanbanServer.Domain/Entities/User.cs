namespace CanbanServer.Domain.Entities;

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    /// <summary>Хэш пароля. Null для пользователей, вошедших только через Google (пароль не предоставляется).</summary>
    public string? PasswordHash { get; set; }
    public DateTime CreatedAt { get; set; }
    /// <summary>Подтверждён ли email (иначе вход запрещён).</summary>
    public bool EmailConfirmed { get; set; }
    public string? EmailConfirmationToken { get; set; }
    public DateTime? EmailConfirmationTokenExpiresAt { get; set; }
    /// <summary>Код сброса пароля (6 цифр). Действует 15 минут.</summary>
    public string? PasswordResetToken { get; set; }
    public DateTime? PasswordResetTokenExpiresAt { get; set; }

    /// <summary>Master switch for issue activity emails (in-app notifications are always kept).</summary>
    public bool EmailNotificationsEnabled { get; set; } = true;
    public bool EmailWhenAssignee { get; set; } = true;
    public bool EmailWhenReporter { get; set; } = true;
    /// <summary>Jira default: no emails about your own changes.</summary>
    public bool EmailOwnChanges { get; set; }
    /// <summary>"html" or "text".</summary>
    public string EmailFormat { get; set; } = "html";
    /// <summary>Start watching issues you comment on, edit or move.</summary>
    public bool AutoWatch { get; set; } = true;

    public Character Character { get; set; } = null!;
    public ICollection<TeamMember> TeamMemberships { get; set; } = new List<TeamMember>();
    public ICollection<Quest> AssignedQuests { get; set; } = new List<Quest>();
    public ICollection<QuestAssignee> QuestAssignments { get; set; } = new List<QuestAssignee>();
    public ICollection<QuestReview> ReviewsGiven { get; set; } = new List<QuestReview>();
    public ICollection<UserAchievement> Achievements { get; set; } = new List<UserAchievement>();
    public ICollection<SkillUnlock> SkillUnlocks { get; set; } = new List<SkillUnlock>();
}
