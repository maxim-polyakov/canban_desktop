using Microsoft.EntityFrameworkCore;
using CanbanServer.Application.Contracts;
using CanbanServer.Application.DTOs;
using CanbanServer.Infrastructure.Data;

namespace CanbanServer.Infrastructure.Services;

public class CharacterService : ICharacterService
{
    private readonly CanbanDbContext _db;

    public CharacterService(CanbanDbContext db) => _db = db;

    public async Task<CharacterDto?> GetByUserIdAsync(Guid userId, CancellationToken ct = default)
    {
        var c = await _db.Characters.Include(x => x.Level).FirstOrDefaultAsync(x => x.UserId == userId, ct);
        return c == null ? null : new CharacterDto(c.Id, c.UserId, c.Name, c.TotalXp, c.Level.LevelNumber, c.Level.Title, c.Level.BadgeUrl, c.UpdatedAt);
    }

    public async Task<List<LevelDto>> GetAllLevelsAsync(CancellationToken ct = default)
    {
        var list = await _db.Levels.OrderBy(l => l.LevelNumber).ToListAsync(ct);
        return list.Select(l => new LevelDto(l.Id, l.LevelNumber, l.XpRequired, l.Title, l.BadgeUrl)).ToList();
    }

    public async Task<List<XpTransactionDto>> GetXpHistoryAsync(Guid userId, int limit = 50, CancellationToken ct = default)
    {
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.UserId == userId, ct);
        if (character == null) return new List<XpTransactionDto>();
        var list = await _db.XpTransactions
            .Where(x => x.CharacterId == character.Id)
            .OrderByDescending(x => x.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);
        return list.Select(x => new XpTransactionDto(x.Id, x.Amount, x.Source.ToString(), x.Description, x.CreatedAt)).ToList();
    }
}
