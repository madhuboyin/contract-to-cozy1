-- CreateEnum
CREATE TYPE "GazetteEditionStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "GazetteStoryCategory" AS ENUM ('RISK', 'MAINTENANCE', 'INCIDENT', 'CLAIMS', 'INSURANCE', 'WARRANTY', 'FINANCIAL', 'REFINANCE', 'NEIGHBORHOOD', 'SEASONAL', 'SCORE', 'DIGITAL_TWIN', 'GENERAL');

-- CreateEnum
CREATE TYPE "GazetteStoryPriority" AS ENUM ('HERO', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "GazetteGenerationStage" AS ENUM ('SIGNAL_COLLECTION', 'CANDIDATE_GENERATION', 'RANKING', 'EDITORIAL_GENERATION', 'VALIDATION', 'PUBLICATION');

-- CreateEnum
CREATE TYPE "GazetteCandidateStatus" AS ENUM ('ACTIVE', 'SELECTED', 'EXCLUDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GazetteExclusionReason" AS ENUM ('LOW_SCORE', 'LOW_CONFIDENCE', 'DUPLICATE', 'EXPIRED', 'CATEGORY_CAP', 'NOT_SHARE_SAFE', 'MISSING_DEEP_LINK', 'MISSING_SUPPORTING_FACTS', 'BELOW_NEWSWORTHY_THRESHOLD');

-- CreateEnum
CREATE TYPE "GazetteShareStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GazetteAiStatus" AS ENUM ('NOT_REQUESTED', 'GENERATED', 'FALLBACK_USED', 'FAILED');

-- CreateTable
CREATE TABLE "gazette_editions" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "publishDate" TIMESTAMP(3),
    "status" "GazetteEditionStatus" NOT NULL DEFAULT 'DRAFT',
    "minQualifiedNeeded" INTEGER NOT NULL DEFAULT 4,
    "qualifiedCount" INTEGER NOT NULL DEFAULT 0,
    "selectedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedReason" TEXT,
    "heroStoryId" TEXT,
    "summaryHeadline" TEXT,
    "summaryDeck" TEXT,
    "tickerJson" JSONB,
    "generationVersion" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gazette_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gazette_stories" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "sourceFeature" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "storyCategory" "GazetteStoryCategory" NOT NULL,
    "storyTag" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "priority" "GazetteStoryPriority" NOT NULL DEFAULT 'MEDIUM',
    "rank" INTEGER NOT NULL,
    "isHero" BOOLEAN NOT NULL DEFAULT false,
    "headline" TEXT NOT NULL,
    "dek" TEXT,
    "summary" TEXT NOT NULL,
    "supportingFactsJson" JSONB,
    "rankExplanation" TEXT,
    "urgencyScore" DOUBLE PRECISION,
    "financialImpactEstimate" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION,
    "noveltyScore" DOUBLE PRECISION,
    "engagementScore" DOUBLE PRECISION,
    "compositeScore" DOUBLE PRECISION,
    "primaryDeepLink" TEXT NOT NULL,
    "secondaryDeepLink" TEXT,
    "shareSafe" BOOLEAN NOT NULL DEFAULT true,
    "aiStatus" "GazetteAiStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "aiModel" TEXT,
    "aiPromptVersion" TEXT,
    "aiValidationJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gazette_stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gazette_story_candidates" (
    "id" TEXT NOT NULL,
    "editionId" TEXT,
    "propertyId" TEXT NOT NULL,
    "sourceFeature" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "storyCategory" "GazetteStoryCategory" NOT NULL,
    "storyTag" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "headlineHint" TEXT,
    "supportingFactsJson" JSONB NOT NULL,
    "urgencyScoreInput" DOUBLE PRECISION,
    "financialImpactEstimate" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION,
    "engagementScore" DOUBLE PRECISION,
    "noveltyScore" DOUBLE PRECISION,
    "compositeScore" DOUBLE PRECISION,
    "noveltyKey" TEXT NOT NULL,
    "firstDetectedAt" TIMESTAMP(3),
    "lastUpdatedAt" TIMESTAMP(3),
    "storyDeadline" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "primaryDeepLink" TEXT NOT NULL,
    "secondaryDeepLink" TEXT,
    "shareSafe" BOOLEAN NOT NULL DEFAULT true,
    "status" "GazetteCandidateStatus" NOT NULL DEFAULT 'ACTIVE',
    "exclusionReason" "GazetteExclusionReason",
    "exclusionDetail" TEXT,
    "selectionRank" INTEGER,
    "rankAdjustmentReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gazette_story_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gazette_selection_traces" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "candidateId" TEXT,
    "propertyId" TEXT NOT NULL,
    "preScore" DOUBLE PRECISION,
    "postScore" DOUBLE PRECISION,
    "finalRank" INTEGER,
    "included" BOOLEAN NOT NULL,
    "exclusionReason" "GazetteExclusionReason",
    "rankAdjustmentReason" TEXT,
    "rankExplanation" TEXT,
    "traceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gazette_selection_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gazette_generation_jobs" (
    "id" TEXT NOT NULL,
    "editionId" TEXT,
    "propertyId" TEXT NOT NULL,
    "stage" "GazetteGenerationStage" NOT NULL,
    "status" "GazetteEditionStatus" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metricsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gazette_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gazette_share_links" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "GazetteShareStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gazette_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gazette_editions_propertyId_weekStart_idx" ON "gazette_editions"("propertyId", "weekStart");

-- CreateIndex
CREATE INDEX "gazette_editions_status_idx" ON "gazette_editions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "gazette_editions_propertyId_weekStart_weekEnd_key" ON "gazette_editions"("propertyId", "weekStart", "weekEnd");

-- CreateIndex
CREATE INDEX "gazette_stories_editionId_rank_idx" ON "gazette_stories"("editionId", "rank");

-- CreateIndex
CREATE INDEX "gazette_stories_propertyId_storyCategory_idx" ON "gazette_stories"("propertyId", "storyCategory");

-- CreateIndex
CREATE INDEX "gazette_stories_entityType_entityId_idx" ON "gazette_stories"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "gazette_story_candidates_propertyId_status_idx" ON "gazette_story_candidates"("propertyId", "status");

-- CreateIndex
CREATE INDEX "gazette_story_candidates_propertyId_noveltyKey_idx" ON "gazette_story_candidates"("propertyId", "noveltyKey");

-- CreateIndex
CREATE INDEX "gazette_story_candidates_editionId_selectionRank_idx" ON "gazette_story_candidates"("editionId", "selectionRank");

-- CreateIndex
CREATE INDEX "gazette_story_candidates_sourceFeature_entityType_entityId_idx" ON "gazette_story_candidates"("sourceFeature", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "gazette_selection_traces_editionId_included_finalRank_idx" ON "gazette_selection_traces"("editionId", "included", "finalRank");

-- CreateIndex
CREATE INDEX "gazette_selection_traces_propertyId_createdAt_idx" ON "gazette_selection_traces"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "gazette_generation_jobs_propertyId_stage_idx" ON "gazette_generation_jobs"("propertyId", "stage");

-- CreateIndex
CREATE INDEX "gazette_generation_jobs_editionId_idx" ON "gazette_generation_jobs"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "gazette_share_links_tokenHash_key" ON "gazette_share_links"("tokenHash");

-- CreateIndex
CREATE INDEX "gazette_share_links_editionId_status_idx" ON "gazette_share_links"("editionId", "status");

-- CreateIndex
CREATE INDEX "gazette_share_links_propertyId_status_idx" ON "gazette_share_links"("propertyId", "status");

-- AddForeignKey
ALTER TABLE "gazette_stories" ADD CONSTRAINT "gazette_stories_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "gazette_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gazette_story_candidates" ADD CONSTRAINT "gazette_story_candidates_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "gazette_editions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gazette_selection_traces" ADD CONSTRAINT "gazette_selection_traces_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "gazette_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gazette_generation_jobs" ADD CONSTRAINT "gazette_generation_jobs_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "gazette_editions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gazette_share_links" ADD CONSTRAINT "gazette_share_links_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "gazette_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
