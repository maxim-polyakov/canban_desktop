using Microsoft.EntityFrameworkCore;
using CanbanServer.Domain.Entities;

namespace CanbanServer.Infrastructure.Data;

public static class SeedData
{
    public static async Task EnsureLevelsAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        if (await db.Levels.AnyAsync(ct)) return;
        var levels = new List<Level>();
        var xp = 0;
        for (var i = 1; i <= 50; i++)
        {
            xp += 100 * i;
            levels.Add(new Level { Id = i, LevelNumber = i, XpRequired = xp, Title = $"Уровень {i}" });
        }
        db.Levels.AddRange(levels);
        await db.SaveChangesAsync(ct);
    }
}
