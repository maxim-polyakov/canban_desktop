using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsureSpaceContentSchemaAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "SpaceDocuments" (
              "Id" uuid PRIMARY KEY, "BoardId" uuid NOT NULL, "ParentId" uuid NULL,
              "Title" varchar(255) NOT NULL, "Content" text NOT NULL DEFAULT '',
              "CreatedByUserId" uuid NOT NULL, "UpdatedByUserId" uuid NOT NULL,
              "CreatedAt" timestamptz NOT NULL DEFAULT now(), "UpdatedAt" timestamptz NOT NULL DEFAULT now());
            CREATE INDEX IF NOT EXISTS "IX_SpaceDocuments_BoardId" ON "SpaceDocuments"("BoardId");

            CREATE TABLE IF NOT EXISTS "SpaceForms" (
              "Id" uuid PRIMARY KEY, "BoardId" uuid NOT NULL, "Title" varchar(255) NOT NULL, "Description" varchar(2000) NULL,
              "IssueType" integer NOT NULL DEFAULT 2, "FieldsJson" text NOT NULL DEFAULT '[]', "IsOpen" boolean NOT NULL DEFAULT true,
              "SubmissionCount" integer NOT NULL DEFAULT 0, "CreatedByUserId" uuid NOT NULL,
              "CreatedAt" timestamptz NOT NULL DEFAULT now(), "UpdatedAt" timestamptz NOT NULL DEFAULT now());
            CREATE INDEX IF NOT EXISTS "IX_SpaceForms_BoardId" ON "SpaceForms"("BoardId");

            CREATE OR REPLACE FUNCTION pg_temp.ensure_fk(tbl regclass, cname text, definition text)
            RETURNS void LANGUAGE plpgsql AS $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=tbl AND conname=cname) THEN
                EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',tbl,cname,definition);
              END IF;
            END $$;
            SELECT pg_temp.ensure_fk('"SpaceDocuments"','FK_SpaceDocuments_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"SpaceDocuments"','FK_SpaceDocuments_Parent','FOREIGN KEY ("ParentId") REFERENCES "SpaceDocuments"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"SpaceForms"','FK_SpaceForms_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');

            CREATE TABLE IF NOT EXISTS "CanbanDataMigrations" ("Id" varchar(100) PRIMARY KEY, "AppliedAt" timestamptz NOT NULL DEFAULT now());
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM "CanbanDataMigrations" WHERE "Id" = 'jira-space-tabs') THEN
                UPDATE "Boards" SET "Features" = "Features" || ',docs,forms'
                  || CASE WHEN "Template" IN ('kanban','scrum','bugs','top-level-planning') THEN ',development' ELSE '' END
                  WHERE "Features" <> '';
                INSERT INTO "CanbanDataMigrations"("Id") VALUES ('jira-space-tabs');
              END IF;
            END $$;
            """, ct);
    }
}
