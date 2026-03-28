import {
  HomeRiskEventSeverity,
  HomeRiskReplayStatus,
  HomeRiskReplayWindowType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  evaluateReplayEvent,
  HOME_RISK_REPLAY_ENGINE_VERSION,
  ReplayCandidateEvent,
  ReplayMatchedSystem,
  ReplayPropertyContext,
  ReplayPropertySystemContext,
  resolveReplayWindow,
} from './homeRiskReplay.engine';
import {
  mergeTimelineProjectionEntries,
  timelineEntryFromEvent,
  timelineEntryFromSignal,
} from './eventSignalProjection.service';
import { SharedSignalKey, signalService } from './signal.service';
import { PreferenceProfileService } from './preferenceProfile.service';

type JsonRecord = Record<string, unknown>;

type ReplayRunWithMatches = Prisma.HomeRiskReplayRunGetPayload<{
  include: {
    eventMatches: {
      include: {
        homeRiskEvent: true;
      };
    };
  };
}>;

type GenerateReplayInput = {
  windowType: HomeRiskReplayWindowType;
  windowStart?: string | null;
  windowEnd?: string | null;
  forceRegenerate?: boolean;
};

type ListRunsQuery = {
  limit?: number;
};

const PROPERTY_CONTEXT_SELECT = {
  id: true,
  address: true,
  city: true,
  state: true,
  zipCode: true,
  propertyType: true,
  propertySize: true,
  yearBuilt: true,
  foundationType: true,
  hasIrrigation: true,
  hasDrainageIssues: true,
  hasSumpPumpBackup: true,
  hasSecondaryHeat: true,
  electricalPanelAge: true,
  primaryHeatingFuel: true,
  heatingType: true,
  coolingType: true,
  waterHeaterType: true,
  roofType: true,
  hvacInstallYear: true,
  waterHeaterInstallYear: true,
  roofReplacementYear: true,
  homeAssets: {
    select: {
      id: true,
      assetType: true,
      installationYear: true,
    },
  },
  inventoryItems: {
    select: {
      id: true,
      name: true,
      category: true,
      homeAssetId: true,
      installedOn: true,
    },
  },
} satisfies Prisma.PropertySelect;

const REPLAY_EVENT_SELECT = {
  id: true,
  eventType: true,
  eventSubType: true,
  title: true,
  summary: true,
  severity: true,
  startAt: true,
  endAt: true,
  locationType: true,
  locationKey: true,
  geoJson: true,
  payloadJson: true,
} satisfies Prisma.HomeRiskEventSelect;

function serializeDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

function normalizeString(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function humanizeEventType(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function impactWeight(level: HomeRiskEventSeverity): number {
  if (level === HomeRiskEventSeverity.severe) return 5;
  if (level === HomeRiskEventSeverity.high) return 4;
  if (level === HomeRiskEventSeverity.moderate) return 3;
  if (level === HomeRiskEventSeverity.low) return 2;
  return 1;
}

function priorityWeight(priority: string): number {
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

function relevanceWeight(relevance: string): number {
  if (relevance === 'high') return 3;
  if (relevance === 'medium') return 2;
  return 1;
}

function pickHomeAsset(
  homeAssets: Array<{ id: string; assetType: string; installationYear: number | null }>,
  keywords: string[],
): { id: string; assetType: string; installationYear: number | null } | null {
  const hit = homeAssets.find((asset) => keywords.some((keyword) => normalizeString(asset.assetType).includes(keyword)));
  return hit ?? null;
}

function makePropertySystem(
  type: string,
  homeAsset: { id: string; assetType: string; installationYear: number | null } | null,
  fallbackLabel: string,
  fallbackInstallYear: number | null = null,
): ReplayPropertySystemContext | null {
  if (!homeAsset && !fallbackLabel) return null;

  return {
    type,
    id: homeAsset?.id ?? null,
    label: homeAsset ? humanizeEventType(homeAsset.assetType) : fallbackLabel,
    installationYear: homeAsset?.installationYear ?? fallbackInstallYear,
  };
}

function buildPropertyContext(
  property: Prisma.PropertyGetPayload<{ select: typeof PROPERTY_CONTEXT_SELECT }>,
): ReplayPropertyContext {
  const roofAsset = pickHomeAsset(property.homeAssets, ['roof']);
  const hvacAsset = pickHomeAsset(property.homeAssets, ['hvac', 'ac', 'furnace', 'heat pump', 'boiler']);
  const plumbingAsset = pickHomeAsset(property.homeAssets, ['water heater', 'plumbing', 'pipe']);
  const electricalAsset = pickHomeAsset(property.homeAssets, ['electrical', 'panel', 'generator']);

  const hasBelowGradeSpace = normalizeString(property.foundationType).includes('basement')
    || normalizeString(property.foundationType).includes('crawl');

  return {
    propertyId: property.id,
    address: property.address,
    city: property.city,
    state: property.state,
    zipCode: property.zipCode,
    county: null,
    propertyType: property.propertyType ?? null,
    squareFootage: property.propertySize,
    yearBuilt: property.yearBuilt,
    foundationType: property.foundationType,
    hasIrrigation: property.hasIrrigation,
    hasDrainageIssues: property.hasDrainageIssues,
    hasSumpPumpBackup: property.hasSumpPumpBackup,
    hasSecondaryHeat: property.hasSecondaryHeat,
    electricalPanelAge: property.electricalPanelAge,
    primaryHeatingFuel: property.primaryHeatingFuel,
    heatingType: property.heatingType ?? null,
    coolingType: property.coolingType ?? null,
    waterHeaterType: property.waterHeaterType ?? null,
    roofType: property.roofType ?? null,
    hvacInstallYear: property.hvacInstallYear,
    waterHeaterInstallYear: property.waterHeaterInstallYear,
    roofReplacementYear: property.roofReplacementYear,
    systems: {
      roof: makePropertySystem('roof', roofAsset, property.roofType ? `${property.roofType} roof` : 'Roof system', property.roofReplacementYear),
      hvac: makePropertySystem('hvac', hvacAsset, property.coolingType || property.heatingType ? 'HVAC system' : '', property.hvacInstallYear),
      plumbing: makePropertySystem('plumbing', plumbingAsset, property.waterHeaterType ? 'Plumbing and water systems' : '', property.waterHeaterInstallYear),
      electrical: makePropertySystem('electrical', electricalAsset, property.electricalPanelAge !== null ? 'Electrical panel and branch circuits' : '', null),
      basement: hasBelowGradeSpace ? { type: 'basement', id: null, label: property.foundationType ?? 'Below-grade spaces', installationYear: null } : null,
      drainage: property.hasDrainageIssues !== null || property.hasSumpPumpBackup !== null || property.hasIrrigation !== null
        ? { type: 'drainage', id: null, label: 'Drainage and water management', installationYear: null }
        : null,
    },
  };
}

function buildPropertySnapshotJson(context: ReplayPropertyContext): JsonRecord {
  return {
    yearBuilt: context.yearBuilt,
    squareFootage: context.squareFootage,
    propertyType: context.propertyType,
    location: {
      state: context.state,
      county: context.county,
      city: context.city,
      zip: context.zipCode,
    },
    systems: {
      roof: context.systems.roof,
      hvac: context.systems.hvac,
      plumbing: context.systems.plumbing,
      electrical: context.systems.electrical,
      basement: context.systems.basement,
      drainage: context.systems.drainage,
    },
  };
}

function getTopDrivers(matches: ReplayRunWithMatches['eventMatches']): string[] {
  const weights = new Map<string, number>();

  for (const match of matches) {
    const impactFactors = match.impactFactorsJson as JsonRecord | null;
    const drivers = impactFactors && Array.isArray(impactFactors.drivers)
      ? impactFactors.drivers as Array<Record<string, unknown>>
      : [];

    for (const driver of drivers) {
      const code = typeof driver.code === 'string' ? driver.code : null;
      if (!code) continue;
      weights.set(code, (weights.get(code) ?? 0) + impactWeight(match.impactLevel));
    }
  }

  return Array.from(weights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code]) => code);
}

function summarizeRun(
  matches: ReplayRunWithMatches['eventMatches'],
  windowStart: Date | null,
  windowEnd: Date | null,
  usedYearBuiltFallback: boolean,
): { summaryText: string; summaryJson: JsonRecord } {
  const totalEvents = matches.length;
  const highImpactEvents = matches.filter((match) => (
    match.impactLevel === HomeRiskEventSeverity.high
    || match.impactLevel === HomeRiskEventSeverity.severe
  )).length;
  const moderateImpactEvents = matches.filter((match) => match.impactLevel === HomeRiskEventSeverity.moderate).length;

  const byType = new Map<string, number>();
  for (const match of matches) {
    byType.set(match.homeRiskEvent.eventType, (byType.get(match.homeRiskEvent.eventType) ?? 0) + impactWeight(match.impactLevel));
  }

  const leaders = Array.from(byType.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([eventType]) => humanizeEventType(eventType));

  const range = windowStart && windowEnd
    ? `${windowStart.toISOString().slice(0, 10)} to ${windowEnd.toISOString().slice(0, 10)}`
    : 'the selected replay window';

  const summaryText = totalEvents === 0
    ? `No historical risk events were matched to this property for ${range}.`
    : `${totalEvents} historical risk event${totalEvents === 1 ? '' : 's'} matched this property for ${range}, including ${highImpactEvents} high-impact and ${moderateImpactEvents} moderate-impact events${leaders.length > 0 ? ` led by ${leaders.join(', ')}` : ''}.`;

  const notes = [
    'Replay is based on historical HomeRiskEvent records matched to this property location.',
    'Impact increases where property or system context suggests higher sensitivity.',
  ];

  if (usedYearBuiltFallback) {
    notes.push('Since-built replay window used a 20-year fallback because the property year built is missing.');
  }

  return {
    summaryText,
    summaryJson: {
      timelineSummary: summaryText,
      topDrivers: getTopDrivers(matches),
      notes,
    },
  };
}

function serializeTimelineEvent(match: ReplayRunWithMatches['eventMatches'][number]): JsonRecord {
  return {
    id: match.id,
    homeRiskEventId: match.homeRiskEventId,
    eventType: match.homeRiskEvent.eventType,
    eventSubType: match.homeRiskEvent.eventSubType,
    title: match.homeRiskEvent.title,
    summary: match.homeRiskEvent.summary,
    severity: match.homeRiskEvent.severity,
    startAt: match.homeRiskEvent.startAt.toISOString(),
    endAt: serializeDate(match.homeRiskEvent.endAt),
    matchScore: decimalToNumber(match.matchScore),
    impactLevel: match.impactLevel,
    impactSummary: match.impactSummary,
    impactFactorsJson: match.impactFactorsJson ?? null,
    recommendedActionsJson: match.recommendedActionsJson ?? null,
    matchedSystemsJson: match.matchedSystemsJson ?? null,
  };
}

function aggregateActions(matches: ReplayRunWithMatches['eventMatches']): JsonRecord[] {
  const map = new Map<string, JsonRecord>();

  for (const match of matches) {
    const payload = match.recommendedActionsJson as JsonRecord | null;
    const actions = payload && Array.isArray(payload.actions)
      ? payload.actions as JsonRecord[]
      : [];

    for (const action of actions) {
      const code = typeof action.code === 'string' ? action.code : null;
      if (!code) continue;
      const existing = map.get(code);
      if (!existing || priorityWeight(String(action.priority ?? 'low')) > priorityWeight(String(existing.priority ?? 'low'))) {
        map.set(code, action);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => priorityWeight(String(b.priority ?? 'low')) - priorityWeight(String(a.priority ?? 'low')));
}

function aggregateSystems(matches: ReplayRunWithMatches['eventMatches']): ReplayMatchedSystem[] {
  const map = new Map<string, ReplayMatchedSystem>();

  for (const match of matches) {
    const payload = match.matchedSystemsJson as JsonRecord | null;
    const systems = payload && Array.isArray(payload.systems)
      ? payload.systems as ReplayMatchedSystem[]
      : [];

    for (const system of systems) {
      const key = `${system.type}:${system.id ?? 'none'}`;
      const existing = map.get(key);
      if (!existing || relevanceWeight(system.relevance) > relevanceWeight(existing.relevance)) {
        map.set(key, system);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => relevanceWeight(b.relevance) - relevanceWeight(a.relevance));
}

function buildImpactSummaries(matches: ReplayRunWithMatches['eventMatches']): JsonRecord[] {
  return [...matches]
    .sort((a, b) => {
      const weightDiff = impactWeight(b.impactLevel) - impactWeight(a.impactLevel);
      if (weightDiff !== 0) return weightDiff;
      return b.homeRiskEvent.startAt.getTime() - a.homeRiskEvent.startAt.getTime();
    })
    .slice(0, 6)
    .map((match) => ({
      id: match.id,
      eventType: match.homeRiskEvent.eventType,
      title: match.homeRiskEvent.title,
      impactLevel: match.impactLevel,
      impactSummary: match.impactSummary,
      startAt: match.homeRiskEvent.startAt.toISOString(),
    }));
}

function serializeReplaySummary(run: {
  id: string;
  createdAt: Date;
  windowType: HomeRiskReplayWindowType;
  windowStart: Date | null;
  windowEnd: Date | null;
  status: HomeRiskReplayStatus;
  totalEvents: number | null;
  highImpactEvents: number | null;
  moderateImpactEvents: number | null;
  summaryText: string | null;
}): JsonRecord {
  return {
    id: run.id,
    createdAt: run.createdAt.toISOString(),
    windowType: run.windowType,
    windowStart: serializeDate(run.windowStart),
    windowEnd: serializeDate(run.windowEnd),
    status: run.status,
    totalEvents: run.totalEvents ?? 0,
    highImpactEvents: run.highImpactEvents ?? 0,
    moderateImpactEvents: run.moderateImpactEvents ?? 0,
    summaryText: run.summaryText,
  };
}

function serializeReplayDetail(run: ReplayRunWithMatches): JsonRecord {
  const sortedMatches = [...run.eventMatches].sort((a, b) => b.homeRiskEvent.startAt.getTime() - a.homeRiskEvent.startAt.getTime());

  return {
    id: run.id,
    propertyId: run.propertyId,
    windowType: run.windowType,
    windowStart: serializeDate(run.windowStart),
    windowEnd: serializeDate(run.windowEnd),
    status: run.status,
    totalEvents: run.totalEvents ?? 0,
    highImpactEvents: run.highImpactEvents ?? 0,
    moderateImpactEvents: run.moderateImpactEvents ?? 0,
    summaryText: run.summaryText,
    summaryJson: run.summaryJson ?? null,
    propertySnapshotJson: run.propertySnapshotJson ?? null,
    engineVersion: run.engineVersion,
    totals: {
      totalEvents: run.totalEvents ?? 0,
      highImpactEvents: run.highImpactEvents ?? 0,
      moderateImpactEvents: run.moderateImpactEvents ?? 0,
    },
    impactSummaries: buildImpactSummaries(sortedMatches),
    matchedSystems: aggregateSystems(sortedMatches),
    recommendedActions: aggregateActions(sortedMatches),
    timelineEvents: sortedMatches.map(serializeTimelineEvent),
  };
}

export class HomeRiskReplayService {
  private readonly preferenceProfileService = new PreferenceProfileService();

  private async enrichReplayWithSignals(run: ReplayRunWithMatches): Promise<JsonRecord> {
    const base = serializeReplayDetail(run);
    const relevantSignalKeys = new Set<SharedSignalKey>([
      'MAINT_ADHERENCE',
      'COVERAGE_GAP',
      'SAVINGS_REALIZATION',
      'RISK_SPIKE',
      'COST_ANOMALY',
      'RISK_ACCUMULATION',
      'SYSTEM_DEGRADATION',
      'COST_PRESSURE_PATTERN',
      'FINANCIAL_DISCIPLINE',
    ]);

    const sharedSignals = await signalService.listSignals(run.propertyId, {
      freshOnly: false,
      capturedFrom: run.windowStart ?? undefined,
      capturedTo: run.windowEnd ?? undefined,
      limit: 200,
    });

    const signalTimelineEvents = sharedSignals
      .filter((signal) => relevantSignalKeys.has(signal.signalKey as SharedSignalKey))
      .map((signal) => timelineEntryFromSignal(signal));

    const eventTimelineEntries = run.eventMatches.map((match) => {
      const event = match.homeRiskEvent;
      return timelineEntryFromEvent(
        {
          eventType: event.eventType,
          propertyId: run.propertyId,
          roomId: null,
          homeItemId: null,
          sourceModel: 'HomeRiskEvent',
          sourceId: event.id,
          occurredAt: event.startAt,
          payloadJson: {
            eventSubType: event.eventSubType ?? null,
            severity: event.severity,
            impactLevel: match.impactLevel,
            impactSummary: match.impactSummary,
          },
        },
        event.title,
        event.summary ?? null,
      );
    });

    const combinedTimelineEntries = mergeTimelineProjectionEntries([
      ...eventTimelineEntries,
      ...signalTimelineEvents,
    ], 300);

    const latestSignalsByKey = await signalService.getLatestSignalsByKey(
      run.propertyId,
      Array.from(relevantSignalKeys),
      { freshOnly: true },
    );
    const signalInteractionContext = await signalService.getSignalInteractionContext(run.propertyId, {
      freshOnly: true,
    });
    const preferenceProfile = await this.preferenceProfileService.getCurrentProfile(run.propertyId);

    return {
      ...base,
      signalTimelineEvents,
      combinedTimelineEvents: combinedTimelineEntries,
      sharedSignals: latestSignalsByKey,
      signalInteractions: signalInteractionContext.interactions,
      preferenceInfluence: preferenceProfile
        ? {
            preferenceProfileId: preferenceProfile.id,
            riskTolerance: preferenceProfile.riskTolerance,
            cashBufferPosture: preferenceProfile.cashBufferPosture,
          }
        : null,
      readPriorityOrderApplied: ['CANONICAL_EVENTS', 'SHARED_SIGNALS', 'SNAPSHOTS_FALLBACK'],
    };
  }

  async generateRun(propertyId: string, input: GenerateReplayInput): Promise<{ replay: JsonRecord; reused: boolean }> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: PROPERTY_CONTEXT_SELECT,
    });

    if (!property) {
      throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
    }

    const parsedWindowStart = input.windowStart ? new Date(input.windowStart) : null;
    const parsedWindowEnd = input.windowEnd ? new Date(input.windowEnd) : null;
    const replayWindow = resolveReplayWindow(
      input.windowType,
      property.yearBuilt,
      parsedWindowStart,
      parsedWindowEnd,
    );

    if (!input.forceRegenerate) {
      const existing = await prisma.homeRiskReplayRun.findFirst({
        where: {
          propertyId,
          windowType: replayWindow.windowType,
          windowStart: replayWindow.windowStart,
          windowEnd: replayWindow.windowEnd,
          status: HomeRiskReplayStatus.completed,
        },
        include: {
          eventMatches: {
            include: {
              homeRiskEvent: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        return { replay: await this.enrichReplayWithSignals(existing), reused: true };
      }
    }

    const propertyContext = buildPropertyContext(property);
    const propertySnapshotJson = buildPropertySnapshotJson(propertyContext);

    const run = await prisma.homeRiskReplayRun.create({
      data: {
        propertyId,
        windowType: replayWindow.windowType,
        windowStart: replayWindow.windowStart,
        windowEnd: replayWindow.windowEnd,
        status: HomeRiskReplayStatus.pending,
        propertySnapshotJson: propertySnapshotJson as Prisma.InputJsonValue,
        engineVersion: HOME_RISK_REPLAY_ENGINE_VERSION,
      },
    });

    try {
      const candidateEvents = await prisma.homeRiskEvent.findMany({
        where: {
          startAt: { lte: replayWindow.windowEnd },
          OR: [
            { endAt: null },
            { endAt: { gte: replayWindow.windowStart } },
          ],
          locationType: {
            in: ['property', 'zip', 'city', 'county', 'state', 'polygon'],
          },
        },
        select: REPLAY_EVENT_SELECT,
        orderBy: [
          { startAt: 'desc' },
          { createdAt: 'desc' },
        ],
      });

      const matchPayloads = candidateEvents
        .map((event) => {
          const result = evaluateReplayEvent(event as ReplayCandidateEvent, propertyContext);
          if (!result) return null;

          return {
            homeRiskReplayRunId: run.id,
            homeRiskEventId: event.id,
            propertyId,
            matchScore: new Prisma.Decimal(result.matchScore.toFixed(4)),
            impactLevel: result.impactLevel,
            impactSummary: result.impactSummary,
            impactFactorsJson: result.impactFactorsJson as Prisma.InputJsonValue,
            recommendedActionsJson: result.recommendedActionsJson as Prisma.InputJsonValue,
            matchedSystemsJson: result.matchedSystemsJson as Prisma.InputJsonValue,
          };
        })
        .filter((match): match is NonNullable<typeof match> => match !== null);

      if (matchPayloads.length > 0) {
        await prisma.homeRiskReplayEventMatch.createMany({
          data: matchPayloads,
        });
      }

      const completedRun = await prisma.homeRiskReplayRun.findUnique({
        where: { id: run.id },
        include: {
          eventMatches: {
            include: {
              homeRiskEvent: true,
            },
          },
        },
      });

      if (!completedRun) {
        throw new APIError('Replay run not found after creation', 500, 'REPLAY_RUN_MISSING');
      }

      const { summaryText, summaryJson } = summarizeRun(
        completedRun.eventMatches,
        replayWindow.windowStart,
        replayWindow.windowEnd,
        replayWindow.usedYearBuiltFallback,
      );

      const totalEvents = completedRun.eventMatches.length;
      const highImpactEvents = completedRun.eventMatches.filter((match) => (
        match.impactLevel === HomeRiskEventSeverity.high
        || match.impactLevel === HomeRiskEventSeverity.severe
      )).length;
      const moderateImpactEvents = completedRun.eventMatches.filter((match) => match.impactLevel === HomeRiskEventSeverity.moderate).length;

      const finalizedRun = await prisma.homeRiskReplayRun.update({
        where: { id: run.id },
        data: {
          status: HomeRiskReplayStatus.completed,
          totalEvents,
          highImpactEvents,
          moderateImpactEvents,
          summaryText,
          summaryJson: summaryJson as Prisma.InputJsonValue,
          propertySnapshotJson: propertySnapshotJson as Prisma.InputJsonValue,
          engineVersion: HOME_RISK_REPLAY_ENGINE_VERSION,
        },
        include: {
          eventMatches: {
            include: {
              homeRiskEvent: true,
            },
          },
        },
      });

      return {
        replay: await this.enrichReplayWithSignals(finalizedRun),
        reused: false,
      };
    } catch (error) {
      await prisma.homeRiskReplayRun.update({
        where: { id: run.id },
        data: {
          status: HomeRiskReplayStatus.failed,
          summaryText: 'Replay generation failed before completion.',
          summaryJson: {
            error: 'Replay generation failed before completion.',
            engineVersion: HOME_RISK_REPLAY_ENGINE_VERSION,
          } as Prisma.InputJsonValue,
        },
      }).catch(() => undefined);

      throw error;
    }
  }

  async listRuns(propertyId: string, query: ListRunsQuery = {}): Promise<{ runs: JsonRecord[] }> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const runs = await prisma.homeRiskReplayRun.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        windowType: true,
        windowStart: true,
        windowEnd: true,
        status: true,
        totalEvents: true,
        highImpactEvents: true,
        moderateImpactEvents: true,
        summaryText: true,
      },
    });

    return {
      runs: runs.map(serializeReplaySummary),
    };
  }

  async getRunDetail(propertyId: string, replayRunId: string): Promise<JsonRecord> {
    const run = await prisma.homeRiskReplayRun.findFirst({
      where: {
        id: replayRunId,
        propertyId,
      },
      include: {
        eventMatches: {
          include: {
            homeRiskEvent: true,
          },
        },
      },
    });

    if (!run) {
      throw new APIError('Replay run not found', 404, 'HOME_RISK_REPLAY_NOT_FOUND');
    }

    return this.enrichReplayWithSignals(run);
  }

  async trackEvent(
    propertyId: string,
    userId: string,
    input: { event: string; section?: string; metadata?: Record<string, unknown> },
  ): Promise<{ ok: true }> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });

    if (!property) {
      throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
    }

    const eventName = String(input.event || 'UNKNOWN')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .slice(0, 80);
    const section = input.section ? String(input.section).slice(0, 80) : null;

    await prisma.auditLog.create({
      data: {
        userId,
        action: `HOME_RISK_REPLAY_${eventName || 'UNKNOWN'}`,
        entityType: 'PROPERTY',
        entityId: propertyId,
        newValues: {
          section,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        } as Prisma.InputJsonValue,
      },
    });

    return { ok: true };
  }
}
