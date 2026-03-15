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
import { maybeMarkPropertyActivated } from './property.service';

const builder = new HomeDigitalTwinBuilderService();
const quality = new HomeDigitalTwinQualityService();

// ============================================================================
// SERIALIZERS
// ============================================================================

function decimalToNumber(d: Prisma.Decimal | null | undefined): number | null {
  if (d == null) return null;
  return Number(d.toString());
}

function serializeComponent(c: ComponentRow) {
  return {
    id: c.id,
    componentType: c.componentType,
    label: c.label,
    status: c.status,
    sourceType: c.sourceType,
    sourceReferenceId: c.sourceReferenceId,
    installYear: c.installYear,
    estimatedAgeYears: c.estimatedAgeYears,
    usefulLifeYears: c.usefulLifeYears,
    conditionScore: c.conditionScore,
    failureRiskScore: c.failureRiskScore,
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
  };
}

// ============================================================================
// PRISMA SELECT / INCLUDE SHAPES
// ============================================================================

const TWIN_INCLUDE = {
  components: {
    orderBy: { componentType: 'asc' as const },
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

function serializeTwin(twin: TwinWithRelations) {
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
    components: twin.components.map(serializeComponent),
    dataQuality: twin.dataQuality,
    recentScenarios: twin.scenarios,
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

    return serializeTwin(twin);
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
      console.log(`[HomeDigitalTwin] init — building components for property=${propertyId} twin=${twin.id}`);

      // Build components from existing property data
      await builder.buildComponents(propertyId, twin.id);

      // Evaluate data quality and update aggregate scores
      await quality.evaluate(twin.id, propertyId);

      // Mark twin as ACTIVE
      await prisma.homeDigitalTwin.update({
        where: { id: twin.id },
        data: {
          status: 'ACTIVE',
          lastSyncedAt: new Date(),
          ...(existing ? { version: { increment: 1 } } : {}),
        },
      });

      // Mark run succeeded
      await prisma.homeTwinComputationRun.update({
        where: { id: run.id },
        data: { status: 'SUCCEEDED', completedAt: new Date() },
      });

      // Analytics: digital twin initialized/activated
      analyticsEmitter.featureOpened({
        propertyId,
        moduleKey: AnalyticsModule.DIGITAL_TWIN,
        featureKey: AnalyticsFeature.DIGITAL_TWIN,
        metadataJson: { twinId: twin.id, isNewTwin: !existing },
      });

      // For new twins, digital twin initialization is a strong activation signal.
      // This is idempotent — marks ACTIVATED only if not already set.
      if (!existing) {
        void maybeMarkPropertyActivated(propertyId, null);
      }
    } catch (err) {
      // Mark run failed — don't swallow the error
      await prisma.homeTwinComputationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        },
      });
      console.error(`[HomeDigitalTwin] init failed for property=${propertyId}`, err);
      throw err;
    }

    const updated = await prisma.homeDigitalTwin.findUniqueOrThrow({
      where: { propertyId },
      include: TWIN_INCLUDE,
    });

    console.log(`[HomeDigitalTwin] init complete — property=${propertyId} status=ACTIVE`);
    return serializeTwin(updated);
  }

  // ── Refresh twin ─────────────────────────────────────────────────────────────
  async refreshTwin(propertyId: string) {
    const existing = await prisma.homeDigitalTwin.findUnique({
      where: { propertyId },
      select: { id: true },
    });

    if (!existing) {
      throw new APIError(
        'Digital twin not found. Use /init to create one first.',
        404,
        'TWIN_NOT_FOUND',
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
      console.log(`[HomeDigitalTwin] refresh — property=${propertyId} twin=${existing.id}`);
      await builder.buildComponents(propertyId, existing.id);
      await quality.evaluate(existing.id, propertyId);

      await prisma.homeDigitalTwin.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          lastSyncedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await prisma.homeTwinComputationRun.update({
        where: { id: run.id },
        data: { status: 'SUCCEEDED', completedAt: new Date() },
      });
    } catch (err) {
      await prisma.homeTwinComputationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        },
      });
      console.error(`[HomeDigitalTwin] refresh failed for property=${propertyId}`, err);
      throw err;
    }

    const updated = await prisma.homeDigitalTwin.findUniqueOrThrow({
      where: { propertyId },
      include: TWIN_INCLUDE,
    });

    console.log(`[HomeDigitalTwin] refresh complete — property=${propertyId}`);
    return serializeTwin(updated);
  }
}
