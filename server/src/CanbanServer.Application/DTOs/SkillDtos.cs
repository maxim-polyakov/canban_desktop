namespace CanbanServer.Application.DTOs;

public record SkillDto(Guid Id, string Key, string Name, string? Description, string? HowToUnlock, string? IconUrl, Guid? ParentSkillId, int TreeOrder, int PositionX, int PositionY, bool Unlocked);
public record SkillTreeDto(List<SkillDto> Skills, List<SkillNodeConnection> Connections);
public record SkillNodeConnection(Guid FromSkillId, Guid ToSkillId);
public record SkillUnlockDto(Guid SkillId, string Name, DateTime UnlockedAt);
