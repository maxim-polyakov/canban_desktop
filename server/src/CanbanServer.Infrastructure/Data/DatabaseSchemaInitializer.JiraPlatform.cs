using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsureJiraPlatformSchemaAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            ALTER TABLE "QuestComments" ADD COLUMN IF NOT EXISTS "DocumentJson" text NULL;
            ALTER TABLE "Boards" ADD COLUMN IF NOT EXISTS "Template" varchar(32) NOT NULL DEFAULT 'kanban';
            ALTER TABLE "Boards" ADD COLUMN IF NOT EXISTS "ManagementType" varchar(16) NOT NULL DEFAULT 'team';
            ALTER TABLE "Boards" ADD COLUMN IF NOT EXISTS "Access" varchar(16) NOT NULL DEFAULT 'private';
            ALTER TABLE "Boards" ADD COLUMN IF NOT EXISTS "Features" varchar(300) NOT NULL DEFAULT '';
            ALTER TABLE "Boards" ADD COLUMN IF NOT EXISTS "AvatarUrl" varchar(500) NULL;
            UPDATE "Quests" SET "ParentQuestId"="ParentEpicId" WHERE "ParentQuestId" IS NULL AND "ParentEpicId" IS NOT NULL;
            CREATE INDEX IF NOT EXISTS "IX_Quests_ParentQuestId" ON "Quests"("ParentQuestId");

            CREATE TABLE IF NOT EXISTS "WorkflowTransitions" (
              "Id" uuid PRIMARY KEY, "BoardId" uuid NOT NULL, "SourceColumnId" uuid NOT NULL, "TargetColumnId" uuid NOT NULL,
              "AllowedIssueTypes" varchar(200) NOT NULL DEFAULT '', "AllowedRoles" varchar(200) NOT NULL DEFAULT '',
              "ConditionsJson" text NULL, "Enabled" boolean NOT NULL DEFAULT true, "Name" varchar(200) NOT NULL DEFAULT '');
            CREATE INDEX IF NOT EXISTS "IX_WorkflowTransitions_BoardId_SourceColumnId_TargetColumnId" ON "WorkflowTransitions"("BoardId","SourceColumnId","TargetColumnId");

            CREATE TABLE IF NOT EXISTS "QuestLinks" (
              "Id" uuid PRIMARY KEY, "SourceQuestId" uuid NOT NULL, "TargetQuestId" uuid NOT NULL,
              "Type" integer NOT NULL, "CreatedAt" timestamptz NOT NULL, "CreatedByUserId" uuid NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_QuestLinks_SourceQuestId_TargetQuestId_Type" ON "QuestLinks"("SourceQuestId","TargetQuestId","Type");

            CREATE TABLE IF NOT EXISTS "BoardComponents" (
              "Id" uuid PRIMARY KEY, "BoardId" uuid NOT NULL, "Name" varchar(200) NOT NULL, "Description" text NULL,
              "LeadUserId" uuid NULL, "Archived" boolean NOT NULL DEFAULT false);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_BoardComponents_BoardId_Name" ON "BoardComponents"("BoardId","Name");
            CREATE TABLE IF NOT EXISTS "BoardReleases" (
              "Id" uuid PRIMARY KEY, "BoardId" uuid NOT NULL, "Name" varchar(200) NOT NULL, "Description" text NULL,
              "Status" integer NOT NULL DEFAULT 0, "StartDate" timestamptz NULL, "ReleaseDate" timestamptz NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_BoardReleases_BoardId_Name" ON "BoardReleases"("BoardId","Name");
            CREATE TABLE IF NOT EXISTS "QuestComponents" ("QuestId" uuid NOT NULL, "ComponentId" uuid NOT NULL, PRIMARY KEY("QuestId","ComponentId"));
            CREATE TABLE IF NOT EXISTS "QuestReleases" ("QuestId" uuid NOT NULL, "ReleaseId" uuid NOT NULL, PRIMARY KEY("QuestId","ReleaseId"));

            CREATE TABLE IF NOT EXISTS "WorkLogs" (
              "Id" uuid PRIMARY KEY, "QuestId" uuid NOT NULL, "UserId" uuid NOT NULL, "TimeSpentMinutes" integer NOT NULL,
              "StartedAt" timestamptz NOT NULL, "Note" varchar(2000) NULL, "CreatedAt" timestamptz NOT NULL, "UpdatedAt" timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS "IX_WorkLogs_QuestId_StartedAt" ON "WorkLogs"("QuestId","StartedAt");
            CREATE TABLE IF NOT EXISTS "QuestChanges" (
              "Id" uuid PRIMARY KEY, "QuestId" uuid NOT NULL, "UserId" uuid NULL, "ChangeType" varchar(64) NOT NULL,
              "Field" varchar(128) NULL, "OldValue" text NULL, "NewValue" text NULL, "CreatedAt" timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS "IX_QuestChanges_QuestId_CreatedAt" ON "QuestChanges"("QuestId","CreatedAt");
            CREATE TABLE IF NOT EXISTS "AppNotifications" (
              "Id" uuid PRIMARY KEY, "UserId" uuid NOT NULL, "QuestId" uuid NULL, "Type" varchar(64) NOT NULL,
              "Title" varchar(300) NOT NULL, "Body" text NULL, "Read" boolean NOT NULL DEFAULT false, "CreatedAt" timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS "IX_AppNotifications_UserId_Read_CreatedAt" ON "AppNotifications"("UserId","Read","CreatedAt");
            ALTER TABLE "AppNotifications" ADD COLUMN IF NOT EXISTS "Link" varchar(500) NULL;
            CREATE TABLE IF NOT EXISTS "Kudos" (
              "Id" uuid PRIMARY KEY, "FromUserId" uuid NOT NULL, "ToUserId" uuid NOT NULL, "Kind" varchar(32) NOT NULL DEFAULT 'thanks',
              "Message" varchar(1000) NOT NULL, "CreatedAt" timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS "IX_Kudos_ToUserId_CreatedAt" ON "Kudos"("ToUserId","CreatedAt");
            CREATE INDEX IF NOT EXISTS "IX_Kudos_FromUserId_CreatedAt" ON "Kudos"("FromUserId","CreatedAt");
            CREATE TABLE IF NOT EXISTS "SavedFilters" (
              "Id" uuid PRIMARY KEY, "OwnerUserId" uuid NOT NULL, "BoardId" uuid NULL, "Name" varchar(200) NOT NULL,
              "Jql" varchar(4000) NOT NULL, "Shared" boolean NOT NULL DEFAULT false, "CreatedAt" timestamptz NOT NULL, "UpdatedAt" timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS "IX_SavedFilters_OwnerUserId_Name" ON "SavedFilters"("OwnerUserId","Name");

            CREATE TABLE IF NOT EXISTS "OutboxMessages" (
              "Id" uuid PRIMARY KEY, "Type" varchar(128) NOT NULL, "PayloadJson" text NOT NULL, "Status" integer NOT NULL,
              "Attempts" integer NOT NULL DEFAULT 0, "AvailableAt" timestamptz NOT NULL, "CreatedAt" timestamptz NOT NULL,
              "ProcessedAt" timestamptz NULL, "LastError" text NULL);
            CREATE INDEX IF NOT EXISTS "IX_OutboxMessages_Status_AvailableAt" ON "OutboxMessages"("Status","AvailableAt");
            CREATE TABLE IF NOT EXISTS "AutomationRules" (
              "Id" uuid PRIMARY KEY, "BoardId" uuid NOT NULL, "Name" varchar(200) NOT NULL, "Trigger" integer NOT NULL,
              "ConditionsJson" text NULL, "ActionsJson" text NOT NULL DEFAULT '[]', "Enabled" boolean NOT NULL DEFAULT true);
            CREATE INDEX IF NOT EXISTS "IX_AutomationRules_BoardId_Enabled" ON "AutomationRules"("BoardId","Enabled");
            CREATE TABLE IF NOT EXISTS "OutboundWebhooks" (
              "Id" uuid PRIMARY KEY, "BoardId" uuid NOT NULL, "Url" varchar(1000) NOT NULL,
              "SecretConfigurationKey" varchar(200) NOT NULL, "Events" varchar(1000) NOT NULL, "Enabled" boolean NOT NULL DEFAULT true);
            CREATE TABLE IF NOT EXISTS "WebhookDeliveries" (
              "Id" uuid PRIMARY KEY, "WebhookId" uuid NOT NULL, "OutboxMessageId" uuid NOT NULL, "Status" integer NOT NULL,
              "Attempts" integer NOT NULL DEFAULT 0, "NextAttemptAt" timestamptz NOT NULL, "LastStatusCode" integer NULL, "LastError" text NULL);
            CREATE INDEX IF NOT EXISTS "IX_WebhookDeliveries_Status_NextAttemptAt" ON "WebhookDeliveries"("Status","NextAttemptAt");
            CREATE TABLE IF NOT EXISTS "GitHubIntegrations" (
              "Id" uuid PRIMARY KEY, "BoardId" uuid NOT NULL, "InstallationId" bigint NOT NULL,
              "RepositoryOwner" varchar(200) NOT NULL, "RepositoryName" varchar(200) NOT NULL,
              "WebhookSecretConfigurationKey" varchar(200) NOT NULL, "Enabled" boolean NOT NULL DEFAULT true);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_GitHubIntegrations_BoardId_RepositoryOwner_RepositoryName" ON "GitHubIntegrations"("BoardId","RepositoryOwner","RepositoryName");
            CREATE TABLE IF NOT EXISTS "DevelopmentLinks" (
              "Id" uuid PRIMARY KEY, "QuestId" uuid NOT NULL, "GitHubIntegrationId" uuid NOT NULL, "Kind" varchar(64) NOT NULL,
              "ExternalId" varchar(200) NOT NULL, "Url" varchar(1000) NOT NULL, "Title" varchar(500) NOT NULL,
              "Status" varchar(100) NULL, "PayloadJson" text NOT NULL DEFAULT '{{}}', "UpdatedAt" timestamptz NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_DevelopmentLinks_QuestId_Kind_ExternalId" ON "DevelopmentLinks"("QuestId","Kind","ExternalId");
            CREATE TABLE IF NOT EXISTS "Dashboards" (
              "Id" uuid PRIMARY KEY, "OwnerUserId" uuid NOT NULL, "Name" varchar(200) NOT NULL,
              "Shared" boolean NOT NULL DEFAULT false, "LayoutJson" text NOT NULL DEFAULT '[]');

            INSERT INTO "BoardComponents"("Id","BoardId","Name","Description","LeadUserId","Archived")
              SELECT md5(q."BoardId"::text || ':c:' || lower(trim(q."Component")))::uuid,q."BoardId",trim(q."Component"),NULL,NULL,false
              FROM "Quests" q WHERE q."Component" IS NOT NULL AND trim(q."Component")<>'' ON CONFLICT DO NOTHING;
            INSERT INTO "BoardReleases"("Id","BoardId","Name","Description","Status","StartDate","ReleaseDate")
              SELECT md5(q."BoardId"::text || ':r:' || lower(trim(q."FixVersion")))::uuid,q."BoardId",trim(q."FixVersion"),NULL,0,NULL,NULL
              FROM "Quests" q WHERE q."FixVersion" IS NOT NULL AND trim(q."FixVersion")<>'' ON CONFLICT DO NOTHING;
            INSERT INTO "QuestComponents"("QuestId","ComponentId")
              SELECT q."Id",md5(q."BoardId"::text || ':c:' || lower(trim(q."Component")))::uuid FROM "Quests" q
              WHERE q."Component" IS NOT NULL AND trim(q."Component")<>'' ON CONFLICT DO NOTHING;
            INSERT INTO "QuestReleases"("QuestId","ReleaseId")
              SELECT q."Id",md5(q."BoardId"::text || ':r:' || lower(trim(q."FixVersion")))::uuid FROM "Quests" q
              WHERE q."FixVersion" IS NOT NULL AND trim(q."FixVersion")<>'' ON CONFLICT DO NOTHING;
            """, ct);

        await EnsureJiraPlatformForeignKeysAsync(db, ct);
    }

    private static Task EnsureJiraPlatformForeignKeysAsync(CanbanDbContext db, CancellationToken ct) =>
        db.Database.ExecuteSqlRawAsync(
            """
            CREATE OR REPLACE FUNCTION pg_temp.ensure_fk(tbl regclass, cname text, definition text)
            RETURNS void LANGUAGE plpgsql AS $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=tbl AND conname=cname) THEN
                EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',tbl,cname,definition);
              END IF;
            END $$;
            SELECT pg_temp.ensure_fk('"Quests"','FK_Quests_ParentQuest','FOREIGN KEY ("ParentQuestId") REFERENCES "Quests"("Id") ON DELETE SET NULL');
            SELECT pg_temp.ensure_fk('"WorkflowTransitions"','FK_WorkflowTransitions_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"WorkflowTransitions"','FK_WorkflowTransitions_Source','FOREIGN KEY ("SourceColumnId") REFERENCES "Columns"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"WorkflowTransitions"','FK_WorkflowTransitions_Target','FOREIGN KEY ("TargetColumnId") REFERENCES "Columns"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"QuestLinks"','FK_QuestLinks_Source','FOREIGN KEY ("SourceQuestId") REFERENCES "Quests"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"QuestLinks"','FK_QuestLinks_Target','FOREIGN KEY ("TargetQuestId") REFERENCES "Quests"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"BoardComponents"','FK_BoardComponents_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"BoardReleases"','FK_BoardReleases_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"QuestComponents"','FK_QuestComponents_Quest','FOREIGN KEY ("QuestId") REFERENCES "Quests"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"QuestComponents"','FK_QuestComponents_Component','FOREIGN KEY ("ComponentId") REFERENCES "BoardComponents"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"QuestReleases"','FK_QuestReleases_Quest','FOREIGN KEY ("QuestId") REFERENCES "Quests"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"QuestReleases"','FK_QuestReleases_Release','FOREIGN KEY ("ReleaseId") REFERENCES "BoardReleases"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"WorkLogs"','FK_WorkLogs_Quest','FOREIGN KEY ("QuestId") REFERENCES "Quests"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"QuestChanges"','FK_QuestChanges_Quest','FOREIGN KEY ("QuestId") REFERENCES "Quests"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"AppNotifications"','FK_AppNotifications_User','FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"Kudos"','FK_Kudos_FromUser','FOREIGN KEY ("FromUserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"Kudos"','FK_Kudos_ToUser','FOREIGN KEY ("ToUserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"SavedFilters"','FK_SavedFilters_User','FOREIGN KEY ("OwnerUserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"AutomationRules"','FK_AutomationRules_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"OutboundWebhooks"','FK_OutboundWebhooks_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"WebhookDeliveries"','FK_WebhookDeliveries_Webhook','FOREIGN KEY ("WebhookId") REFERENCES "OutboundWebhooks"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"GitHubIntegrations"','FK_GitHubIntegrations_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"DevelopmentLinks"','FK_DevelopmentLinks_Quest','FOREIGN KEY ("QuestId") REFERENCES "Quests"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"Dashboards"','FK_Dashboards_User','FOREIGN KEY ("OwnerUserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            """, ct);
}
