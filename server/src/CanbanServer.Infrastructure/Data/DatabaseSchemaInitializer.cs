using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static class DatabaseSchemaInitializer
{
    public static async Task EnsureQuestAttachmentsSchemaAsync(
        CanbanDbContext db,
        CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "QuestAttachments" (
                "Id" uuid NOT NULL,
                "QuestId" uuid NOT NULL,
                "UploadedByUserId" uuid NOT NULL,
                "FileName" character varying(255) NOT NULL,
                "ContentType" character varying(255) NOT NULL,
                "SizeBytes" bigint NOT NULL,
                "StorageKey" character varying(1024) NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_QuestAttachments" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_QuestAttachments_Quests_QuestId"
                    FOREIGN KEY ("QuestId") REFERENCES "Quests" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_QuestAttachments_Users_UploadedByUserId"
                    FOREIGN KEY ("UploadedByUserId") REFERENCES "Users" ("Id") ON DELETE RESTRICT
            );
            """,
            ct);

        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_QuestAttachments_StorageKey"
                ON "QuestAttachments" ("StorageKey");
            """,
            ct);

        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE INDEX IF NOT EXISTS "IX_QuestAttachments_QuestId_CreatedAt"
                ON "QuestAttachments" ("QuestId", "CreatedAt");
            """,
            ct);

        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE INDEX IF NOT EXISTS "IX_QuestAttachments_UploadedByUserId"
                ON "QuestAttachments" ("UploadedByUserId");
            """,
            ct);
    }
}
