import { createHash } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { resolvePropertyAccess } from '../propertyAccess.service';
import {
  EvidenceRefSchema,
  entityRefKey,
  normalizeConfidenceRatio,
  type EvidenceRef,
  type EnvelopeEntityRef,
  type InventoryItemCategory,
  type PropertyComponentKind,
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
export const ENVELOPE_COVERAGE_PER_ADAPTER_TIMEOUT_MS = 30_000;
export const ENVELOPE_COVERAGE_TOTAL_TIMEOUT_MS = 60_000;

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
  offset: number;
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

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function dateOrNull(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function dedupeEvidence(...groups: readonly EvidenceRef[][]): EvidenceRef[] {
  const byId = new Map<string, EvidenceRef>();
  for (const evidence of groups.flat()) {
    const parsed = EvidenceRefSchema.safeParse(evidence);
    if (parsed.success && !byId.has(parsed.data.id)) byId.set(parsed.data.id, parsed.data);
  }
  return [...byId.values()];
}

function storedEvidenceRefs(value: unknown): EvidenceRef[] {
  const candidates = Array.isArray(value)
    ? value
    : jsonArray(jsonRecord(value)?.evidence);
  return candidates.flatMap((candidate) => {
    const parsed = EvidenceRefSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

function snapshotFactEvidence(value: unknown, observedAt: Date | string): EvidenceRef[] {
  return jsonArray(value).flatMap((candidate, index) => {
    const fact = jsonRecord(candidate);
    if (!fact) return [];
    const entityType = typeof fact.entityType === 'string' ? fact.entityType : 'PROPERTY';
    const entityId = typeof fact.entityId === 'string' ? fact.entityId : 'unknown';
    const fieldPath = typeof fact.fieldPath === 'string' ? fact.fieldPath : `fact-${index + 1}`;
    return [{
      id: `canonical-fact:${entityType}:${entityId}:${fieldPath}`.slice(0, 120),
      type: 'PROPERTY_FACT' as const,
      label: `${entityType.toLowerCase().replace(/_/g, ' ')} ${fieldPath.replace(/\./g, ' ')}`.slice(0, 240),
      source: 'Decision Platform canonical fact reference',
      observedAt: dateOrNull(observedAt),
      freshness: 'UNKNOWN' as const,
      confidence: null,
    }];
  });
}

function snapshotSignalEvidence(value: unknown, observedAt: Date | string): EvidenceRef[] {
  return jsonArray(value).flatMap((candidate, index) => {
    const signal = jsonRecord(candidate);
    if (!signal) return [];
    const sourceId = ['homeActionId', 'sourceEntityId', 'lineageId']
      .map((key) => signal[key])
      .find((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    if (!sourceId) return [];
    return [{
      id: `snapshot-signal:${sourceId}`.slice(0, 120),
      type: 'SYSTEM_DERIVATION' as const,
      label: typeof signal.type === 'string' ? signal.type.replace(/_/g, ' ') : `Snapshot signal ${index + 1}`,
      source: 'Decision Platform signal reference',
      observedAt: dateOrNull(signal.capturedAt) ?? dateOrNull(observedAt),
      freshness: 'UNKNOWN' as const,
      confidence: null,
    }];
  });
}

function personalizationExplanationEvidence(
  explanations: readonly { id: string; headline: string; evidenceJson: unknown; createdAt: Date }[],
  confidence: number | null,
): EvidenceRef[] {
  return explanations.flatMap((explanation) => dedupeEvidence(
    storedEvidenceRefs(explanation.evidenceJson),
    [{
      id: `RecommendationExplanation:${explanation.id}`,
      type: 'SYSTEM_DERIVATION',
      label: explanation.headline.slice(0, 240),
      source: 'PersonalizationEngine explanation',
      observedAt: explanation.createdAt.toISOString(),
      freshness: 'UNKNOWN',
      confidence: normalizeConfidenceRatio(confidence),
    }],
  ));
}

function compoundEvidence(row: {
  sourceEvidenceJson: unknown;
  factEvidenceJson: unknown;
  evaluatedAt: Date;
}): EvidenceRef[] {
  const sources = jsonArray(row.sourceEvidenceJson).flatMap((candidate) => {
    const source = jsonRecord(candidate);
    if (!source || typeof source.eventId !== 'string') return [];
    const expiresAt = dateOrNull(source.expiresAt);
    return [{
      id: `RadarEvent:${source.eventId}`,
      type: 'EXTERNAL_SOURCE' as const,
      label: `Radar event ${String(source.eventType ?? 'event').replace(/_/g, ' ')}`.slice(0, 240),
      source: String(source.provider ?? source.sourceName ?? 'HomeEventRadar').slice(0, 300),
      observedAt: dateOrNull(source.effectiveAt),
      freshness: expiresAt && Date.parse(expiresAt) < Date.now() ? 'STALE' as const : 'CURRENT' as const,
      confidence: null,
    }];
  });
  const facts = jsonArray(row.factEvidenceJson).flatMap((candidate) => {
    const fact = jsonRecord(candidate);
    if (!fact || typeof fact.factKey !== 'string') return [];
    return [{
      id: `radar-fact:${fact.factKey}`.slice(0, 120),
      type: 'PROPERTY_FACT' as const,
      label: `${fact.factKey}: ${String(fact.state ?? fact.value ?? 'unknown')}`.slice(0, 240),
      source: 'HomeEventRadar property facts',
      observedAt: row.evaluatedAt.toISOString(),
      freshness: fact.state === 'unknown' ? 'UNKNOWN' as const : 'CURRENT' as const,
      confidence: null,
    }];
  });
  return dedupeEvidence(sources, facts);
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
        skip: input.offset,
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
        skip: input.offset,
        take: input.rowLimit,
      });
      return rows.map((row) => guidanceSignalEnvelopeAdapter.map(row, {
        propertyId: input.propertyId,
        userId: input.userId,
        evidence: dedupeEvidence(
          row.sourceProvenanceId || row.sourceEntityId || row.sourceRunId ? [{
            id: `GuidanceProvenance:${row.sourceProvenanceId ?? row.sourceEntityId ?? row.sourceRunId}`.slice(0, 120),
            type: 'SYSTEM_DERIVATION',
            label: `${row.sourceType ?? 'Guidance'} provenance`,
            source: row.sourceFeatureKey ?? row.sourceToolKey ?? 'GuidanceEngine',
            observedAt: row.lastObservedAt.toISOString(),
            freshness: 'UNKNOWN',
            confidence: normalizeConfidenceRatio(row.confidenceScore == null ? null : Number(row.confidenceScore)),
          }] : [],
          sourceEvidence({ producerModel: 'GuidanceSignal', sourceRecordId: row.id, observedAt: row.lastObservedAt, confidence: row.confidenceScore == null ? null : Number(row.confidenceScore) }),
        ),
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
        skip: input.offset,
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
        skip: input.offset,
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
        evidence: dedupeEvidence(
          storedEvidenceRefs(row.evidenceReferences),
          snapshotFactEvidence(row.canonicalFactReferences, row.generatedAt),
          snapshotSignalEvidence(row.signalReferences, row.generatedAt),
          sourceEvidence({ producerModel: 'RecommendationSnapshot', sourceRecordId: row.id, observedAt: row.generatedAt }),
        ),
      }));
    },
  },
  PersonalizedRecommendation: {
    producerModel: 'PersonalizedRecommendation',
    async read(input) {
      const rows = await prisma.personalizedRecommendation.findMany({
        where: { propertyId: input.propertyId, firstEligibleAt: createdAtWhere(input) },
        include: {
          definition: { select: { code: true } },
          explanations: {
            orderBy: { version: 'desc' },
            take: 1,
            select: { id: true, headline: true, evidenceJson: true, createdAt: true },
          },
        },
        orderBy: [{ firstEligibleAt: 'desc' }, { id: 'asc' }],
        skip: input.offset,
        take: input.rowLimit,
      });
      return rows.map((row) => personalizedRecommendationEnvelopeAdapter.map({
        ...row,
        definitionCode: row.definition.code,
      }, {
        propertyId: input.propertyId,
        userId: input.userId,
        evidence: dedupeEvidence(
          personalizationExplanationEvidence(row.explanations, row.confidence),
          sourceEvidence({ producerModel: 'PersonalizedRecommendation', sourceRecordId: row.id, observedAt: row.lastEvaluatedAt, confidence: row.confidence }),
        ),
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
        skip: input.offset,
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
        evidence: dedupeEvidence([{
          id: `RadarEventRevision:${row.lastEventRevisionId ?? row.radarEvent.revisions[0]?.id ?? row.radarEvent.id}`.slice(0, 120),
          type: 'EXTERNAL_SOURCE',
          label: `Global Radar event ${row.radarEvent.eventType.replace(/_/g, ' ')}`,
          source: String(row.radarEvent.sourceDefinition?.provider ?? row.radarEvent.sourceType).slice(0, 300),
          observedAt: row.radarEvent.observedAt.toISOString(),
          freshness: row.sourceFreshnessStatus === 'fresh' ? 'CURRENT' : row.sourceFreshnessStatus === 'stale' ? 'STALE' : 'UNKNOWN',
          confidence: normalizeConfidenceRatio(row.confidenceScore == null ? null : Number(row.confidenceScore)),
        }], sourceEvidence({
            producerModel: 'PropertyRadarMatch',
            sourceRecordId: row.id,
            observedAt: row.createdAt,
            source: 'HomeEventRadar property match',
            confidence: row.confidenceScore == null ? null : Number(row.confidenceScore),
          })),
      }));
    },
  },
  PropertyRadarCompoundInsight: {
    producerModel: 'PropertyRadarCompoundInsight',
    async read(input) {
      const rows = await prisma.propertyRadarCompoundInsight.findMany({
        where: { propertyId: input.propertyId, createdAt: createdAtWhere(input) },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: input.offset,
        take: input.rowLimit,
      });
      return rows.map((row) => propertyRadarCompoundInsightEnvelopeAdapter.map(row, {
        propertyId: input.propertyId,
        userId: input.userId,
        evidence: dedupeEvidence(
          compoundEvidence(row),
          sourceEvidence({ producerModel: 'PropertyRadarCompoundInsight', sourceRecordId: row.id, observedAt: row.evaluatedAt }),
        ),
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

const COMPONENT_INVENTORY_CATEGORIES: Readonly<Record<PropertyComponentKind, readonly InventoryItemCategory[]>> = Object.freeze({
  ROOF: ['ROOF_EXTERIOR'],
  FOUNDATION: ['STRUCTURAL'],
  EXTERIOR: ['EXTERIOR', 'ROOF_EXTERIOR'],
  INTERIOR: ['INTERIOR'],
  SITE: ['SITE'],
});

function matchesEntityScope(item: IntelligenceEnvelopeItem, requested: EnvelopeEntityRef): boolean {
  const actual = item.subject.entityRef;
  if (!actual) return false;
  if (entityRefKey(actual) === entityRefKey(requested)) return true;

  // A PROPERTY component ref is an aggregate query scope, not a claim that an
  // inventory row is itself the property. It may match typed inventory refs
  // registered beneath that physical component, while remaining property-
  // bound and category-closed. This makes §24.5's `{PROPERTY, ROOF}` query
  // useful without weakening ordinary exact entity-ref matching.
  if (requested.entityType !== 'PROPERTY' || !requested.componentKind) return false;
  if (requested.entityId !== item.subject.propertyId || actual.entityType !== 'INVENTORY_ITEM') return false;
  return COMPONENT_INVENTORY_CATEGORIES[requested.componentKind].includes(actual.assetCategory);
}

function matchesQuery(item: IntelligenceEnvelopeItem, query: ReturnType<typeof IntelligenceEnvelopeQuerySchema.parse>): boolean {
  if (query.types?.length && !query.types.includes(item.type)) return false;
  if (query.domains?.length && !query.domains.includes(item.domain)) return false;
  if (query.sourceModels?.length && !query.sourceModels.includes(item.source.sourceModel)) return false;
  if (query.currentness?.length && !query.currentness.includes(item.freshness.currentness)) return false;
  if (query.entityRefs?.length) {
    if (!query.entityRefs.some((requested) => matchesEntityScope(item, requested))) return false;
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
  collectAllMatchingRows = false,
): Promise<IntelligenceEnvelopeCoveragePage> {
  const query = IntelligenceEnvelopeQuerySchema.parse(rawQuery);
  const dependencies: IntelligenceEnvelopeQueryDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides };
  const cursor = query.cursor ? decodeEnvelopeCursor(query.cursor, query) : null;

  // This check intentionally precedes every producer read. Callers receive the
  // same error for an unknown property and an inaccessible property.
  if (!await dependencies.authorizeProperty(query.principal.userId, query.propertyId)) {
    throw new IntelligenceEnvelopeAccessDeniedError();
  }

  const wallStartedAt = Date.now();
  const producerModels = query.sourceModels?.length ? query.sourceModels : [...ENVELOPE_PRODUCER_MODELS];
  const rowLimit = Math.min(ENVELOPE_QUERY_MAX_ROWS_PER_PRODUCER, Math.max(100, query.limit * 3));
  const reads = producerModels.map(async (producerModel) => {
    const reader = dependencies.readers[producerModel];
    const readerStartedAt = Date.now();
    const results: EnvelopeAdapterResult[] = [];
    let offset = 0;
    try {
      while (true) {
        const totalRemaining = dependencies.totalTimeoutMs - (Date.now() - wallStartedAt);
        const adapterRemaining = dependencies.perAdapterTimeoutMs - (Date.now() - readerStartedAt);
        const remaining = Math.min(totalRemaining, adapterRemaining);
        if (remaining <= 0) throw new Error('ENVELOPE_ADAPTER_TIMEOUT');
        const batch = await readWithTimeout(reader, {
          propertyId: query.propertyId,
          userId: query.principal.userId,
          ...(query.createdAfter ? { createdAfter: new Date(query.createdAfter) } : {}),
          ...(query.createdBefore ? { createdBefore: new Date(query.createdBefore) } : {}),
          ...(cursor ? { createdAtOnOrBefore: new Date(cursor.createdAt) } : {}),
          rowLimit,
          offset,
        }, remaining);
        results.push(...batch);

        const matchingItems = results
          .flatMap((result) => result.item ? [result.item] : [])
          .filter((item) => item.subject.propertyId === query.propertyId)
          .filter((item) => matchesQuery(item, query))
          .filter((item) => !cursor || isAfterCursor(item, cursor))
          .sort(compareItems);
        const pageBoundary = matchingItems.at(query.limit);
        const lastMappedItem = [...batch].reverse().find((result) => result.item)?.item;
        // Database readers order by native created time and id, while the
        // public contract breaks timestamp ties by envelopeKey. We may stop
        // only after the native scan has moved strictly past the provisional
        // page boundary; otherwise an unread same-timestamp row could sort
        // ahead of it and be skipped forever.
        const safelyPastPageBoundary = Boolean(
          pageBoundary
          && lastMappedItem
          && Date.parse(lastMappedItem.createdAt) < Date.parse(pageBoundary.createdAt),
        );
        if (batch.length < rowLimit || (!collectAllMatchingRows && safelyPastPageBoundary)) break;
        offset += batch.length;
      }
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
  return executeIntelligenceEnvelopeQuery(rawQuery, {
    perAdapterTimeoutMs: ENVELOPE_COVERAGE_PER_ADAPTER_TIMEOUT_MS,
    totalTimeoutMs: ENVELOPE_COVERAGE_TOTAL_TIMEOUT_MS,
    ...dependencyOverrides,
  }, true);
}
