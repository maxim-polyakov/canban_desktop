namespace CanbanServer.Domain.Entities;

/// <summary>
/// Персонаж пользователя: накапливает опыт, уровень, открывает навыки.
/// </summary>
public class Character
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    /// <summary>Накопленный опыт (сумма всех начислений).</summary>
    public int TotalXp { get; set; }
    public int LevelId { get; set; }
    public DateTime UpdatedAt { get; set; }

    public User User { get; set; } = null!;
    public Level Level { get; set; } = null!;
    public ICollection<XpTransaction> XpTransactions { get; set; } = new List<XpTransaction>();
}
