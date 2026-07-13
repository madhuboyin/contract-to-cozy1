CREATE TYPE "PlantLocationType" AS ENUM ('INDOOR', 'OUTDOOR');
CREATE TYPE "GardenSunExposure" AS ENUM ('FULL_SUN', 'PART_SUN', 'SHADE', 'UNKNOWN');
CREATE TYPE "GardenSoilDrainage" AS ENUM ('FAST', 'MODERATE', 'SLOW', 'UNKNOWN');
CREATE TYPE "GardenIrrigationType" AS ENUM ('NONE', 'MANUAL', 'DRIP', 'SPRINKLER', 'UNKNOWN');

CREATE TABLE "garden_zones" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sunExposure" "GardenSunExposure" NOT NULL DEFAULT 'UNKNOWN',
  "soilDrainage" "GardenSoilDrainage" NOT NULL DEFAULT 'UNKNOWN',
  "irrigationType" "GardenIrrigationType" NOT NULL DEFAULT 'UNKNOWN',
  "frostPocket" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "garden_zones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "home_plants" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "roomId" TEXT,
  "gardenZoneId" TEXT,
  "plantCatalogId" TEXT,
  "sourceRecommendationId" TEXT,
  "name" TEXT NOT NULL,
  "nickname" TEXT,
  "locationType" "PlantLocationType" NOT NULL DEFAULT 'INDOOR',
  "acquiredAt" TIMESTAMP(3),
  "lastWateredAt" TIMESTAMP(3),
  "lastInspectedAt" TIMESTAMP(3),
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "home_plants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "garden_zones_propertyId_name_key" ON "garden_zones"("propertyId", "name");
CREATE INDEX "garden_zones_propertyId_idx" ON "garden_zones"("propertyId");
CREATE UNIQUE INDEX "home_plants_sourceRecommendationId_key" ON "home_plants"("sourceRecommendationId");
CREATE INDEX "home_plants_propertyId_locationType_isActive_idx" ON "home_plants"("propertyId", "locationType", "isActive");
CREATE INDEX "home_plants_roomId_idx" ON "home_plants"("roomId");
CREATE INDEX "home_plants_gardenZoneId_idx" ON "home_plants"("gardenZoneId");

ALTER TABLE "garden_zones" ADD CONSTRAINT "garden_zones_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "home_plants" ADD CONSTRAINT "home_plants_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "home_plants" ADD CONSTRAINT "home_plants_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "inventory_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "home_plants" ADD CONSTRAINT "home_plants_gardenZoneId_fkey" FOREIGN KEY ("gardenZoneId") REFERENCES "garden_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "home_plants" ADD CONSTRAINT "home_plants_plantCatalogId_fkey" FOREIGN KEY ("plantCatalogId") REFERENCES "plant_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "home_plants" ADD CONSTRAINT "home_plants_sourceRecommendationId_fkey" FOREIGN KEY ("sourceRecommendationId") REFERENCES "room_plant_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve plants already added through Plant Advisor before HomePlant existed.
INSERT INTO "home_plants" (
  "id", "propertyId", "roomId", "plantCatalogId", "sourceRecommendationId",
  "name", "locationType", "acquiredAt", "notes", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  r."propertyId",
  r."roomId",
  r."plantCatalogId",
  r."id",
  p."commonName",
  'INDOOR'::"PlantLocationType",
  e."occurredAt",
  e."summary",
  e."createdAt",
  CURRENT_TIMESTAMP
FROM "home_events" e
JOIN "room_plant_recommendations" r ON r."id" = e."meta"->>'recommendationId'
JOIN "plant_catalog" p ON p."id" = r."plantCatalogId"
WHERE e."subtype" = 'SMART_PLANT_ADVISOR'
  AND e."meta"->>'recommendationId' IS NOT NULL
ON CONFLICT ("sourceRecommendationId") DO NOTHING;
