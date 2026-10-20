using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsureVotesSchemaAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "QuestVotes" (
              "Id" uuid NOT NULL,
              "QuestId" uuid NOT NULL,
              "UserId" uuid NOT NULL,
              "CreatedAt" timestamp with time zone NOT NULL DEFAULT now(),
              CONSTRAINT "PK_QuestVotes" PRIMARY KEY ("Id"),
              CONSTRAINT "FK_QuestVotes_Quests_QuestId" FOREIGN KEY ("QuestId") REFERENCES "Quests" ("Id") ON DELETE CASCADE,
              CONSTRAINT "FK_QuestVotes_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_QuestVotes_QuestId_UserId" ON "QuestVotes" ("QuestId", "UserId");
            CREATE INDEX IF NOT EXISTS "IX_QuestVotes_UserId" ON "QuestVotes" ("UserId");
            """, ct);
    }
}
