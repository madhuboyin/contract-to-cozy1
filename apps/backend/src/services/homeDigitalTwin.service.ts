/**
 * HomeDigitalTwinService
 *
 * Orchestrates twin lifecycle: get, init, and refresh.
 * Delegates component derivation to HomeDigitalTwinBuilderService
 * and quality evaluation to HomeDigitalTwinQualityService.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from './analytics';
import { HomeDigitalTwinBuilderService } from './homeDigitalTwinBuilder.service';
import { HomeDigitalTwinQualityService } from './homeDigitalTwinQuality.service';
import { getPlanningContextDecisions } from './planningContext/context';
import { findInFlightRun } from './homeDigitalTwinRunLock';
import { getDisabledComponentTypes, isScenarioComputeDisabled } from '../config/homeDigitalTwinOperationalControls';
import { logger } from '../lib/logger';

const builder = new HomeDigitalTwinBuilderService();
const quality = new HomeDigitalTwinQualityService();

/**
 * Resolve the DIGITAL_TWIN Property Context version on behalf of the property
 * owner. Returns null when the owner cannot be resolved rather than failing
 * the computation — the twin then simply reports an unknown generation context.
 */
async function resolveTwinContextVersion(propertyId: string): Promise<string | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { homeownerProfile: { select: { userId: true } } },
  });
  const userId = property?.homeownerProfile?.userId;
  if (!userId) return null;
  try {
    const planning = await getPlanningContextDecisions(propertyId, userId, 'DIGITAL_TWIN');
    return planning.contextVersion;
  } catch {
    return null;
  }
}

// ============================================================================
// SERIALIZERS
// ============================================================================

function decimalToNumber(d: Prisma.Decimal | null | undefined): number | null {
  if (d == null) return null;
  return Number(d.toString());
}

/**
 * Retries a transient failure once before giving up. buildComponents is
 * transactional and idempotent (a failed attempt rolls back cleanly), so a
 * second attempt is safe to make. This covers real transient failures
 * (a momentary DB blip, a lock timeout) without masking a genuine bug —
 * a deterministic failure just fails twice as fast and still reports the
 * same error. See HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_
 * PLAN.md Slice 7: "Add retry and last-good behavior."
 */
export async function withBoundedRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function buildComponentConfidenceDisclosure(c: ComponentRow): string | null {
  if (c.confidenceScore == null) return null;
  const pct = Math.round(c.confidenceScore * 100);
  const sourceNote = c.sourceType === 'MANUAL'
    ? 'reported in a canonical home record'
    : 'modeled from property data';
  return `Component data confidence: ${pct}% (${sourceNote}). Cost and lifespan estimates may vary.`;
}

function serializeComponent(c: ComponentRow) {
  return {
    id: c.id,
    identityKey: c.identityKey,
    componentType: c.componentType,
    label: c.label,
    status: c.status,
    sourceType: c.sourceType,
    sourceReferenceId: c.sourceReferenceId,
    lifecycleState: c.lifecycleState,
    installYear: c.installYear,
    estimatedAgeYears: c.estimatedAgeYears,
    usefulLifeYears: c.usefulLifeYears,
    conditionScore: c.conditionScore,
    // Legacy compatibility field. Age/service-life depletion is not a
    // calibrated probability and must never leave the API as failure risk.
    failureRiskScore: null,
    replacementCostEstimate: decimalToNumber(c.replacementCostEstimate),
    annualOperatingCostEstimate: decimalToNumber(c.annualOperatingCostEstimate),
    annualMaintenanceCostEstimate: decimalToNumber(c.annualMaintenanceCostEstimate),
    energyImpactScore: c.energyImpactScore,
    resilienceImpactScore: c.resilienceImpactScore,
    confidenceScore: c.confidenceScore,
    isUserConfirmed: c.isUserConfirmed,
    metadata: c.metadata,
    lastModeledAt: c.lastModeledAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    // Phase-3: confidence disclosure
    confidenceDisclosure: buildComponentConfidenceDisclosure(c),
    // Field-level lineage — see HomeTwinProjectedFact. Every entry here
    // carries its own source and fact state; none of it should be presented
    // with more confidence than that state implies.
    projectedFacts: c.projectedFacts.map((f) => ({
      id: f.id,
      fieldName: f.fieldName,
      valueNumeric: f.valueNumeric,
      valueText: f.valueText,
      unit: f.unit,
      factState: f.factState,
      sourceType: f.sourceType,
      sourceRecordType: f.sourceRecordType,
      sourceRecordId: f.sourceRecordId,
      sourceField: f.sourceField,
      observedAt: f.observedAt,
      derivationMethod: f.derivationMethod,
      derivationVersion: f.derivationVersion,
      modelVersion: f.modelVersion,
      sourceVerified: f.sourceVerified,
      confidenceScore: f.confidenceScore,
      conflictGroupId: f.conflictGroupId,
      correctionDestination: f.correctionDestination,
    })),
  };
}

// ============================================================================
// PRISMA SELECT / INCLUDE SHAPES
// ============================================================================

const TWIN_INCLUDE = {
  components: {
    // Retired/superseded components remain in the database for traceability
    // but drop out of the primary projection homeowners see.
    where: { lifecycleState: 'ACTIVE' as const },
    orderBy: { componentType: 'asc' as const },
    include: {
      projectedFacts: true,
    },
  },
  dataQuality: {
    orderBy: { dimension: 'asc' as const },
  },
  scenarios: {
    where: { isArchived: false },
    orderBy: [{ isPinned: 'desc' as const }, { createdAt: 'desc' as const }],
    take: 5,
    include: {
      impacts: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
} satisfies Prisma.HomeDigitalTwinInclude;

type TwinWithRelations = Prisma.HomeDigitalTwinGetPayload<{ include: typeof TWIN_INCLUDE }>;

type ComponentRow = TwinWithRelations['components'][number];

function buildTwinConfidenceDisclosure(twin: TwinWithRelations): string | null {
  if (twin.confidenceScore == null && twin.completenessScore == null) return null;
  const confPct = twin.confidenceScore != null ? Math.round(twin.confidenceScore * 100) : null;
  const compPct = twin.completenessScore != null ? Math.round(twin.completenessScore * 100) : null;
  const parts: string[] = [];
  if (confPct != null) parts.push(`overall confidence ${confPct}%`);
  if (compPct != null) parts.push(`data completeness ${compPct}%`);
  return `Digital twin accuracy — ${parts.join(', ')}. Components without homeowner confirmation use heuristic estimates.`;
}

function serializeTwin(twin: TwinWithRelations, needsRecompute: boolean = false) {
  return {
    id: twin.id,
    propertyId: twin.propertyId,
    status: twin.status,
    version: twin.version,
    completenessScore: twin.completenessScore,
    confidenceScore: twin.confidenceScore,
    lastComputedAt: twin.lastComputedAt,
    lastSyncedAt: twin.lastSyncedAt,
    notes: twin.notes,
    createdAt: twin.createdAt,
    updatedAt: twin.updatedAt,
    // Property Context version the projection was computed from.
    contextVersion: twin.contextVersion ?? null,
    // Last successful build/refresh — preserved even after a failed run, so
    // this always reflects real projection freshness rather than the most
    // recent attempt.
    lastGoodComputedAt: twin.lastGoodComputedAt ?? null,
    lastGoodContextVersion: twin.lastGoodContextVersion ?? null,
    staleReason: twin.staleReason ?? null,
    // True when the property profile, inventory, or risk report has changed
    // since this projection was last built — a cheap dependency-fingerprint
    // comparison, not a full rebuild (see
    // HomeDigitalTwinBuilderService.getCurrentDependencyFingerprint). Only
    // computed on a plain read (getTwin); always false right after a build.
    needsRecompute,
    components: twin.components.map(serializeComponent),
    dataQuality: twin.dataQuality,
    recentScenarios: twin.scenarios,
    // Phase-3: confidence disclosure
    confidenceDisclosure: buildTwinConfidenceDisclosure(twin),
  };
}

// ============================================================================
// SERVICE
// ============================================================================

export class HomeDigitalTwinService {
  // ── Get twin ─────────────────────────────────────────────────────────────────
  async getTwin(propertyId: string) {
    const twin = await prisma.homeDigitalTwin.findUnique({
      where: { propertyId },
      include: TWIN_INCLUDE,
    });

    if (!twin) {
      throw new APIError(
        'Digital twin not found for this property. Use /init to create one.',
        404,
        'TWIN_NOT_FOUND',
      );
    }

    // Analytics: digital twin viewed
    analyticsEmitter.track({
      eventType: AnalyticsEvent.DIGITAL_TWIN_VIEWED,
      propertyId,
      moduleKey: AnalyticsModule.DIGITAL_TWIN,
      featureKey: AnalyticsFeature.DIGITAL_TWIN,
      metadataJson: { twinId: twin.id, status: twin.status },
    });

    // Dependency-driven recompute signal: cheap, read-only — never blocks
    // the primary twin read if it fails.
    let needsRecompute = false;
    if (twin.dependencyFingerprint) {
      try {
        const currentFingerprint = await builder.getCurrentDependencyFingerprint(propertyId);
        needsRecompute = currentFingerprint !== twin.dependencyFingerprint;
      } catch (err) {
        logger.warn({ err }, `[HomeDigitalTwin] needsRecompute check failed for property=${propertyId}`);
      }
    }

    return serializeTwin(twin, needsRecompute);
  }

  // ── Init twin ────────────────────────────────────────────────────────────────
  async initTwin(propertyId: string, forceRefresh: boolean = false) {
    // Verify property exists
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) {
      throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
    }

    // Return existing twin if already present and not forcing refresh
    const existing = await prisma.homeDigitalTwin.findUnique({
      where: { propertyId },
      select: { id: true, status: true },
    });

    if (existing && !forceRefresh) {
      const twin = await prisma.homeDigitalTwin.findUniqueOrThrow({
        where: { propertyId },
        include: TWIN_INCLUDE,
      });
      return serializeTwin(twin);
    }

    if (existing) {
      const inFlight = await findInFlightRun(existing.id, 'INITIAL_BUILD');
      if (inFlight) {
        throw new APIError(
          'A build is already in progress for this home. Please wait for it to finish.',
          409,
          'COMPUTATION_IN_PROGRESS',
        );
      }
    }

    // Create a computation run for observability
    const twin = existing
      ? await prisma.homeDigitalTwin.update({
          where: { propertyId },
          data: { status: 'DRAFT', lastSyncedAt: new Date() },
          include: TWIN_INCLUDE,
        })
      : await prisma.homeDigitalTwin.create({
          data: {
            propertyId,
            status: 'DRAFT',
            version: 1,
          },
          include: TWIN_INCLUDE,
        });

    const run = await prisma.homeTwinComputationRun.create({
      data: {
        digitalTwinId: twin.id,
        runType: 'INITIAL_BUILD',
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      logger.info(`[HomeDigitalTwin] init — building components for property=${propertyId} twin=${twin.id}`);

      // Build components from existing property data. buildComponents is
      // transactional — a failure here rolls back rather than leaving a
      // partially-rebuilt projection, so the twin update below never runs
      // against a half-updated component set. Retried once for transient
      // failures (see withBoundedRetry).
      const { dependencyFingerprint } = await withBoundedRetry(() => builder.buildComponents(propertyId, twin.id));

      // Evaluate data quality and update aggregate scores
      await quality.evaluate(twin.id, propertyId);

      // Mark twin as ACTIVE. The twin is a projection of canonical property
      // records; stamp the Property Context version it was computed from so
      // staleness against current context is detectable. lastGoodComputedAt
      // only advances on success — a later failed run cannot regress it.
      const computedContextVersion = await resolveTwinContextVersion(propertyId);
      const now = new Date();
      await prisma.homeDigitalTwin.update({
        where: { id: twin.id },
        data: {
          status: 'ACTIVE',
          lastSyncedAt: now,
          lastComputedAt: now,
          contextVersion: computedContextVersion,
          dependencyFingerprint,
          lastGoodComputedAt: now,
          lastGoodContextVersion: computedContextVersion,
          staleReason: null,
          ...(existing ? { version: { increment: 1 } } : {}),
        },
      });

      // Mark run succeeded
      await prisma.homeTwinComputationRun.update({
        where: { id: run.id },
        data: { status: 'SUCCEEDED', completedAt: new Date() },
      });

      // Analytics: digital twin initialized. Initializing a projection is
      // exposure, not homeowner value — it must not count as property
      // activation (see
      // HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md Slice 0).
      analyticsEmitter.featureOpened({
        propertyId,
        moduleKey: AnalyticsModule.DIGITAL_TWIN,
        featureKey: AnalyticsFeature.DIGITAL_TWIN,
        metadataJson: { twinId: twin.id, isNewTwin: !existing },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      // Mark run failed — don't swallow the error
      await prisma.homeTwinComputationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage,
        },
      });
      // Record why the projection is stale without touching
      // lastGoodComputedAt/lastGoodContextVersion — the last good state
      // (if any) stays exactly as it was.
      await prisma.homeDigitalTwin.update({
        where: { id: twin.id },
        data: { staleReason: `Build failed: ${errorMessage}` },
      });
      logger.error({ err }, `[HomeDigitalTwin] init failed for property=${propertyId}`);
      throw err;
    }

    const updated = await prisma.homeDigitalTwin.findUniqueOrThrow({
      where: { propertyId },
      include: TWIN_INCLUDE,
    });

    logger.info(`[HomeDigitalTwin] init complete — property=${propertyId} status=ACTIVE`);
    return serializeTwin(updated);
  }

  // ── Refresh twin ─────────────────────────────────────────────────────────────
  async refreshTwin(propertyId: string) {
    const existing = await prisma.homeDigitalTwin.findUnique({
      where: { propertyId },
      select: { id: true, dependencyFingerprint: true },
    });

    if (!existing) {
      throw new APIError(
        'Digital twin not found. Use /init to create one first.',
        404,
        'TWIN_NOT_FOUND',
      );
    }

    const inFlight = await findInFlightRun(existing.id, 'REFRESH');
    if (inFlight) {
      throw new APIError(
        'A refresh is already in progress for this home. Please wait for it to finish.',
        409,
        'COMPUTATION_IN_PROGRESS',
      );
    }

    const run = await prisma.homeTwinComputationRun.create({
      data: {
        digitalTwinId: existing.id,
        runType: 'REFRESH',
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      logger.info(`[HomeDigitalTwin] refresh — property=${propertyId} twin=${existing.id}`);
      // Transactional — a failure rolls back rather than leaving a
      // partially-rebuilt projection. Retried once for transient failures.
      const { dependencyFingerprint } = await withBoundedRetry(() => builder.buildComponents(propertyId, existing.id));
      await quality.evaluate(existing.id, propertyId);

      const refreshedContextVersion = await resolveTwinContextVersion(propertyId);
      const now = new Date();
      if (
        existing.dependencyFingerprint &&
        existing.dependencyFingerprint !== dependencyFingerprint
      ) {
        await prisma.homeTwinScenario.updateMany({
          where: {
            digitalTwinId: existing.id,
            status: 'COMPUTED',
            OR: [
              { baselineDependencyFingerprint: null },
              { baselineDependencyFingerprint: { not: dependencyFingerprint } },
            ],
          },
          data: {
            staleAt: now,
            staleReason: 'Home facts changed after this comparison was computed.',
          },
        });
      }
      await prisma.homeDigitalTwin.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          lastSyncedAt: now,
          lastComputedAt: now,
          contextVersion: refreshedContextVersion,
          dependencyFingerprint,
          lastGoodComputedAt: now,
          lastGoodContextVersion: refreshedContextVersion,
          staleReason: null,
          version: { increment: 1 },
        },
      });

      await prisma.homeTwinComputationRun.update({
        where: { id: run.id },
        data: { status: 'SUCCEEDED', completedAt: new Date() },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await prisma.homeTwinComputationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage,
        },
      });
      // Preserve the last good projection — do not touch
      // lastGoodComputedAt/lastGoodContextVersion on failure.
      await prisma.homeDigitalTwin.update({
        where: { id: existing.id },
        data: { staleReason: `Refresh failed: ${errorMessage}` },
      });
      logger.error({ err }, `[HomeDigitalTwin] refresh failed for property=${propertyId}`);
      throw err;
    }

    const updated = await prisma.homeDigitalTwin.findUniqueOrThrow({
      where: { propertyId },
      include: TWIN_INCLUDE,
    });

    logger.info(`[HomeDigitalTwin] refresh complete — property=${propertyId}`);
    return serializeTwin(updated);
  }

  // ── Operator diagnostics ─────────────────────────────────────────────────────
  /**
   * Aggregate computation health for operators — never surfaced to
   * homeowners (see HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_
   * PLAN.md Slice 7: "operator diagnostics without exposing technical noise
   * to homeowners"). No per-property drill-down here; a specific property's
   * own state is already fully visible via GET twin (staleReason,
   * needsRecompute) to whoever has access to that property.
   */
  async getDiagnostics(sinceHours: number = 24) {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    const [runsByTypeAndStatus, staleTwinCount, totalTwinCount, recentFailures] = await Promise.all([
      // completedAt - startedAt isn't directly aggregatable in Prisma;
      // duration is computed per-row below for failures only, where it's
      // most useful for diagnosing a specific incident.
      prisma.homeTwinComputationRun.groupBy({
        by: ['runType', 'status'],
        where: { startedAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.homeDigitalTwin.count({ where: { staleReason: { not: null } } }),
      prisma.homeDigitalTwin.count(),
      prisma.homeTwinComputationRun.findMany({
        where: { startedAt: { gte: since }, status: 'FAILED' },
        select: { id: true, digitalTwinId: true, runType: true, errorMessage: true, startedAt: true, completedAt: true },
        orderBy: { startedAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      windowHours: sinceHours,
      runCounts: runsByTypeAndStatus.map((r) => ({
        runType: r.runType,
        status: r.status,
        count: r._count._all,
      })),
      staleTwinCount,
      totalTwinCount,
      recentFailures: recentFailures.map((f) => ({
        id: f.id,
        digitalTwinId: f.digitalTwinId,
        runType: f.runType,
        errorMessage: f.errorMessage,
        startedAt: f.startedAt,
        durationMs: f.completedAt ? f.completedAt.getTime() - f.startedAt.getTime() : null,
      })),
      operationalControls: {
        disabledComponentTypes: getDisabledComponentTypes(),
        scenarioComputeDisabled: isScenarioComputeDisabled(),
      },
    };
  }
}
