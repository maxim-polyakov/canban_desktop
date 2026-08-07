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
            CREATE TABLE IF NOT EXISTS "QuestAssignees" (
                "Id" uuid NOT NULL,
                "QuestId" uuid NOT NULL,
                "UserId" uuid NOT NULL,
                "Order" integer NOT NULL,
                CONSTRAINT "PK_QuestAssignees" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_QuestAssignees_Quests_QuestId"
                    FOREIGN KEY ("QuestId") REFERENCES "Quests" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_QuestAssignees_Users_UserId"
                    FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_QuestAssignees_QuestId_UserId"
                ON "QuestAssignees" ("QuestId", "UserId");
            CREATE INDEX IF NOT EXISTS "IX_QuestAssignees_UserId"
                ON "QuestAssignees" ("UserId");
            """,
            ct);

        // md5(text)::uuid is built into PostgreSQL, so the backfill is concurrent-safe
        // without requiring pgcrypto/gen_random_uuid().
        await db.Database.ExecuteSqlRawAsync(
            """
            INSERT INTO "QuestAssignees" ("Id", "QuestId", "UserId", "Order")
            SELECT md5(q."Id"::text || ':' || q."AssigneeId"::text)::uuid,
                   q."Id",
                   q."AssigneeId",
                   0
            FROM "Quests" q
            WHERE q."AssigneeId" IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM "QuestAssignees" qa
                  WHERE qa."QuestId" = q."Id"
              )
            ON CONFLICT DO NOTHING;
            """,
            ct);

        var assignmentHeads = (await db.QuestAssignees
            .AsNoTracking()
            .OrderBy(a => a.QuestId)
            .ThenBy(a => a.Order)
            .Select(a => new { a.QuestId, a.UserId })
            .ToListAsync(ct))
            .GroupBy(a => a.QuestId)
            .Select(g => g.First())
            .ToList();
        var assignedQuestIds = assignmentHeads.Select(x => x.QuestId).ToList();
        var questsToSynchronize = await db.Quests
            .Where(q => assignedQuestIds.Contains(q.Id))
            .ToDictionaryAsync(q => q.Id, ct);
        foreach (var head in assignmentHeads)
        {
            var quest = questsToSynchronize[head.QuestId];
            if (quest.AssigneeId != head.UserId)
                quest.AssigneeId = head.UserId;
        }
        await db.SaveChangesAsync(ct);

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
