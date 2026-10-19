using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsurePlansSchemaAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "Plans" (
              "Id" uuid PRIMARY KEY, "OwnerUserId" uuid NOT NULL, "Name" varchar(200) NOT NULL, "Description" text NULL,
              "Access" varchar(16) NOT NULL DEFAULT 'private', "ExcludeDoneAfterDays" integer NULL,
              "ExcludedIssueTypes" varchar(64) NOT NULL DEFAULT '', "CreatedAt" timestamptz NOT NULL, "UpdatedAt" timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS "IX_Plans_OwnerUserId" ON "Plans"("OwnerUserId");
            CREATE TABLE IF NOT EXISTS "PlanSources" (
              "Id" uuid PRIMARY KEY, "PlanId" uuid NOT NULL, "Kind" varchar(16) NOT NULL, "BoardId" uuid NULL, "FilterId" uuid NULL);
            CREATE INDEX IF NOT EXISTS "IX_PlanSources_PlanId" ON "PlanSources"("PlanId");
            CREATE TABLE IF NOT EXISTS "PlanTeams" (
              "Id" uuid PRIMARY KEY, "PlanId" uuid NOT NULL, "Name" varchar(200) NOT NULL, "TeamId" uuid NULL,
              "Capacity" integer NOT NULL DEFAULT 30, "IterationDays" integer NOT NULL DEFAULT 14, "Position" integer NOT NULL DEFAULT 0);
            CREATE INDEX IF NOT EXISTS "IX_PlanTeams_PlanId" ON "PlanTeams"("PlanId");
            CREATE TABLE IF NOT EXISTS "PlanScenarios" (
              "Id" uuid PRIMARY KEY, "PlanId" uuid NOT NULL, "Name" varchar(200) NOT NULL, "Color" varchar(16) NOT NULL DEFAULT '#0c66e4',
              "IsDefault" boolean NOT NULL DEFAULT false, "CreatedAt" timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS "IX_PlanScenarios_PlanId" ON "PlanScenarios"("PlanId");
            CREATE TABLE IF NOT EXISTS "PlanScheduleItems" (
              "ScenarioId" uuid NOT NULL, "QuestId" uuid NOT NULL, "StartDate" timestamptz NULL, "DueDate" timestamptz NULL,
              "PlanTeamId" uuid NULL, "UpdatedAt" timestamptz NOT NULL, PRIMARY KEY("ScenarioId","QuestId"));
            CREATE TABLE IF NOT EXISTS "PlanExclusions" ("PlanId" uuid NOT NULL, "QuestId" uuid NOT NULL, PRIMARY KEY("PlanId","QuestId"));

            CREATE OR REPLACE FUNCTION pg_temp.ensure_fk(tbl regclass, cname text, definition text)
            RETURNS void LANGUAGE plpgsql AS $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=tbl AND conname=cname) THEN
                EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',tbl,cname,definition);
              END IF;
            END $$;
            SELECT pg_temp.ensure_fk('"Plans"','FK_Plans_Owner','FOREIGN KEY ("OwnerUserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"PlanSources"','FK_PlanSources_Plan','FOREIGN KEY ("PlanId") REFERENCES "Plans"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"PlanSources"','FK_PlanSources_Board','FOREIGN KEY ("BoardId") REFERENCES "Boards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"PlanSources"','FK_PlanSources_Filter','FOREIGN KEY ("FilterId") REFERENCES "SavedFilters"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"PlanTeams"','FK_PlanTeams_Plan','FOREIGN KEY ("PlanId") REFERENCES "Plans"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"PlanTeams"','FK_PlanTeams_Team','FOREIGN KEY ("TeamId") REFERENCES "Teams"("Id") ON DELETE SET NULL');
            SELECT pg_temp.ensure_fk('"PlanScenarios"','FK_PlanScenarios_Plan','FOREIGN KEY ("PlanId") REFERENCES "Plans"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"PlanScheduleItems"','FK_PlanScheduleItems_Scenario','FOREIGN KEY ("ScenarioId") REFERENCES "PlanScenarios"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"PlanScheduleItems"','FK_PlanScheduleItems_Quest','FOREIGN KEY ("QuestId") REFERENCES "Quests"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"PlanScheduleItems"','FK_PlanScheduleItems_Team','FOREIGN KEY ("PlanTeamId") REFERENCES "PlanTeams"("Id") ON DELETE SET NULL');
            SELECT pg_temp.ensure_fk('"PlanExclusions"','FK_PlanExclusions_Plan','FOREIGN KEY ("PlanId") REFERENCES "Plans"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"PlanExclusions"','FK_PlanExclusions_Quest','FOREIGN KEY ("QuestId") REFERENCES "Quests"("Id") ON DELETE CASCADE');
            """, ct);
    }
}
