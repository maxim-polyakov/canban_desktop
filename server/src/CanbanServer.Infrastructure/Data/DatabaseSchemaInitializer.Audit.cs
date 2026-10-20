using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsureAuditSchemaAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "AuditEvents" (
              "Id" uuid PRIMARY KEY, "TeamId" uuid NOT NULL, "BoardId" uuid NULL, "BoardName" varchar(200) NULL,
              "ActorId" uuid NULL, "ActorName" varchar(200) NOT NULL DEFAULT '', "Action" varchar(80) NOT NULL,
              "Category" varchar(40) NOT NULL, "ObjectType" varchar(40) NULL, "ObjectId" uuid NULL, "ObjectName" varchar(300) NULL,
              "DetailsJson" text NULL, "IpAddress" varchar(64) NULL, "CreatedAt" timestamptz NOT NULL DEFAULT now());
            CREATE INDEX IF NOT EXISTS "IX_AuditEvents_TeamId_CreatedAt" ON "AuditEvents"("TeamId", "CreatedAt");
            """, ct);
    }
}
