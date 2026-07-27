CREATE TABLE "insurance_market_benchmark_sources" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "rightsStatus" TEXT NOT NULL,
    "rightsSummary" TEXT NOT NULL,
    "domainReviewStatus" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_market_benchmark_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "insurance_market_benchmark_releases" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "observationStart" TIMESTAMP(3) NOT NULL,
    "observationEnd" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "coverageBasisJson" JSONB NOT NULL,
    "methodologySummary" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_market_benchmark_releases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "insurance_market_benchmark_observations" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "geographyType" TEXT NOT NULL,
    "geographyCode" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "sampleSize" INTEGER,
    "observationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_market_benchmark_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "insurance_market_benchmark_sources_sourceKey_key"
ON "insurance_market_benchmark_sources"("sourceKey");

CREATE INDEX "insurance_market_benchmark_sources_isActive_rightsStatus_domainReviewStatus_idx"
ON "insurance_market_benchmark_sources"("isActive", "rightsStatus", "domainReviewStatus");

CREATE UNIQUE INDEX "insurance_market_benchmark_releases_sourceId_version_key"
ON "insurance_market_benchmark_releases"("sourceId", "version");

CREATE INDEX "insurance_market_benchmark_releases_status_expiresAt_observationEnd_idx"
ON "insurance_market_benchmark_releases"("status", "expiresAt", "observationEnd" DESC);

CREATE UNIQUE INDEX "insurance_market_benchmark_observations_releaseId_geographyType_geographyCode_metricKey_key"
ON "insurance_market_benchmark_observations"("releaseId", "geographyType", "geographyCode", "metricKey");

CREATE INDEX "insurance_market_benchmark_observations_geographyType_geographyCode_metricKey_idx"
ON "insurance_market_benchmark_observations"("geographyType", "geographyCode", "metricKey");

ALTER TABLE "insurance_market_benchmark_releases"
ADD CONSTRAINT "insurance_market_benchmark_releases_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "insurance_market_benchmark_sources"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "insurance_market_benchmark_observations"
ADD CONSTRAINT "insurance_market_benchmark_observations_releaseId_fkey"
FOREIGN KEY ("releaseId") REFERENCES "insurance_market_benchmark_releases"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
