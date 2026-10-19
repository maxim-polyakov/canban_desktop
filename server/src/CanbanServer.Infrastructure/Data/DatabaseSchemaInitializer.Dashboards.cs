using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsureDashboardsSchemaAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            ALTER TABLE "Dashboards" ADD COLUMN IF NOT EXISTS "Description" varchar(2000) NULL;
            ALTER TABLE "Dashboards" ADD COLUMN IF NOT EXISTS "Template" varchar(32) NOT NULL DEFAULT 'blank';
            ALTER TABLE "Dashboards" ADD COLUMN IF NOT EXISTS "Viewers" varchar(16) NOT NULL DEFAULT 'private';
            ALTER TABLE "Dashboards" ADD COLUMN IF NOT EXISTS "Editors" varchar(16) NOT NULL DEFAULT 'private';
            ALTER TABLE "Dashboards" ADD COLUMN IF NOT EXISTS "FiltersJson" text NOT NULL DEFAULT '{{}}';
            ALTER TABLE "Dashboards" ADD COLUMN IF NOT EXISTS "CreatedAt" timestamptz NOT NULL DEFAULT now();
            ALTER TABLE "Dashboards" ADD COLUMN IF NOT EXISTS "UpdatedAt" timestamptz NOT NULL DEFAULT now();
            ALTER TABLE "Dashboards" ADD COLUMN IF NOT EXISTS "DeletedAt" timestamptz NULL;
            UPDATE "Dashboards" SET "Viewers" = 'org' WHERE "Shared" AND "Viewers" = 'private';
            CREATE INDEX IF NOT EXISTS "IX_Dashboards_OwnerUserId" ON "Dashboards"("OwnerUserId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_Dashboards_OwnerUserId_Default" ON "Dashboards"("OwnerUserId") WHERE "Template" = 'default';

            CREATE TABLE IF NOT EXISTS "DashboardStars" (
              "DashboardId" uuid NOT NULL, "UserId" uuid NOT NULL, "CreatedAt" timestamptz NOT NULL DEFAULT now(),
              PRIMARY KEY ("DashboardId", "UserId"));
            CREATE INDEX IF NOT EXISTS "IX_DashboardStars_UserId" ON "DashboardStars"("UserId");

            CREATE OR REPLACE FUNCTION pg_temp.ensure_fk(tbl regclass, cname text, definition text)
            RETURNS void LANGUAGE plpgsql AS $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=tbl AND conname=cname) THEN
                EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',tbl,cname,definition);
              END IF;
            END $$;
            SELECT pg_temp.ensure_fk('"DashboardStars"','FK_DashboardStars_Dashboard','FOREIGN KEY ("DashboardId") REFERENCES "Dashboards"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"DashboardStars"','FK_DashboardStars_User','FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            """, ct);
    }
}
