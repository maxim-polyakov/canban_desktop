using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsureHomeSchemaAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "HomeItems" (
              "Id" uuid PRIMARY KEY, "Kind" varchar(16) NOT NULL, "Name" varchar(200) NOT NULL, "Description" text NULL,
              "Icon" varchar(16) NOT NULL DEFAULT '', "OwnerUserId" uuid NOT NULL, "CreatedByUserId" uuid NOT NULL, "TeamId" uuid NULL,
              "ParentId" uuid NULL, "Status" varchar(16) NOT NULL DEFAULT 'pending', "Score" double precision NULL,
              "StartDate" timestamptz NULL, "TargetDate" timestamptz NULL, "Tags" varchar(500) NOT NULL DEFAULT '',
              "IsPrivate" boolean NOT NULL DEFAULT false, "IsArchived" boolean NOT NULL DEFAULT false, "ArchivedAt" timestamptz NULL,
              "LastUpdateAt" timestamptz NULL, "CreatedAt" timestamptz NOT NULL, "UpdatedAt" timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS "IX_HomeItems_Kind" ON "HomeItems"("Kind");
            CREATE INDEX IF NOT EXISTS "IX_HomeItems_OwnerUserId" ON "HomeItems"("OwnerUserId");
            CREATE INDEX IF NOT EXISTS "IX_HomeItems_ParentId" ON "HomeItems"("ParentId");
            CREATE TABLE IF NOT EXISTS "HomeItemMembers" (
              "ItemId" uuid NOT NULL, "UserId" uuid NOT NULL, "Role" varchar(16) NOT NULL, "CreatedAt" timestamptz NOT NULL,
              PRIMARY KEY("ItemId","UserId","Role"));
            CREATE INDEX IF NOT EXISTS "IX_HomeItemMembers_UserId" ON "HomeItemMembers"("UserId");
            CREATE TABLE IF NOT EXISTS "HomeItemLinks" (
              "GoalId" uuid NOT NULL, "ProjectId" uuid NOT NULL, "CreatedAt" timestamptz NOT NULL, PRIMARY KEY("GoalId","ProjectId"));
            CREATE INDEX IF NOT EXISTS "IX_HomeItemLinks_ProjectId" ON "HomeItemLinks"("ProjectId");
            CREATE TABLE IF NOT EXISTS "HomeItemWorks" (
              "ItemId" uuid NOT NULL, "QuestId" uuid NOT NULL, "CreatedAt" timestamptz NOT NULL, PRIMARY KEY("ItemId","QuestId"));
            CREATE TABLE IF NOT EXISTS "HomeStatusUpdates" (
              "Id" uuid PRIMARY KEY, "ItemId" uuid NOT NULL, "AuthorUserId" uuid NOT NULL, "Status" varchar(16) NOT NULL,
              "Score" double precision NULL, "TargetDate" timestamptz NULL, "PreviousTargetDate" timestamptz NULL,
              "PreviousStatus" varchar(16) NULL, "Summary" text NOT NULL DEFAULT '', "CreatedAt" timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS "IX_HomeStatusUpdates_ItemId_CreatedAt" ON "HomeStatusUpdates"("ItemId","CreatedAt");
            ALTER TABLE "HomeItems" ADD COLUMN IF NOT EXISTS "Number" integer NOT NULL DEFAULT 0;
            ALTER TABLE "HomeItems" ADD COLUMN IF NOT EXISTS "Why" text NULL;
            ALTER TABLE "HomeItems" ADD COLUMN IF NOT EXISTS "Success" text NULL;
            UPDATE "HomeItems" h SET "Number" = n.rn + COALESCE((SELECT max("Number") FROM "HomeItems" m WHERE m."Kind" = n."Kind"), 0)
            FROM (SELECT "Id", "Kind", row_number() OVER (PARTITION BY "Kind" ORDER BY "CreatedAt", "Id") AS rn FROM "HomeItems" WHERE "Number" = 0) n
            WHERE h."Id" = n."Id";
            CREATE TABLE IF NOT EXISTS "HomeEntries" (
              "Id" uuid PRIMARY KEY, "ItemId" uuid NOT NULL, "Type" varchar(16) NOT NULL, "AuthorUserId" uuid NOT NULL,
              "Title" varchar(300) NOT NULL DEFAULT '', "Body" text NOT NULL DEFAULT '', "Url" varchar(2000) NULL, "TargetItemId" uuid NULL,
              "Resolved" boolean NOT NULL DEFAULT false, "CreatedAt" timestamptz NOT NULL, "UpdatedAt" timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS "IX_HomeEntries_ItemId_Type" ON "HomeEntries"("ItemId","Type");

            CREATE OR REPLACE FUNCTION pg_temp.ensure_fk(tbl regclass, cname text, definition text)
            RETURNS void LANGUAGE plpgsql AS $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=tbl AND conname=cname) THEN
                EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',tbl,cname,definition);
              END IF;
            END $$;
            SELECT pg_temp.ensure_fk('"HomeItems"','FK_HomeItems_Owner','FOREIGN KEY ("OwnerUserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"HomeItems"','FK_HomeItems_Creator','FOREIGN KEY ("CreatedByUserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"HomeItems"','FK_HomeItems_Team','FOREIGN KEY ("TeamId") REFERENCES "Teams"("Id") ON DELETE SET NULL');
            SELECT pg_temp.ensure_fk('"HomeItems"','FK_HomeItems_Parent','FOREIGN KEY ("ParentId") REFERENCES "HomeItems"("Id") ON DELETE SET NULL');
            SELECT pg_temp.ensure_fk('"HomeItemMembers"','FK_HomeItemMembers_Item','FOREIGN KEY ("ItemId") REFERENCES "HomeItems"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"HomeItemMembers"','FK_HomeItemMembers_User','FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"HomeItemLinks"','FK_HomeItemLinks_Goal','FOREIGN KEY ("GoalId") REFERENCES "HomeItems"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"HomeItemLinks"','FK_HomeItemLinks_Project','FOREIGN KEY ("ProjectId") REFERENCES "HomeItems"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"HomeItemWorks"','FK_HomeItemWorks_Item','FOREIGN KEY ("ItemId") REFERENCES "HomeItems"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"HomeItemWorks"','FK_HomeItemWorks_Quest','FOREIGN KEY ("QuestId") REFERENCES "Quests"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"HomeStatusUpdates"','FK_HomeStatusUpdates_Item','FOREIGN KEY ("ItemId") REFERENCES "HomeItems"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"HomeEntries"','FK_HomeEntries_Item','FOREIGN KEY ("ItemId") REFERENCES "HomeItems"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"HomeEntries"','FK_HomeEntries_Target','FOREIGN KEY ("TargetItemId") REFERENCES "HomeItems"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"HomeEntries"','FK_HomeEntries_Author','FOREIGN KEY ("AuthorUserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"HomeStatusUpdates"','FK_HomeStatusUpdates_Author','FOREIGN KEY ("AuthorUserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            """, ct);
    }
}
