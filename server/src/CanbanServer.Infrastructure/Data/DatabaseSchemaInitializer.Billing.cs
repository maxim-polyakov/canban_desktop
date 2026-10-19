using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsureBillingSchemaAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "BillingSubscriptions" (
              "UserId" uuid PRIMARY KEY, "Plan" varchar(16) NOT NULL DEFAULT 'free', "Cycle" varchar(16) NOT NULL DEFAULT 'monthly',
              "StartedAt" timestamptz NOT NULL, "UpdatedAt" timestamptz NOT NULL);
            CREATE TABLE IF NOT EXISTS "BillingPlanChanges" (
              "Id" uuid PRIMARY KEY, "UserId" uuid NOT NULL, "FromPlan" varchar(16) NOT NULL, "ToPlan" varchar(16) NOT NULL,
              "Cycle" varchar(16) NOT NULL, "Users" integer NOT NULL DEFAULT 0, "Amount" numeric(12,2) NOT NULL DEFAULT 0,
              "CreatedAt" timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS "IX_BillingPlanChanges_UserId_CreatedAt" ON "BillingPlanChanges"("UserId","CreatedAt");

            CREATE OR REPLACE FUNCTION pg_temp.ensure_fk(tbl regclass, cname text, definition text)
            RETURNS void LANGUAGE plpgsql AS $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=tbl AND conname=cname) THEN
                EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',tbl,cname,definition);
              END IF;
            END $$;
            SELECT pg_temp.ensure_fk('"BillingSubscriptions"','FK_BillingSubscriptions_User','FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"BillingPlanChanges"','FK_BillingPlanChanges_User','FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE');
            """, ct);
    }
}
