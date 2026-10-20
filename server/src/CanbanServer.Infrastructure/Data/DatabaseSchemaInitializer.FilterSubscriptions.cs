using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsureFilterSubscriptionsSchemaAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "FilterSubscriptions" (
              "Id" uuid NOT NULL,
              "FilterId" uuid NOT NULL,
              "OwnerUserId" uuid NOT NULL,
              "GroupId" uuid NULL,
              "Frequency" varchar(16) NOT NULL DEFAULT 'daily',
              "Hour" integer NOT NULL DEFAULT 9,
              "Minute" integer NOT NULL DEFAULT 0,
              "DaysOfWeek" varchar(32) NOT NULL DEFAULT '',
              "DayOfMonth" integer NOT NULL DEFAULT 1,
              "IntervalHours" integer NOT NULL DEFAULT 1,
              "TimeZone" varchar(64) NOT NULL DEFAULT 'UTC',
              "EmailWhenEmpty" boolean NOT NULL DEFAULT false,
              "LastRunAt" timestamp with time zone NULL,
              "NextRunAt" timestamp with time zone NOT NULL,
              "CreatedAt" timestamp with time zone NOT NULL DEFAULT now(),
              CONSTRAINT "PK_FilterSubscriptions" PRIMARY KEY ("Id"),
              CONSTRAINT "FK_FilterSubscriptions_SavedFilters_FilterId" FOREIGN KEY ("FilterId") REFERENCES "SavedFilters" ("Id") ON DELETE CASCADE,
              CONSTRAINT "FK_FilterSubscriptions_Users_OwnerUserId" FOREIGN KEY ("OwnerUserId") REFERENCES "Users" ("Id") ON DELETE CASCADE,
              CONSTRAINT "FK_FilterSubscriptions_UserGroups_GroupId" FOREIGN KEY ("GroupId") REFERENCES "UserGroups" ("Id") ON DELETE CASCADE);
            CREATE INDEX IF NOT EXISTS "IX_FilterSubscriptions_NextRunAt" ON "FilterSubscriptions" ("NextRunAt");
            CREATE INDEX IF NOT EXISTS "IX_FilterSubscriptions_FilterId" ON "FilterSubscriptions" ("FilterId");
            """, ct);
    }
}
