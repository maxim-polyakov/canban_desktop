using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsureServiceDeskSchemaAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            ALTER TABLE "Quests" ADD COLUMN IF NOT EXISTS "RequestTypeId" uuid NULL;
            ALTER TABLE "QuestComments" ADD COLUMN IF NOT EXISTS "IsInternal" boolean NOT NULL DEFAULT false;

            CREATE TABLE IF NOT EXISTS "ServiceDeskSettings" (
              "BoardId" uuid PRIMARY KEY,
              "Enabled" boolean NOT NULL DEFAULT false,
              "PortalSlug" varchar(64) NOT NULL DEFAULT '',
              "WelcomeTitle" varchar(200) NOT NULL DEFAULT 'Центр поддержки',
              "WelcomeText" text NULL,
              "CreatedAt" timestamptz NOT NULL,
              "UpdatedAt" timestamptz NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_ServiceDeskSettings_PortalSlug"
              ON "ServiceDeskSettings"("PortalSlug") WHERE "PortalSlug" <> '';

            CREATE TABLE IF NOT EXISTS "ServiceRequestTypes" (
              "Id" uuid PRIMARY KEY,
              "BoardId" uuid NOT NULL,
              "Name" varchar(120) NOT NULL,
              "Description" varchar(2000) NULL,
              "Icon" varchar(32) NOT NULL DEFAULT 'help',
              "IssueType" integer NOT NULL DEFAULT 2,
              "FormId" uuid NULL,
              "QueueId" uuid NULL,
              "SlaPolicyId" uuid NULL,
              "FieldsJson" text NOT NULL DEFAULT '[]',
              "Order" integer NOT NULL DEFAULT 0,
              "IsEnabled" boolean NOT NULL DEFAULT true);
            CREATE INDEX IF NOT EXISTS "IX_ServiceRequestTypes_BoardId_Order" ON "ServiceRequestTypes"("BoardId","Order");

            CREATE TABLE IF NOT EXISTS "ServiceQueues" (
              "Id" uuid PRIMARY KEY,
              "BoardId" uuid NOT NULL,
              "Name" varchar(120) NOT NULL,
              "Description" varchar(2000) NULL,
              "Jql" varchar(2000) NOT NULL DEFAULT 'statusCategory != Done ORDER BY created DESC',
              "Order" integer NOT NULL DEFAULT 0,
              "DefaultGroupId" uuid NULL);
            CREATE INDEX IF NOT EXISTS "IX_ServiceQueues_BoardId_Order" ON "ServiceQueues"("BoardId","Order");

            CREATE TABLE IF NOT EXISTS "SlaPolicies" (
              "Id" uuid PRIMARY KEY,
              "BoardId" uuid NOT NULL,
              "Name" varchar(120) NOT NULL,
              "FirstResponseMinutes" integer NOT NULL DEFAULT 240,
              "ResolutionMinutes" integer NOT NULL DEFAULT 1440,
              "PauseStatusTitlesJson" text NOT NULL DEFAULT '["Ожидает пользователя"]',
              "CalendarJson" text NOT NULL DEFAULT '{{"timezone":"Europe/Moscow","weekdays":[1,2,3,4,5],"start":"09:00","end":"18:00"}}');
            CREATE INDEX IF NOT EXISTS "IX_SlaPolicies_BoardId" ON "SlaPolicies"("BoardId");

            CREATE TABLE IF NOT EXISTS "SlaClocks" (
              "Id" uuid PRIMARY KEY,
              "QuestId" uuid NOT NULL,
              "PolicyId" uuid NOT NULL,
              "Metric" varchar(32) NOT NULL,
              "Status" varchar(16) NOT NULL DEFAULT 'running',
              "StartedAt" timestamptz NOT NULL,
              "TargetAt" timestamptz NOT NULL,
              "PausedAt" timestamptz NULL,
              "CompletedAt" timestamptz NULL,
              "BreachedAt" timestamptz NULL,
              "WarnedAt" timestamptz NULL,
              "ElapsedWorkingMinutes" integer NOT NULL DEFAULT 0);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_SlaClocks_QuestId_Metric" ON "SlaClocks"("QuestId","Metric");
            CREATE INDEX IF NOT EXISTS "IX_SlaClocks_Status_TargetAt" ON "SlaClocks"("Status","TargetAt");

            CREATE TABLE IF NOT EXISTS "ApprovalRequests" (
              "Id" uuid PRIMARY KEY,
              "QuestId" uuid NOT NULL,
              "BoardId" uuid NOT NULL,
              "Title" varchar(200) NOT NULL DEFAULT 'Согласование',
              "Status" varchar(16) NOT NULL DEFAULT 'pending',
              "RequiredApprovals" integer NOT NULL DEFAULT 1,
              "BlockedTransitionKey" varchar(64) NULL,
              "CreatedByUserId" uuid NOT NULL,
              "CreatedAt" timestamptz NOT NULL,
              "DecidedAt" timestamptz NULL);
            CREATE INDEX IF NOT EXISTS "IX_ApprovalRequests_QuestId_Status" ON "ApprovalRequests"("QuestId","Status");
            CREATE INDEX IF NOT EXISTS "IX_ApprovalRequests_BoardId" ON "ApprovalRequests"("BoardId");

            CREATE TABLE IF NOT EXISTS "ApprovalDecisions" (
              "Id" uuid PRIMARY KEY,
              "ApprovalRequestId" uuid NOT NULL,
              "ApproverUserId" uuid NULL,
              "ApproverGroupId" uuid NULL,
              "Status" varchar(16) NOT NULL DEFAULT 'pending',
              "Comment" varchar(2000) NULL,
              "DecidedAt" timestamptz NULL);
            CREATE INDEX IF NOT EXISTS "IX_ApprovalDecisions_ApprovalRequestId" ON "ApprovalDecisions"("ApprovalRequestId");

            CREATE OR REPLACE FUNCTION pg_temp.ensure_fk(tbl regclass, cname text, definition text)
            RETURNS void LANGUAGE plpgsql AS $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=tbl AND conname=cname) THEN
                EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',tbl,cname,definition);
              END IF;
            END $$;
            SELECT pg_temp.ensure_fk('"ServiceDeskSettings"','FK_ServiceDeskSettings_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"ServiceRequestTypes"','FK_ServiceRequestTypes_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"ServiceQueues"','FK_ServiceQueues_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"SlaPolicies"','FK_SlaPolicies_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"SlaClocks"','FK_SlaClocks_Quest','FOREIGN KEY ("QuestId") REFERENCES "Quests"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"SlaClocks"','FK_SlaClocks_Policy','FOREIGN KEY ("PolicyId") REFERENCES "SlaPolicies"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"ApprovalRequests"','FK_ApprovalRequests_Quest','FOREIGN KEY ("QuestId") REFERENCES "Quests"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"ApprovalRequests"','FK_ApprovalRequests_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"ApprovalDecisions"','FK_ApprovalDecisions_Request','FOREIGN KEY ("ApprovalRequestId") REFERENCES "ApprovalRequests"("Id") ON DELETE CASCADE');

            CREATE TABLE IF NOT EXISTS "CanbanDataMigrations" (
              "Id" varchar(64) PRIMARY KEY,
              "AppliedAt" timestamptz NOT NULL DEFAULT now());
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM "CanbanDataMigrations" WHERE "Id" = 'service-desk-it-help') THEN
                UPDATE "Boards"
                SET "Features" = CASE
                  WHEN "Features" IS NULL OR "Features" = '' THEN 'summary,list,board,reports,archive,docs,forms,service-desk'
                  WHEN "Features" LIKE '%service-desk%' THEN "Features"
                  ELSE "Features" || ',service-desk'
                END
                WHERE "Template" = 'it-help';
                INSERT INTO "CanbanDataMigrations"("Id") VALUES ('service-desk-it-help');
              END IF;
            END $$;
            """, ct);
    }
}
