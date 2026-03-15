import {
  HiddenAssetCategory,
  HiddenAssetConfidenceLevel,
  HiddenAssetRegionType,
  Prisma,
  PropertyHiddenAssetMatchStatus,
  PropertyHiddenAssetScanRunStatus,
} from '@prisma/client';
// Prisma is used for GetPayload generic types and Decimal/JsonValue helpers
import { prisma } from '../lib/prisma';
import {
  buildPropertyAttributeMap,
  evaluateProgram,
  getEligibilityLabel,
  getFreshnessNote,
} from './hiddenAssets/ruleEngine';
import {
  HiddenAssetMatchDTO,
  HiddenAssetMatchFilters,
  HiddenAssetMatchListDTO,
  HiddenAssetMatchSummaryDTO,
  HiddenAssetProgramDetailDTO,
  ProgramEvalResult,
  RefreshResultDTO,
  RegionPair,
  UpdateMatchStatusInput,
} from './hiddenAssets/types';

// ============================================================================
// SERIALIZERS
// ============================================================================

type MatchWithProgram = Prisma.PropertyHiddenAssetMatchGetPayload<{
  include: { program: true };
}>;

function decimalToNumber(d: Prisma.Decimal | null | undefined): number | null {
  if (d == null) return null;
  return Number(d.toString());
}

function safeJsonToStringArray(json: Prisma.JsonValue | null | undefined): string[] | null {
  if (json == null) return null;
  if (Array.isArray(json)) return json.map(String);
  return null;
}

function serializeMatch(row: MatchWithProgram): HiddenAssetMatchDTO {
  const p = row.program;
  return {
    id: row.id,
    propertyId: row.propertyId,
    programId: row.programId,
    programName: p.name,
    category: p.category,
    description: p.description ?? null,
    benefitType: p.benefitType,
    estimatedValue: decimalToNumber(row.estimatedValue),
    estimatedValueMin: decimalToNumber(row.estimatedValueMin),
    estimatedValueMax: decimalToNumber(row.estimatedValueMax),
    currency: p.currency,
    confidenceLevel: row.confidenceLevel,
    eligibilityLabel: getEligibilityLabel(row.confidenceLevel),
    status: row.status,
    matchedRuleCount: row.matchedRuleCount ?? null,
    totalRuleCount: row.totalRuleCount ?? null,
    matchReasons: safeJsonToStringArray(row.matchReasons),
    sourceUrl: p.sourceUrl ?? null,
    sourceLabel: p.sourceLabel ?? null,
    eligibilityNotes: p.eligibilityNotes ?? null,
    lastVerifiedAt: p.lastVerifiedAt ? p.lastVerifiedAt.toISOString() : null,
    expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
    isProgramActive: p.isActive,
    freshnessNote: getFreshnessNote(p.lastVerifiedAt),
    lastEvaluatedAt: row.lastEvaluatedAt.toISOString(),
    firstDetectedAt: row.firstDetectedAt.toISOString(),
    dismissedAt: row.dismissedAt ? row.dismissedAt.toISOString() : null,
    claimedAt: row.claimedAt ? row.claimedAt.toISOString() : null,
  };
}

function serializeProgramDetail(
  p: Prisma.HiddenAssetProgramGetPayload<Record<string, never>>,
): HiddenAssetProgramDetailDTO {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    description: p.description ?? null,
    regionType: p.regionType,
    regionValue: p.regionValue,
    benefitType: p.benefitType,
    benefitEstimateMin: decimalToNumber(p.benefitEstimateMin),
    benefitEstimateMax: decimalToNumber(p.benefitEstimateMax),
    currency: p.currency,
    sourceUrl: p.sourceUrl ?? null,
    sourceLabel: p.sourceLabel ?? null,
    eligibilityNotes: p.eligibilityNotes ?? null,
    isActive: p.isActive,
    expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
    lastVerifiedAt: p.lastVerifiedAt ? p.lastVerifiedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function buildSummary(
  matches: HiddenAssetMatchDTO[],
  lastScanAt: Date | null,
): HiddenAssetMatchSummaryDTO {
  const categoryCounts: Partial<Record<HiddenAssetCategory, number>> = {};
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const m of matches) {
    if (m.confidenceLevel === HiddenAssetConfidenceLevel.HIGH) high++;
    else if (m.confidenceLevel === HiddenAssetConfidenceLevel.MEDIUM) medium++;
    else low++;

    categoryCounts[m.category] = (categoryCounts[m.category] ?? 0) + 1;
  }

  return {
    totalMatches: matches.length,
    highConfidenceCount: high,
    mediumConfidenceCount: medium,
    lowConfidenceCount: low,
    categoryCounts,
    lastScanAt: lastScanAt ? lastScanAt.toISOString() : null,
  };
}

// ============================================================================
// PROPERTY ACCESS GUARD
// ============================================================================

async function assertPropertyForUser(
  propertyId: string,
  userId: string,
) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, homeownerProfile: { userId } },
    select: {
      id: true,
      homeownerProfileId: true,
      state: true,
      city: true,
      zipCode: true,
      yearBuilt: true,
      propertySize: true,
      propertyType: true,
      ownershipType: true,
      heatingType: true,
      waterHeaterType: true,
      roofType: true,
      roofReplacementYear: true,
      hasSecuritySystem: true,
      hasIrrigation: true,
      hasSumpPumpBackup: true,
      primaryHeatingFuel: true,
      lastAppraisedValue: true,
      hasSmokeDetectors: true,
      hasCoDetectors: true,
      hasFireExtinguisher: true,
      hasDrainageIssues: true,
    },
  });

  if (!property) {
    throw new Error('Property not found or access denied.');
  }

  return property;
}

// ============================================================================
// REGION KEY DERIVATION
// ============================================================================

function deriveRegionPairs(property: {
  state: string;
  city: string;
  zipCode: string;
}): RegionPair[] {
  const pairs: RegionPair[] = [];

  // Always include country-level programs
  pairs.push({ regionType: HiddenAssetRegionType.COUNTRY, regionValue: 'USA' });

  if (property.state) {
    pairs.push({ regionType: HiddenAssetRegionType.STATE, regionValue: property.state });
  }
  if (property.city) {
    pairs.push({ regionType: HiddenAssetRegionType.CITY, regionValue: property.city });
  }
  if (property.zipCode) {
    pairs.push({ regionType: HiddenAssetRegionType.ZIP, regionValue: property.zipCode });
  }

  return pairs;
}

// ============================================================================
// CANDIDATE PROGRAM FETCHER
// ============================================================================

async function fetchCandidatePrograms(regionPairs: RegionPair[]) {
  if (regionPairs.length === 0) return [];

  const now = new Date();

  return prisma.hiddenAssetProgram.findMany({
    where: {
      isActive: true,
      AND: [
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        {
          OR: regionPairs.map(({ regionType, regionValue }) => ({
            regionType,
            regionValue,
          })),
        },
      ],
    },
    include: {
      rules: { orderBy: { sortOrder: 'asc' } },
    },
  });
}

// ============================================================================
// MATCH FETCH WITH FILTERS
// ============================================================================

const USER_VISIBLE_STATUSES: PropertyHiddenAssetMatchStatus[] = [
  PropertyHiddenAssetMatchStatus.DETECTED,
  PropertyHiddenAssetMatchStatus.VIEWED,
];

async function fetchMatchesForProperty(
  propertyId: string,
  filters: HiddenAssetMatchFilters,
): Promise<MatchWithProgram[]> {
  const statusFilter: PropertyHiddenAssetMatchStatus[] = [...USER_VISIBLE_STATUSES];

  if (filters.includeDismissed) {
    statusFilter.push(PropertyHiddenAssetMatchStatus.DISMISSED);
  }
  if (filters.includeExpired) {
    statusFilter.push(PropertyHiddenAssetMatchStatus.EXPIRED);
  }

  // If a specific status is requested, use only that
  const statusCondition = filters.status
    ? { status: filters.status }
    : { status: { in: statusFilter } };

  return prisma.propertyHiddenAssetMatch.findMany({
    where: {
      propertyId,
      ...statusCondition,
      ...(filters.confidenceLevel ? { confidenceLevel: filters.confidenceLevel } : {}),
      ...(filters.category ? { program: { category: filters.category } } : {}),
    },
    include: { program: true },
    orderBy: [{ confidenceLevel: 'asc' }, { lastEvaluatedAt: 'desc' }],
  });
}

// ============================================================================
// LAST SCAN RUN FETCH
// ============================================================================

async function getLastCompletedScanAt(propertyId: string): Promise<Date | null> {
  const run = await prisma.propertyHiddenAssetScanRun.findFirst({
    where: {
      propertyId,
      status: PropertyHiddenAssetScanRunStatus.COMPLETED,
    },
    orderBy: { completedAt: 'desc' },
    select: { completedAt: true },
  });
  return run?.completedAt ?? null;
}

// ============================================================================
// INTERNAL PROPERTY FETCH (no ownership check — for background/system use)
// ============================================================================

type PropertyScanInput = Awaited<ReturnType<typeof assertPropertyForUser>>;

async function fetchPropertyForScan(propertyId: string): Promise<PropertyScanInput | null> {
  return prisma.property.findFirst({
    where: { id: propertyId },
    select: {
      id: true,
      homeownerProfileId: true,
      state: true,
      city: true,
      zipCode: true,
      yearBuilt: true,
      propertySize: true,
      propertyType: true,
      ownershipType: true,
      heatingType: true,
      waterHeaterType: true,
      roofType: true,
      roofReplacementYear: true,
      hasSecuritySystem: true,
      hasIrrigation: true,
      hasSumpPumpBackup: true,
      primaryHeatingFuel: true,
      lastAppraisedValue: true,
      hasSmokeDetectors: true,
      hasCoDetectors: true,
      hasFireExtinguisher: true,
      hasDrainageIssues: true,
    },
  });
}

// ============================================================================
// CORE SCAN EXECUTION (shared by user-facing and internal paths)
// ============================================================================

async function executePropertyScan(
  propertyId: string,
  property: PropertyScanInput,
): Promise<RefreshResultDTO> {
  const startedAt = Date.now();

  const scanRun = await prisma.propertyHiddenAssetScanRun.create({
    data: {
      propertyId,
      status: PropertyHiddenAssetScanRunStatus.RUNNING,
      startedAt: new Date(),
    },
  });

  try {
    const regionPairs = deriveRegionPairs(property);
    const candidatePrograms = await fetchCandidatePrograms(regionPairs);

    const attrs = buildPropertyAttributeMap(property);
    const now = new Date();

    // Evaluate each candidate program
    const evalResults: ProgramEvalResult[] = [];
    for (const prog of candidatePrograms) {
      const engineInput = {
        id: prog.id,
        benefitEstimateMin: decimalToNumber(prog.benefitEstimateMin),
        benefitEstimateMax: decimalToNumber(prog.benefitEstimateMax),
        rules: prog.rules,
      };
      const result = evaluateProgram(attrs, engineInput, {
        category: prog.category,
        lastVerifiedAt: prog.lastVerifiedAt,
      });
      evalResults.push(result);
    }

    const matchedResults = evalResults.filter((r) => r.matched && r.confidenceLevel !== null);
    const matchedProgramIds = new Set(matchedResults.map((r) => r.programId));

    // Fetch existing matches to preserve user-set statuses
    const existingMatches = await prisma.propertyHiddenAssetMatch.findMany({
      where: { propertyId },
      select: { id: true, programId: true, status: true },
    });
    const existingByProgramId = new Map(existingMatches.map((m) => [m.programId, m]));

    // Upsert matched programs
    for (const result of matchedResults) {
      const existing = existingByProgramId.get(result.programId);
      const preserveStatus =
        existing?.status === PropertyHiddenAssetMatchStatus.DISMISSED ||
        existing?.status === PropertyHiddenAssetMatchStatus.CLAIMED;

      await prisma.propertyHiddenAssetMatch.upsert({
        where: {
          propertyId_programId: {
            propertyId,
            programId: result.programId,
          },
        },
        update: {
          confidenceLevel: result.confidenceLevel!,
          estimatedValueMin: result.estimatedValueMin ?? null,
          estimatedValueMax: result.estimatedValueMax ?? null,
          matchedRuleCount: result.matchedRuleCount,
          totalRuleCount: result.totalRuleCount,
          matchReasons: result.matchReasons,
          lastEvaluatedAt: now,
          // Only update status if the user hasn't explicitly acted on this match
          ...(preserveStatus ? {} : { status: PropertyHiddenAssetMatchStatus.DETECTED }),
        },
        create: {
          propertyId,
          programId: result.programId,
          confidenceLevel: result.confidenceLevel!,
          estimatedValueMin:
            result.estimatedValueMin != null ? result.estimatedValueMin : undefined,
          estimatedValueMax:
            result.estimatedValueMax != null ? result.estimatedValueMax : undefined,
          matchedRuleCount: result.matchedRuleCount,
          totalRuleCount: result.totalRuleCount,
          matchReasons: result.matchReasons,
          status: PropertyHiddenAssetMatchStatus.DETECTED,
          lastEvaluatedAt: now,
          firstDetectedAt: now,
        },
      });
    }

    // Mark prior matches whose programs are no longer in the active candidate set
    let matchesExpired = 0;
    let matchesInactivated = 0;

    for (const existing of existingMatches) {
      if (
        existing.status === PropertyHiddenAssetMatchStatus.DISMISSED ||
        existing.status === PropertyHiddenAssetMatchStatus.CLAIMED
      ) {
        continue; // Never auto-change user-set terminal statuses
      }

      if (!matchedProgramIds.has(existing.programId)) {
        const prog = await prisma.hiddenAssetProgram.findUnique({
          where: { id: existing.programId },
          select: { isActive: true, expiresAt: true },
        });

        if (!prog) continue;

        const isExpired = prog.expiresAt != null && prog.expiresAt <= now;
        const isInactive = !prog.isActive;

        if (isExpired) {
          await prisma.propertyHiddenAssetMatch.update({
            where: { id: existing.id },
            data: { status: PropertyHiddenAssetMatchStatus.EXPIRED, lastEvaluatedAt: now },
          });
          matchesExpired++;
        } else if (isInactive) {
          await prisma.propertyHiddenAssetMatch.update({
            where: { id: existing.id },
            data: { status: PropertyHiddenAssetMatchStatus.INACTIVE, lastEvaluatedAt: now },
          });
          matchesInactivated++;
        }
      }
    }

    // Complete the scan run
    await prisma.propertyHiddenAssetScanRun.update({
      where: { id: scanRun.id },
      data: {
        status: PropertyHiddenAssetScanRunStatus.COMPLETED,
        completedAt: new Date(),
        programsEvaluated: candidatePrograms.length,
        matchesFound: matchedResults.length,
      },
    });

    // Fetch fresh match list for response
    const freshMatches = await prisma.propertyHiddenAssetMatch.findMany({
      where: {
        propertyId,
        status: { in: [PropertyHiddenAssetMatchStatus.DETECTED, PropertyHiddenAssetMatchStatus.VIEWED] },
      },
      include: { program: true },
      orderBy: [{ confidenceLevel: 'asc' }, { lastEvaluatedAt: 'desc' }],
    });

    const durationMs = Date.now() - startedAt;
    console.log(
      `[HiddenAssets] Scan complete for property ${propertyId}: ` +
        `evaluated=${candidatePrograms.length} matched=${matchedResults.length} ` +
        `expired=${matchesExpired} inactivated=${matchesInactivated} duration=${durationMs}ms`,
    );

    return {
      scanRunId: scanRun.id,
      propertyId,
      programsEvaluated: candidatePrograms.length,
      matchesFound: matchedResults.length,
      matchesExpired,
      matchesInactivated,
      durationMs,
      matches: freshMatches.map(serializeMatch),
    };
  } catch (err) {
    await prisma.propertyHiddenAssetScanRun.update({
      where: { id: scanRun.id },
      data: {
        status: PropertyHiddenAssetScanRunStatus.FAILED,
        completedAt: new Date(),
        notes: err instanceof Error ? err.message : String(err),
      },
    });
    console.error(`[HiddenAssets] Scan failed for property ${propertyId}:`, err);
    throw err;
  }
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class HiddenAssetService {
  /**
   * Returns all visible hidden asset matches for a property, with filters.
   */
  async getMatchesForProperty(
    propertyId: string,
    userId: string,
    filters: HiddenAssetMatchFilters = {},
  ): Promise<HiddenAssetMatchListDTO> {
    await assertPropertyForUser(propertyId, userId);

    const rows = await fetchMatchesForProperty(propertyId, filters);
    const lastScanAt = await getLastCompletedScanAt(propertyId);
    const matches = rows.map(serializeMatch);

    return {
      propertyId,
      matches,
      summary: buildSummary(matches, lastScanAt),
    };
  }

  /**
   * Runs a full detection scan for a property, verifying userId ownership.
   * Used by the user-facing POST /refresh endpoint.
   */
  async refreshMatchesForProperty(
    propertyId: string,
    userId: string,
  ): Promise<RefreshResultDTO> {
    const property = await assertPropertyForUser(propertyId, userId);
    return executePropertyScan(propertyId, property);
  }

  /**
   * Runs a full detection scan without a userId ownership check.
   * Used by background jobs, queue workers, and system-triggered scans.
   */
  async refreshMatchesInternal(propertyId: string): Promise<RefreshResultDTO> {
    const property = await fetchPropertyForScan(propertyId);
    if (!property) {
      throw new Error(`Property ${propertyId} not found for internal scan.`);
    }
    return executePropertyScan(propertyId, property);
  }

  /**
   * Returns the full detail for a single hidden asset program.
   * Access is limited to authenticated users; no property-scope required
   * (programs are global registry entries, not property-specific).
   */
  async getProgramDetail(programId: string): Promise<{ program: HiddenAssetProgramDetailDTO }> {
    const program = await prisma.hiddenAssetProgram.findUnique({
      where: { id: programId },
    });

    if (!program) {
      throw new Error('Program not found.');
    }

    return { program: serializeProgramDetail(program) };
  }

  /**
   * Updates the user-facing status of a specific match (VIEWED, DISMISSED, CLAIMED).
   * Verifies the match belongs to a property the requesting user owns.
   */
  async updateMatchStatus(
    matchId: string,
    input: UpdateMatchStatusInput,
    userId: string,
  ): Promise<{ match: HiddenAssetMatchDTO }> {
    // Verify the match belongs to the user
    const existing = await prisma.propertyHiddenAssetMatch.findFirst({
      where: {
        id: matchId,
        property: { homeownerProfile: { userId } },
      },
      include: { program: true },
    });

    if (!existing) {
      throw new Error('Match not found or access denied.');
    }

    const now = new Date();
    const updated = await prisma.propertyHiddenAssetMatch.update({
      where: { id: matchId },
      data: {
        status: input.status,
        dismissedAt:
          input.status === PropertyHiddenAssetMatchStatus.DISMISSED ? now : existing.dismissedAt,
        claimedAt:
          input.status === PropertyHiddenAssetMatchStatus.CLAIMED ? now : existing.claimedAt,
      },
      include: { program: true },
    });

    return { match: serializeMatch(updated) };
  }
}
