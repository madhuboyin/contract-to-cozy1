import { createHash } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { resolvePropertyAccess } from '../propertyAccess.service';
import {
  entityRefKey,
  type EvidenceRef,
} from '../../productFramework/intelligence';
import type { EnvelopeAdapterCapability, EnvelopeAdapterResult } from './envelopeAdapter.contract';
import {
  ENVELOPE_PRODUCER_MODELS,
  IntelligenceEnvelopePageSchema,
  IntelligenceEnvelopeQuerySchema,
  decodeEnvelopeCursor,
  encodeEnvelopeCursor,
  type EnvelopeDiagnostic,
  type EnvelopeProducerModel,
  type IntelligenceEnvelopeItem,
  type IntelligenceEnvelopePage,
  type IntelligenceEnvelopeQuery,
} from './intelligenceEnvelope.contract';
import {
  guidanceSignalEnvelopeAdapter,
  intelligenceObservationEnvelopeAdapter,
  personalizedRecommendationEnvelopeAdapter,
  propertyRadarCompoundInsightEnvelopeAdapter,
  propertyRadarMatchEnvelopeAdapter,
  recommendationSnapshotEnvelopeAdapter,
  signalEnvelopeAdapter,
} from './adapters';
import { inventoryEntityRef } from './adapters/adapterSupport';

export const ENVELOPE_QUERY_PER_ADAPTER_TIMEOUT_MS = 2_000;
export const ENVELOPE_QUERY_TOTAL_TIMEOUT_MS = 5_000;
export const ENVELOPE_QUERY_MAX_ROWS_PER_PRODUCER = 300;

export class IntelligenceEnvelopeAccessDeniedError extends Error {
  readonly code = 'INTELLIGENCE_ENVELOPE_ACCESS_DENIED';

  constructor() {
    super('Property not found or access denied.');
    this.name = 'IntelligenceEnvelopeAccessDeniedError';
  }
}

export type EnvelopeProducerReadInput = Readonly<{
  propertyId: string;
  userId: string;
  createdAfter?: Date;
  createdBefore?: Date;
  createdAtOnOrBefore?: Date;
  rowLimit: number;
}>;

export interface EnvelopeProducerReader {
  readonly producerModel: EnvelopeProducerModel;
  read(input: EnvelopeProducerReadInput): Promise<readonly EnvelopeAdapterResult[]>;
}

export interface IntelligenceEnvelopeQueryDependencies {
  authorizeProperty(userId: string, propertyId: string): Promise<boolean>;
  readers: Readonly<Record<EnvelopeProducerModel, EnvelopeProducerReader>>;
  now(): Date;
  perAdapterTimeoutMs: number;
  totalTimeoutMs: number;
}

export type EnvelopeObservedCapability = EnvelopeAdapterCapability & Readonly<{
  producerModel: EnvelopeProducerModel;
  observedAt: string;
  envelopeKey: IntelligenceEnvelopeItem['envelopeKey'];
}>;

export type IntelligenceEnvelopeCoveragePage = Readonly<{
  page: IntelligenceEnvelopePage;
  observedCapabilities: readonly EnvelopeObservedCapability[];
}>;

function sourceEvidence(input: {
  producerModel: EnvelopeProducerModel;
  sourceRecordId: string;
  observedAt: Date | string | null | undefined;
  freshness?: EvidenceRef['freshness'];
  source?: string;
  confidence?: number | null;
}): EvidenceRef[] {
  return [{
    id: `${input.producerModel}:${input.sourceRecordId}`,
    type: input.producerModel === 'IntelligenceObservation' || input.producerModel === 'PropertyRadarMatch'
      ? 'EXTERNAL_SOURCE'
      : 'SYSTEM_DERIVATION',
    label: `${input.producerModel} source record`,
    source: input.source ?? input.producerModel,
    observedAt: input.observedAt ? new Date(input.observedAt).toISOString() : null,
    freshness: input.freshness ?? 'UNKNOWN',
    confidence: input.confidence ?? null,
  }];
}

function createdAtWhere(input: EnvelopeProducerReadInput): { gt?: Date; lt?: Date; lte?: Date } | undefined {
  const where = {
    ...(input.createdAfter ? { gt: input.createdAfter } : {}),
    ...(input.createdAtOnOrBefore
      ? { lte: input.createdAtOnOrBefore }
      : input.createdBefore ? { lt: input.createdBefore } : {}),
  };
  return Object.keys(where).length ? where : undefined;
}

export const DEFAULT_ENVELOPE_PRODUCER_READERS: Readonly<Record<EnvelopeProducerModel, EnvelopeProducerReader>> = Object.freeze({
  Signal: {
    producerModel: 'Signal',
    async read(input) {
      const rows = await prisma.signal.findMany({
        where: { propertyId: input.propertyId, createdAt: createdAtWhere(input) },
        include: { homeItem: { include: { inventoryItem: { select: { category: true, assetType: true } } } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: input.rowLimit,
      });
      return rows.map((row) => signalEnvelopeAdapter.map({
        ...row,
        inventory: row.homeItem?.inventoryItem ?? null,
      }, {
        propertyId: input.propertyId,
        userId: input.userId,
        evidence: sourceEvidence({ producerModel: 'Signal', sourceRecordId: row.id, observedAt: row.capturedAt, confidence: row.confidence }),
      }));
    },
  },
  GuidanceSignal: {
    producerModel: 'GuidanceSignal',
    async read(input) {
      const rows = await prisma.guidanceSignal.findMany({
        where: { propertyId: input.propertyId, createdAt: createdAtWhere(input) },
        include: { inventoryItem: { select: { category: true, assetType: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: input.rowLimit,
      });
      return rows.map((row) => guidanceSignalEnvelopeAdapter.map(row, {
        propertyId: input.propertyId,
        userId: input.userId,
        evidence: sourceEvidence({ producerModel: 'GuidanceSignal', sourceRecordId: row.id, observedAt: row.lastObservedAt, confidence: row.confidenceScore == null ? null : Number(row.confidenceScore) }),
      }));
    },
  },
  IntelligenceObservation: {
    producerModel: 'IntelligenceObservation',
    async read(input) {
      const observations = await prisma.intelligenceObservation.findMany({
        where: {
          createdAt: createdAtWhere(input),
          propertyMatches: { some: { propertyId: input.propertyId } },
        },
        include: {
          source: { select: { provider: true } },
          propertyMatches: { where: { propertyId: input.propertyId }, select: { matchConfidence: true }, take: 1 },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: input.rowLimit,
      });
      return observations.map((observation) => intelligenceObservationEnvelopeAdapter.map({
        ...observation,
        propertyId: input.propertyId,
        matchConfidence: observation.propertyMatches[0]?.matchConfidence ?? null,
      }, {
        propertyId: input.propertyId,
        userId: input.userId,
        evidence: sourceEvidence({
          producerModel: 'IntelligenceObservation',
          sourceRecordId: observation.id,
          observedAt: observation.observedAt ?? observation.lastVerifiedAt,
          source: observation.source.provider,
          confidence: observation.propertyMatches[0]?.matchConfidence ?? null,
        }),
      }));
    },
  },
  RecommendationSnapshot: {
    producerModel: 'RecommendationSnapshot',
    async read(input) {
      const rows = await prisma.recommendationSnapshot.findMany({
        where: { propertyId: input.propertyId, generatedAt: createdAtWhere(input) },
        include: { decisionThread: { select: { currentRecommendationSnapshotId: true, primaryEntityType: true, primaryEntityId: true } } },
        orderBy: [{ generatedAt: 'desc' }, { id: 'asc' }],
        take: input.rowLimit,
      });
      const inventoryIds = rows.flatMap((row) => (
        row.decisionThread?.primaryEntityType === 'INVENTORY_ITEM' && row.decisionThread.primaryEntityId
          ? [row.decisionThread.primaryEntityId]
          : []
      ));
      const inventoryItems = inventoryIds.length ? await prisma.inventoryItem.findMany({
        where: { propertyId: input.propertyId, id: { in: inventoryIds } },
        select: { id: true, category: true, assetType: true },
      }) : [];
      const inventoryById = new Map(inventoryItems.map((item) => [item.id, item]));
      return rows.map((row) => recommendationSnapshotEnvelopeAdapter.map({
        ...row,
        isCurrent: row.decisionThread?.currentRecommendationSnapshotId === row.id,
        ...(row.decisionThread?.primaryEntityId && inventoryById.has(row.decisionThread.primaryEntityId)
          ? { entityRef: inventoryEntityRef({
              entityId: row.decisionThread.primaryEntityId,
              ...inventoryById.get(row.decisionThread.primaryEntityId)!,
            }) }
          : {}),
      }, {
        propertyId: input.propertyId,
        userId: input.userId,
        evidence: sourceEvidence({ producerModel: 'RecommendationSnapshot', sourceRecordId: row.id, observedAt: row.generatedAt }),
      }));
    },
  },
  PersonalizedRecommendation: {
    producerModel: 'PersonalizedRecommendation',
    async read(input) {
      const rows = await prisma.personalizedRecommendation.findMany({
        where: { propertyId: input.propertyId, firstEligibleAt: createdAtWhere(input) },
        include: { definition: { select: { code: true } } },
        orderBy: [{ firstEligibleAt: 'desc' }, { id: 'asc' }],
        take: input.rowLimit,
      });
      return rows.map((row) => personalizedRecommendationEnvelopeAdapter.map({
        ...row,
        definitionCode: row.definition.code,
      }, {
        propertyId: input.propertyId,
        userId: input.userId,
        evidence: sourceEvidence({ producerModel: 'PersonalizedRecommendation', sourceRecordId: row.id, observedAt: row.lastEvaluatedAt, confidence: row.confidence }),
      }));
    },
  },
  PropertyRadarMatch: {
    producerModel: 'PropertyRadarMatch',
    async read(input) {
      const rows = await prisma.propertyRadarMatch.findMany({
        where: { propertyId: input.propertyId, createdAt: createdAtWhere(input) },
        include: {
          radarEvent: {
            include: {
              sourceDefinition: { select: { provider: true } },
              revisions: { orderBy: { observedAt: 'desc' }, take: 1, select: { id: true, expiresAt: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: input.rowLimit,
      });
      return rows.map((row) => propertyRadarMatchEnvelopeAdapter.map({
        ...row,
        eventType: row.radarEvent.eventType,
        provider: row.radarEvent.sourceDefinition?.provider ?? row.radarEvent.sourceType,
        eventRevisionId: row.lastEventRevisionId ?? row.radarEvent.revisions[0]?.id ?? null,
        eventObservedAt: row.radarEvent.observedAt,
        eventExpiresAt: row.radarEvent.revisions[0]?.expiresAt ?? row.radarEvent.expiredAt,
      }, {
        propertyId: input.propertyId,
        userId: input.userId,
        evidence: sourceEvidence({
          producerModel: 'PropertyRadarMatch',
          sourceRecordId: row.id,
          observedAt: row.radarEvent.observedAt,
          source: row.radarEvent.sourceDefinition?.provider ?? String(row.radarEvent.sourceType),
          confidence: row.confidenceScore == null ? null : Number(row.confidenceScore),
        }),
      }));
    },
  },
  PropertyRadarCompoundInsight: {
    producerModel: 'PropertyRadarCompoundInsight',
    async read(input) {
      const rows = await prisma.propertyRadarCompoundInsight.findMany({
        where: { propertyId: input.propertyId, createdAt: createdAtWhere(input) },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: input.rowLimit,
      });
      return rows.map((row) => propertyRadarCompoundInsightEnvelopeAdapter.map(row, {
        propertyId: input.propertyId,
        userId: input.userId,
        evidence: sourceEvidence({ producerModel: 'PropertyRadarCompoundInsight', sourceRecordId: row.id, observedAt: row.evaluatedAt }),
      }));
    },
  },
});

const DEFAULT_DEPENDENCIES: IntelligenceEnvelopeQueryDependencies = Object.freeze({
  authorizeProperty: async (userId: string, propertyId: string) => Boolean(await resolvePropertyAccess(userId, propertyId)),
  readers: DEFAULT_ENVELOPE_PRODUCER_READERS,
  now: () => new Date(),
  perAdapterTimeoutMs: ENVELOPE_QUERY_PER_ADAPTER_TIMEOUT_MS,
  totalTimeoutMs: ENVELOPE_QUERY_TOTAL_TIMEOUT_MS,
});

function compareItems(left: IntelligenceEnvelopeItem, right: IntelligenceEnvelopeItem): number {
  const timeDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  return timeDifference || left.envelopeKey.localeCompare(right.envelopeKey);
}

function isAfterCursor(item: IntelligenceEnvelopeItem, cursor: { createdAt: string; envelopeKey: string }): boolean {
  const itemTime = Date.parse(item.createdAt);
  const cursorTime = Date.parse(cursor.createdAt);
  return itemTime < cursorTime || (itemTime === cursorTime && item.envelopeKey > cursor.envelopeKey);
}

function matchesQuery(item: IntelligenceEnvelopeItem, query: ReturnType<typeof IntelligenceEnvelopeQuerySchema.parse>): boolean {
  if (query.types?.length && !query.types.includes(item.type)) return false;
  if (query.domains?.length && !query.domains.includes(item.domain)) return false;
  if (query.sourceModels?.length && !query.sourceModels.includes(item.source.sourceModel)) return false;
  if (query.currentness?.length && !query.currentness.includes(item.freshness.currentness)) return false;
  if (query.entityRefs?.length) {
    if (!item.subject.entityRef) return false;
    const requested = new Set(query.entityRefs.map(entityRefKey));
    if (!requested.has(entityRefKey(item.subject.entityRef))) return false;
  }
  if (query.createdAfter && Date.parse(item.createdAt) <= Date.parse(query.createdAfter)) return false;
  if (query.createdBefore && Date.parse(item.createdAt) >= Date.parse(query.createdBefore)) return false;
  return true;
}

function aggregateDiagnostics(diagnostics: readonly EnvelopeDiagnostic[]): EnvelopeDiagnostic[] {
  const aggregated = new Map<string, EnvelopeDiagnostic>();
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.producerModel}:${diagnostic.code}:${diagnostic.nativeValue ?? ''}`;
    const existing = aggregated.get(key);
    aggregated.set(key, existing ? { ...existing, count: existing.count + diagnostic.count } : diagnostic);
  }
  return [...aggregated.values()].sort((left, right) => (
    left.producerModel.localeCompare(right.producerModel)
    || left.code.localeCompare(right.code)
    || (left.nativeValue ?? '').localeCompare(right.nativeValue ?? '')
  ));
}

async function readWithTimeout(
  reader: EnvelopeProducerReader,
  input: EnvelopeProducerReadInput,
  timeoutMs: number,
): Promise<readonly EnvelopeAdapterResult[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ENVELOPE_ADAPTER_TIMEOUT')), timeoutMs);
    reader.read(input).then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function executeIntelligenceEnvelopeQuery(
  rawQuery: IntelligenceEnvelopeQuery,
  dependencyOverrides: Partial<IntelligenceEnvelopeQueryDependencies> = {},
): Promise<IntelligenceEnvelopeCoveragePage> {
  const query = IntelligenceEnvelopeQuerySchema.parse(rawQuery);
  const dependencies: IntelligenceEnvelopeQueryDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides };
  const cursor = query.cursor ? decodeEnvelopeCursor(query.cursor, query) : null;

  // This check intentionally precedes every producer read. Callers receive the
  // same error for an unknown property and an inaccessible property.
  if (!await dependencies.authorizeProperty(query.principal.userId, query.propertyId)) {
    throw new IntelligenceEnvelopeAccessDeniedError();
  }

  const startedAt = dependencies.now().getTime();
  const producerModels = query.sourceModels?.length ? query.sourceModels : [...ENVELOPE_PRODUCER_MODELS];
  const rowLimit = Math.min(ENVELOPE_QUERY_MAX_ROWS_PER_PRODUCER, Math.max(100, query.limit * 3));
  const reads = producerModels.map(async (producerModel) => {
    const reader = dependencies.readers[producerModel];
    const elapsed = dependencies.now().getTime() - startedAt;
    const remaining = dependencies.totalTimeoutMs - elapsed;
    if (remaining <= 0) return { producerModel, failed: true as const, timeout: true as const, results: [] as readonly EnvelopeAdapterResult[] };
    try {
      const results = await readWithTimeout(reader, {
        propertyId: query.propertyId,
        userId: query.principal.userId,
        ...(query.createdAfter ? { createdAfter: new Date(query.createdAfter) } : {}),
        ...(query.createdBefore ? { createdBefore: new Date(query.createdBefore) } : {}),
        ...(cursor ? { createdAtOnOrBefore: new Date(cursor.createdAt) } : {}),
        rowLimit,
      }, Math.min(dependencies.perAdapterTimeoutMs, remaining));
      return { producerModel, failed: false as const, timeout: false as const, results };
    } catch (error) {
      return {
        producerModel,
        failed: true as const,
        timeout: error instanceof Error && error.message === 'ENVELOPE_ADAPTER_TIMEOUT',
        results: [] as readonly EnvelopeAdapterResult[],
      };
    }
  });

  const outcomes = await Promise.all(reads);
  const items: IntelligenceEnvelopeItem[] = [];
  const observedCapabilities: EnvelopeObservedCapability[] = [];
  const diagnostics: EnvelopeDiagnostic[] = [];
  for (const outcome of outcomes) {
    if (outcome.failed && outcome.timeout) {
      diagnostics.push({ producerModel: outcome.producerModel, code: 'TIME_BUDGET_EXHAUSTED', count: 1 });
      continue;
    }
    if (outcome.failed) {
      diagnostics.push({ producerModel: outcome.producerModel, code: 'ADAPTER_FAILED', count: 1 });
      continue;
    }
    for (const result of outcome.results) {
      if (result.item) {
        items.push(result.item);
        observedCapabilities.push({
          producerModel: outcome.producerModel,
          ...result.capability,
          observedAt: result.item.updatedAt,
          envelopeKey: result.item.envelopeKey,
        });
      }
      else diagnostics.push(result.diagnostic);
    }
  }

  const ordered = items
    .filter((item) => item.subject.propertyId === query.propertyId)
    .filter((item) => matchesQuery(item, query))
    .filter((item) => !cursor || isAfterCursor(item, cursor))
    .sort(compareItems);
  const pageItems = ordered.slice(0, query.limit);
  const lastItem = pageItems.at(-1);
  const nextCursor = ordered.length > query.limit && lastItem
    ? encodeEnvelopeCursor({ createdAt: lastItem.createdAt, envelopeKey: lastItem.envelopeKey, query })
    : null;
  const generatedAt = dependencies.now().toISOString();
  const contextVersion = createHash('sha256').update(JSON.stringify({
    propertyId: query.propertyId,
    envelopeKeys: pageItems.map((item) => item.envelopeKey),
    diagnostics: aggregateDiagnostics(diagnostics),
  })).digest('hex');

  const page = IntelligenceEnvelopePageSchema.parse({
    items: pageItems,
    nextCursor,
    diagnostics: aggregateDiagnostics(diagnostics),
    contextVersion,
    generatedAt,
  });
  return { page, observedCapabilities };
}

export async function queryIntelligenceEnvelope(
  rawQuery: IntelligenceEnvelopeQuery,
  dependencyOverrides: Partial<IntelligenceEnvelopeQueryDependencies> = {},
): Promise<IntelligenceEnvelopePage> {
  return (await executeIntelligenceEnvelopeQuery(rawQuery, dependencyOverrides)).page;
}

/** Internal coverage view; preserves exact adapter tuples without widening the public Envelope page. */
export function queryIntelligenceEnvelopeForCoverage(
  rawQuery: IntelligenceEnvelopeQuery,
  dependencyOverrides: Partial<IntelligenceEnvelopeQueryDependencies> = {},
): Promise<IntelligenceEnvelopeCoveragePage> {
  return executeIntelligenceEnvelopeQuery(rawQuery, dependencyOverrides);
}
