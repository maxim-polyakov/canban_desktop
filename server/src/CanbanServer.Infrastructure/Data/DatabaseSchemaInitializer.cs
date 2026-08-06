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

        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "QuestNotificationRecipients" (
                "Id" uuid NOT NULL,
                "QuestId" uuid NOT NULL,
                "UserId" uuid NOT NULL,
                CONSTRAINT "PK_QuestNotificationRecipients" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_QuestNotificationRecipients_Quests_QuestId"
                    FOREIGN KEY ("QuestId") REFERENCES "Quests" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_QuestNotificationRecipients_Users_UserId"
                    FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_QuestNotificationRecipients_QuestId_UserId"
                ON "QuestNotificationRecipients" ("QuestId", "UserId");
            CREATE INDEX IF NOT EXISTS "IX_QuestNotificationRecipients_UserId"
                ON "QuestNotificationRecipients" ("UserId");
            """,
            ct);

        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "QuestComments" (
                "Id" uuid NOT NULL,
                "QuestId" uuid NOT NULL,
                "AuthorUserId" uuid NOT NULL,
                "Text" character varying(5000) NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_QuestComments" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_QuestComments_Quests_QuestId"
                    FOREIGN KEY ("QuestId") REFERENCES "Quests" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_QuestComments_Users_AuthorUserId"
                    FOREIGN KEY ("AuthorUserId") REFERENCES "Users" ("Id") ON DELETE RESTRICT
            );
            CREATE INDEX IF NOT EXISTS "IX_QuestComments_QuestId_CreatedAt"
                ON "QuestComments" ("QuestId", "CreatedAt");
            CREATE INDEX IF NOT EXISTS "IX_QuestComments_AuthorUserId"
                ON "QuestComments" ("AuthorUserId");
            """,
            ct);
    }
}
