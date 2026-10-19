using Microsoft.EntityFrameworkCore;

namespace CanbanServer.Infrastructure.Data;

public static partial class DatabaseSchemaInitializer
{
    public static async Task EnsureAssetsSchemaAsync(CanbanDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "AssetSchemas" (
              "Id" uuid PRIMARY KEY, "TeamId" uuid NOT NULL, "Name" varchar(200) NOT NULL, "Key" varchar(10) NOT NULL,
              "Description" text NULL, "NextObjectNumber" integer NOT NULL DEFAULT 1, "CreatedByUserId" uuid NOT NULL,
              "CreatedAt" timestamptz NOT NULL, "UpdatedAt" timestamptz NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_AssetSchemas_Key" ON "AssetSchemas"("Key");
            CREATE INDEX IF NOT EXISTS "IX_AssetSchemas_TeamId" ON "AssetSchemas"("TeamId");
            CREATE TABLE IF NOT EXISTS "AssetObjectTypes" (
              "Id" uuid PRIMARY KEY, "SchemaId" uuid NOT NULL, "ParentTypeId" uuid NULL, "Name" varchar(200) NOT NULL,
              "Description" text NULL, "Icon" varchar(32) NOT NULL DEFAULT 'box', "Position" integer NOT NULL DEFAULT 0);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_AssetObjectTypes_SchemaId_Name" ON "AssetObjectTypes"("SchemaId","Name");
            CREATE TABLE IF NOT EXISTS "AssetAttributes" (
              "Id" uuid PRIMARY KEY, "ObjectTypeId" uuid NOT NULL, "Name" varchar(200) NOT NULL, "Type" integer NOT NULL,
              "Required" boolean NOT NULL DEFAULT false, "Options" text NULL, "ReferenceTypeId" uuid NULL, "Position" integer NOT NULL DEFAULT 0);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_AssetAttributes_ObjectTypeId_Name" ON "AssetAttributes"("ObjectTypeId","Name");
            CREATE TABLE IF NOT EXISTS "AssetObjects" (
              "Id" uuid PRIMARY KEY, "SchemaId" uuid NOT NULL, "ObjectTypeId" uuid NOT NULL, "Key" varchar(32) NOT NULL,
              "Label" varchar(500) NOT NULL, "CreatedByUserId" uuid NOT NULL, "CreatedAt" timestamptz NOT NULL, "UpdatedAt" timestamptz NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_AssetObjects_Key" ON "AssetObjects"("Key");
            CREATE INDEX IF NOT EXISTS "IX_AssetObjects_ObjectTypeId_Label" ON "AssetObjects"("ObjectTypeId","Label");
            CREATE TABLE IF NOT EXISTS "AssetAttributeValues" (
              "Id" uuid PRIMARY KEY, "ObjectId" uuid NOT NULL, "AttributeId" uuid NOT NULL, "Value" text NULL, "ReferencedObjectId" uuid NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_AssetAttributeValues_ObjectId_AttributeId" ON "AssetAttributeValues"("ObjectId","AttributeId");
            CREATE INDEX IF NOT EXISTS "IX_AssetAttributeValues_ReferencedObjectId" ON "AssetAttributeValues"("ReferencedObjectId");
            CREATE TABLE IF NOT EXISTS "AssetQuestLinks" (
              "ObjectId" uuid NOT NULL, "QuestId" uuid NOT NULL, "CreatedByUserId" uuid NOT NULL, "CreatedAt" timestamptz NOT NULL,
              PRIMARY KEY("ObjectId","QuestId"));
            CREATE INDEX IF NOT EXISTS "IX_AssetQuestLinks_QuestId" ON "AssetQuestLinks"("QuestId");
            CREATE TABLE IF NOT EXISTS "AssetObjectChanges" (
              "Id" uuid PRIMARY KEY, "ObjectId" uuid NOT NULL, "UserId" uuid NULL, "Field" varchar(200) NOT NULL,
              "OldValue" text NULL, "NewValue" text NULL, "CreatedAt" timestamptz NOT NULL);
            CREATE INDEX IF NOT EXISTS "IX_AssetObjectChanges_ObjectId_CreatedAt" ON "AssetObjectChanges"("ObjectId","CreatedAt");

            CREATE OR REPLACE FUNCTION pg_temp.ensure_fk(tbl regclass, cname text, definition text)
            RETURNS void LANGUAGE plpgsql AS $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=tbl AND conname=cname) THEN
                EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',tbl,cname,definition);
              END IF;
            END $$;
            SELECT pg_temp.ensure_fk('"AssetSchemas"','FK_AssetSchemas_Team','FOREIGN KEY ("TeamId") REFERENCES "Teams"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"AssetObjectTypes"','FK_AssetObjectTypes_Schema','FOREIGN KEY ("SchemaId") REFERENCES "AssetSchemas"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"AssetObjectTypes"','FK_AssetObjectTypes_Parent','FOREIGN KEY ("ParentTypeId") REFERENCES "AssetObjectTypes"("Id") ON DELETE RESTRICT');
            SELECT pg_temp.ensure_fk('"AssetAttributes"','FK_AssetAttributes_Type','FOREIGN KEY ("ObjectTypeId") REFERENCES "AssetObjectTypes"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"AssetObjects"','FK_AssetObjects_Schema','FOREIGN KEY ("SchemaId") REFERENCES "AssetSchemas"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"AssetObjects"','FK_AssetObjects_Type','FOREIGN KEY ("ObjectTypeId") REFERENCES "AssetObjectTypes"("Id") ON DELETE RESTRICT');
            SELECT pg_temp.ensure_fk('"AssetAttributeValues"','FK_AssetAttributeValues_Object','FOREIGN KEY ("ObjectId") REFERENCES "AssetObjects"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"AssetAttributeValues"','FK_AssetAttributeValues_Attribute','FOREIGN KEY ("AttributeId") REFERENCES "AssetAttributes"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"AssetAttributeValues"','FK_AssetAttributeValues_Referenced','FOREIGN KEY ("ReferencedObjectId") REFERENCES "AssetObjects"("Id") ON DELETE SET NULL');
            SELECT pg_temp.ensure_fk('"AssetQuestLinks"','FK_AssetQuestLinks_Object','FOREIGN KEY ("ObjectId") REFERENCES "AssetObjects"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"AssetQuestLinks"','FK_AssetQuestLinks_Quest','FOREIGN KEY ("QuestId") REFERENCES "Quests"("Id") ON DELETE CASCADE');
            SELECT pg_temp.ensure_fk('"AssetObjectChanges"','FK_AssetObjectChanges_Object','FOREIGN KEY ("ObjectId") REFERENCES "AssetObjects"("Id") ON DELETE CASCADE');
            """, ct);
    }
}
