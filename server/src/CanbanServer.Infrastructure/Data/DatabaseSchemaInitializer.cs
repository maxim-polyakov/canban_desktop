using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsureQuestAttachmentsSchemaAsync(
        CanbanDbContext db,
        CancellationToken ct = default)
    {
        // Add model columns before any EF query. EF selects every mapped Quest column,
        // so querying existing rows first would crash during a rolling schema upgrade.
        await EnsureJiraLikeSchemaAsync(db, ct);
        await EnsureJiraPlatformSchemaAsync(db, ct);
        await EnsureAssetsSchemaAsync(db, ct);
        await EnsurePlansSchemaAsync(db, ct);
        await EnsureHomeSchemaAsync(db, ct);
        await EnsureBillingSchemaAsync(db, ct);
        await EnsureDashboardsSchemaAsync(db, ct);
        await EnsureSpaceContentSchemaAsync(db, ct);
        await EnsureIssueFieldsSchemaAsync(db, ct);
        await EnsureAuditSchemaAsync(db, ct);
        await EnsureApiTokensSchemaAsync(db, ct);
        await EnsureVotesSchemaAsync(db, ct);
        await EnsureFilterSubscriptionsSchemaAsync(db, ct);

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
            CREATE TABLE IF NOT EXISTS "QuestExternalNotificationRecipients" (
                "Id" uuid NOT NULL,
                "QuestId" uuid NOT NULL,
                "Email" character varying(320) NOT NULL,
                "DisplayName" character varying(200) NULL,
                CONSTRAINT "PK_QuestExternalNotificationRecipients" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_QuestExternalNotificationRecipients_Quests_QuestId"
                    FOREIGN KEY ("QuestId") REFERENCES "Quests" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_QuestExternalNotificationRecipients_QuestId_Email"
                ON "QuestExternalNotificationRecipients" ("QuestId", "Email");
            CREATE INDEX IF NOT EXISTS "IX_QuestExternalNotificationRecipients_Email"
                ON "QuestExternalNotificationRecipients" ("Email");
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

    public static async Task EnsureJiraLikeSchemaAsync(
        CanbanDbContext db,
        CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            ALTER TABLE "Teams" ADD COLUMN IF NOT EXISTS "Key" character varying(16) NOT NULL DEFAULT 'KAN';
            ALTER TABLE "Boards" ADD COLUMN IF NOT EXISTS "KeyPrefix" character varying(16) NOT NULL DEFAULT 'KAN';
            ALTER TABLE "Boards" ADD COLUMN IF NOT EXISTS "NextIssueNumber" integer NOT NULL DEFAULT 1;

            CREATE TABLE IF NOT EXISTS "Sprints" (
                "Id" uuid NOT NULL,
                "BoardId" uuid NOT NULL,
                "Name" character varying(200) NOT NULL,
                "Goal" character varying(2000) NULL,
                "Status" integer NOT NULL,
                "StartDate" timestamp with time zone NULL,
                "EndDate" timestamp with time zone NULL,
                "Order" integer NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_Sprints" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_Sprints_Boards_BoardId"
                    FOREIGN KEY ("BoardId") REFERENCES "Boards" ("Id") ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS "IX_Sprints_BoardId_Order" ON "Sprints" ("BoardId", "Order");
            CREATE INDEX IF NOT EXISTS "IX_Sprints_BoardId_Status" ON "Sprints" ("BoardId", "Status");

            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "IssueKey" character varying(64) NOT NULL DEFAULT '';
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "IssueNumber" integer NOT NULL DEFAULT 0;
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "IssueType" integer NOT NULL DEFAULT 2;
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "Priority" integer NOT NULL DEFAULT 2;
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "Labels" character varying(1000) NOT NULL DEFAULT '';
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "Component" character varying(200) NULL;
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "FixVersion" character varying(200) NULL;
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "StoryPoints" integer NULL;
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "SprintId" uuid NULL;
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "ParentQuestId" uuid NULL;
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "OriginalEstimateMinutes" integer NULL;
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "RemainingEstimateMinutes" integer NULL;
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "DescriptionDocumentJson" text NULL;
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "ReporterId" uuid NULL;

            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "EmailNotificationsEnabled" boolean NOT NULL DEFAULT TRUE;
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "EmailWhenAssignee" boolean NOT NULL DEFAULT TRUE;
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "EmailWhenReporter" boolean NOT NULL DEFAULT TRUE;
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "EmailOwnChanges" boolean NOT NULL DEFAULT FALSE;
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "EmailFormat" character varying(8) NOT NULL DEFAULT 'html';
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "AutoWatch" boolean NOT NULL DEFAULT TRUE;
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "JobTitle" character varying(120) NULL;
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "Department" character varying(120) NULL;
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "Organization" character varying(120) NULL;
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "Location" character varying(120) NULL;
            ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "AboutMe" character varying(2000) NULL;

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_Quests_Sprints_SprintId'
                ) THEN
                    ALTER TABLE "Quests"
                        ADD CONSTRAINT "FK_Quests_Sprints_SprintId"
                        FOREIGN KEY ("SprintId") REFERENCES "Sprints" ("Id") ON DELETE SET NULL;
                END IF;
            END $$;

            CREATE INDEX IF NOT EXISTS "IX_Quests_IssueKey" ON "Quests" ("IssueKey");
            CREATE INDEX IF NOT EXISTS "IX_Quests_SprintId" ON "Quests" ("SprintId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_Quests_BoardId_IssueNumber"
                ON "Quests" ("BoardId", "IssueNumber")
                WHERE "IssueNumber" > 0;
            """,
            ct);

        // Backfill issue keys for existing quests that do not have them yet.
        await db.Database.ExecuteSqlRawAsync(
            """
            WITH numbered AS (
                SELECT q."Id",
                       q."BoardId",
                       COALESCE(NULLIF(b."KeyPrefix", ''), NULLIF(t."Key", ''), 'KAN') AS prefix,
                       ROW_NUMBER() OVER (PARTITION BY q."BoardId" ORDER BY q."CreatedAt", q."Order", q."Id") AS n
                FROM "Quests" q
                INNER JOIN "Boards" b ON b."Id" = q."BoardId"
                INNER JOIN "Teams" t ON t."Id" = b."TeamId"
                WHERE q."IssueNumber" = 0 OR COALESCE(q."IssueKey", '') = ''
            )
            UPDATE "Quests" q
            SET "IssueNumber" = numbered.n,
                "IssueKey" = numbered.prefix || '-' || numbered.n,
                "IssueType" = CASE WHEN q."IsEpic" THEN 0 ELSE COALESCE(NULLIF(q."IssueType", 0), 2) END
            FROM numbered
            WHERE q."Id" = numbered."Id";

            UPDATE "Boards" b
            SET "NextIssueNumber" = GREATEST(
                b."NextIssueNumber",
                COALESCE((SELECT MAX(q."IssueNumber") + 1 FROM "Quests" q WHERE q."BoardId" = b."Id"), 1)
            );

            UPDATE "Quests"
            SET "IssueType" = 0
            WHERE "IsEpic" = TRUE AND ("IssueType" IS NULL OR "IssueType" = 2);
            """,
            ct);

    }
}
