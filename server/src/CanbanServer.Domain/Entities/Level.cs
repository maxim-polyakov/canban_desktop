namespace CanbanServer.Domain.Entities;

/// <summary>
/// Уровень персонажа. XpRequired — кумулятивный порог (для 5 уровня — сумма XP за 1–5).
/// </summary>
public class Level
{
    public int Id { get; set; }
    public int LevelNumber { get; set; }
    /// <summary>Кумулятивный порог XP для достижения этого уровня.</summary>
    public int XpRequired { get; set; }
    public string? Title { get; set; }
    public string? BadgeUrl { get; set; }

    public ICollection<Character> Characters { get; set; } = new List<Character>();
}
