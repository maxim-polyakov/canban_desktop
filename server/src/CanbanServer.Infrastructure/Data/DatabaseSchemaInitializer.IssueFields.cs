using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsureIssueFieldsSchemaAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "IssueTypeDefinitions" (
              "Id" uuid PRIMARY KEY, "TeamId" uuid NOT NULL, "Name" varchar(60) NOT NULL, "Description" varchar(500) NULL,
              "BaseType" integer NOT NULL DEFAULT 2, "Icon" varchar(16) NOT NULL DEFAULT '📌', "Color" varchar(16) NOT NULL DEFAULT '#4bade8',
              "CreatedAt" timestamptz NOT NULL DEFAULT now());
            CREATE INDEX IF NOT EXISTS "IX_IssueTypeDefinitions_TeamId" ON "IssueTypeDefinitions"("TeamId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_IssueTypeDefinitions_TeamId_Name" ON "IssueTypeDefinitions"("TeamId", lower("Name"));

            CREATE TABLE IF NOT EXISTS "CustomFieldDefinitions" (
              "Id" uuid PRIMARY KEY, "TeamId" uuid NOT NULL, "Name" varchar(100) NOT NULL, "Description" varchar(500) NULL,
              "FieldType" varchar(16) NOT NULL DEFAULT 'text', "OptionsJson" text NOT NULL DEFAULT '[]',
              "Boards" text NOT NULL DEFAULT '', "IssueTypes" text NOT NULL DEFAULT '', "Required" boolean NOT NULL DEFAULT false,
              "Order" integer NOT NULL DEFAULT 0, "CreatedAt" timestamptz NOT NULL DEFAULT now());
            CREATE INDEX IF NOT EXISTS "IX_CustomFieldDefinitions_TeamId" ON "CustomFieldDefinitions"("TeamId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_CustomFieldDefinitions_TeamId_Name" ON "CustomFieldDefinitions"("TeamId", lower("Name"));

            ALTER TABLE "CustomFieldDefinitions" ADD COLUMN IF NOT EXISTS "CascadeJson" text NOT NULL DEFAULT '{{}}';
            ALTER TABLE "CustomFieldDefinitions" ADD COLUMN IF NOT EXISTS "DefaultValueJson" text NULL;
            ALTER TABLE "CustomFieldDefinitions" ADD COLUMN IF NOT EXISTS "ContextsJson" text NOT NULL DEFAULT '[]';

            CREATE TABLE IF NOT EXISTS "UserGroups" (
              "Id" uuid PRIMARY KEY, "TeamId" uuid NOT NULL, "Name" varchar(100) NOT NULL, "Description" varchar(500) NULL,
              "CreatedAt" timestamptz NOT NULL DEFAULT now());
            CREATE INDEX IF NOT EXISTS "IX_UserGroups_TeamId" ON "UserGroups"("TeamId");
            CREATE TABLE IF NOT EXISTS "UserGroupMembers" (
              "GroupId" uuid NOT NULL, "UserId" uuid NOT NULL, "AddedAt" timestamptz NOT NULL DEFAULT now(),
              PRIMARY KEY ("GroupId", "UserId"));
            CREATE INDEX IF NOT EXISTS "IX_UserGroupMembers_UserId" ON "UserGroupMembers"("UserId");

            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "IssueTypeId" uuid NULL;
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "CustomFieldsJson" text NOT NULL DEFAULT '{{}}';
            CREATE INDEX IF NOT EXISTS "IX_Quests_IssueTypeId" ON "Quests"("IssueTypeId");

            ALTER TABLE "WorkflowTransitions" ADD COLUMN IF NOT EXISTS "FromAnyStatus" boolean NOT NULL DEFAULT false;
            ALTER TABLE "WorkflowTransitions" ADD COLUMN IF NOT EXISTS "PostFunctionsJson" text NULL;
            ALTER TABLE "WorkflowTransitions" ALTER COLUMN "AllowedIssueTypes" TYPE varchar(2000);

            CREATE OR REPLACE FUNCTION pg_temp.ensure_fk(tbl regclass, cname text, definition text)
            RETURNS void LANGUAGE plpgsql AS $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=tbl AND conname=cname) THEN
                EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',tbl,cname,definition);
              END IF;
            END $$;
            SELECT pg_temp.ensure_fk('"IssueTypeDefinitions"','FK_IssueTypeDefinitions_Team','FOREIGN KEY ("TeamId") REFERENCES "Teams"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"CustomFieldDefinitions"','FK_CustomFieldDefinitions_Team','FOREIGN KEY ("TeamId") REFERENCES "Teams"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"UserGroups"','FK_UserGroups_Team','FOREIGN KEY ("TeamId") REFERENCES "Teams"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"UserGroupMembers"','FK_UserGroupMembers_Group','FOREIGN KEY ("GroupId") REFERENCES "UserGroups"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"UserGroupMembers"','FK_UserGroupMembers_User','FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"Quests"','FK_Quests_IssueTypeDefinitions_IssueTypeId','FOREIGN KEY ("IssueTypeId") REFERENCES "IssueTypeDefinitions"("Id") ON DELETE SET NULL');
            """, ct);
    }
}
