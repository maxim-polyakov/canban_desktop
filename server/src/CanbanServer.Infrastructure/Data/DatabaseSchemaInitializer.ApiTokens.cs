using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsureApiTokensSchemaAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "ApiTokens" (
              "Id" uuid PRIMARY KEY, "UserId" uuid NOT NULL, "Name" varchar(100) NOT NULL, "TokenHash" varchar(64) NOT NULL,
              "Hint" varchar(16) NOT NULL DEFAULT '', "CreatedAt" timestamptz NOT NULL DEFAULT now(), "ExpiresAt" timestamptz NULL,
              "LastUsedAt" timestamptz NULL, "LastUsedIp" varchar(64) NULL, "RevokedAt" timestamptz NULL);
            ALTER TABLE "ApiTokens" ADD COLUMN IF NOT EXISTS "Scopes" varchar(500) NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_ApiTokens_TokenHash" ON "ApiTokens"("TokenHash");
            CREATE INDEX IF NOT EXISTS "IX_ApiTokens_UserId" ON "ApiTokens"("UserId");
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_ApiTokens_Users_UserId') THEN
                ALTER TABLE "ApiTokens" ADD CONSTRAINT "FK_ApiTokens_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE;
              END IF;
            END $$;
            """, ct);
    }
}
