import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { runMatchingForEvent } from '../../../services/homeEventRadarMatcher.service';

export const RADAR_PROPERTY_RECONCILIATION_PAYLOAD_VERSION = 1;
export const RADAR_PROPERTY_RECONCILIATION_DEFAULT_PAGE_SIZE = 25;
export const RADAR_PROPERTY_RECONCILIATION_MAX_PAGE_SIZE = 100;

export const radarPropertyReconciliationReasonSchema = z.enum([
  'property_created',
  'geography_changed',
  'property_facts_changed',
  'responsibility_changed',
  'mitigation_changed',
]);

export type RadarPropertyReconciliationReason = z.infer<
  typeof radarPropertyReconciliationReasonSchema
>;

const RADAR_RELEVANT_FACT_KEYS = new Set([
  'core.dwellingType',
  'core.yearBuilt',
  'core.propertySizeSqFt',
  'structure.roofType',
  'structure.roofReplacementYear',
  'structure.foundationType',
  'systems.heatingType',
  'systems.coolingType',
  'systems.waterHeaterType',
  'safety.hasSumpPump',
  'safety.hasSumpPumpBackup',
  'exterior.hasIrrigation',
  'exterior.hasDrainageIssues',
]);

export function radarReconciliationReasonForFactKey(
  factKey: string,
): RadarPropertyReconciliationReason | null {
  if (
    factKey === 'location.city'
    || factKey === 'location.state'
    || factKey === 'location.zipCode'
  ) {
    return 'geography_changed';
  }
  if (factKey.startsWith('responsibility.')) return 'responsibility_changed';
  return RADAR_RELEVANT_FACT_KEYS.has(factKey)
    ? 'property_facts_changed'
    : null;
}

export const radarPropertyReconciliationPayloadSchema = z.object({
  payloadVersion: z.literal(RADAR_PROPERTY_RECONCILIATION_PAYLOAD_VERSION),
  propertyId: z.string().trim().min(1),
  reasons: z.array(radarPropertyReconciliationReasonSchema).min(1).max(5)
    .transform((reasons) => [...new Set(reasons)].sort()),
  changeToken: z.string().trim().min(1).max(200),
  correlationId: z.string().trim().min(1).max(200),
  requestedAt: z.string().datetime({ offset: true }),
  afterEventId: z.string().trim().min(1).optional(),
  pageSize: z.number().int().min(1).max(RADAR_PROPERTY_RECONCILIATION_MAX_PAGE_SIZE),
});

export type RadarPropertyReconciliationPayload = z.infer<
  typeof radarPropertyReconciliationPayloadSchema
>;

type DomainEventWriter = Pick<
  Prisma.TransactionClient,
  'domainEvent'
>;

type RadarPropertyReconciliationDb = {
  property: {
    findUnique(args: unknown): Promise<{ id: string } | null>;
  };
  radarEvent: {
    findMany(args: unknown): Promise<any[]>;
  };
  domainEvent: DomainEventWriter['domainEvent'];
};

type RadarMatchPort = typeof runMatchingForEvent;

export type RadarPropertyReconciliationOutcome = {
  outcome: 'property_missing' | 'page_reconciled';
  propertyId: string;
  reasons: RadarPropertyReconciliationReason[];
  evaluatedEvents: number;
  matched: number;
  noLongerEligible: number;
  continuationCreated: boolean;
  nextCursor: string | null;
};

function reconciliationIdempotencyKey(
  payload: Pick<
    RadarPropertyReconciliationPayload,
    'propertyId' | 'changeToken' | 'afterEventId'
  >,
): string {
  const digest = createHash('sha256')
    .update(
      `${payload.propertyId}\n${payload.changeToken}\n${payload.afterEventId ?? 'root'}`,
    )
    .digest('hex');
  return `radar-property-reconcile:${digest}`;
}

export function configuredRadarPropertyReconciliationPageSize(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.RADAR_PROPERTY_RECONCILIATION_PAGE_SIZE ?? '';
  if (!/^\d+$/.test(raw)) return RADAR_PROPERTY_RECONCILIATION_DEFAULT_PAGE_SIZE;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return RADAR_PROPERTY_RECONCILIATION_DEFAULT_PAGE_SIZE;
  return Math.min(
    RADAR_PROPERTY_RECONCILIATION_MAX_PAGE_SIZE,
    Math.max(1, parsed),
  );
}

export async function requestRadarPropertyReconciliation(
  input: {
    propertyId: string;
    reasons: RadarPropertyReconciliationReason[];
    changeToken: string;
    correlationId: string;
    afterEventId?: string;
    pageSize?: number;
  },
  client: DomainEventWriter = prisma,
  now: Date = new Date(),
) {
  const payload = radarPropertyReconciliationPayloadSchema.parse({
    payloadVersion: RADAR_PROPERTY_RECONCILIATION_PAYLOAD_VERSION,
    ...input,
    requestedAt: now.toISOString(),
    pageSize:
      input.pageSize ?? configuredRadarPropertyReconciliationPageSize(),
  });
  const idempotencyKey = reconciliationIdempotencyKey(payload);
  return client.domainEvent.upsert({
    where: { idempotencyKey },
    create: {
      type: 'RADAR_PROPERTY_RECONCILIATION_REQUESTED' as any,
      status: 'PENDING',
      propertyId: payload.propertyId,
      idempotencyKey,
      payload,
    },
    update: {},
  });
}

/**
 * Reconciles one bounded page of active canonical events for a property.
 * A continuation is itself a durable outbox event, so no worker execution can
 * expand into an unbounded all-event transaction.
 */
export async function processRadarPropertyReconciliationEvent(
  event: {
    id: string;
    propertyId?: string | null;
    payload: unknown;
  },
  deps: {
    db?: RadarPropertyReconciliationDb;
    matchEvent?: RadarMatchPort;
    now?: () => Date;
  } = {},
): Promise<RadarPropertyReconciliationOutcome> {
  const db = deps.db ?? (prisma as unknown as RadarPropertyReconciliationDb);
  const matchEvent = deps.matchEvent ?? runMatchingForEvent;
  const now = deps.now?.() ?? new Date();
  const payload = radarPropertyReconciliationPayloadSchema.parse(event.payload);
  if (event.propertyId && event.propertyId !== payload.propertyId) {
    throw new Error('Radar property reconciliation scope does not match its payload');
  }

  const property = await db.property.findUnique({
    where: { id: payload.propertyId },
    select: { id: true },
  });
  if (!property) {
    return {
      outcome: 'property_missing',
      propertyId: payload.propertyId,
      reasons: payload.reasons,
      evaluatedEvents: 0,
      matched: 0,
      noLongerEligible: 0,
      continuationCreated: false,
      nextCursor: null,
    };
  }

  const events = await db.radarEvent.findMany({
    where: {
      status: { in: ['active', 'updated'] },
      ...(payload.afterEventId ? { id: { gt: payload.afterEventId } } : {}),
    },
    orderBy: { id: 'asc' },
    take: payload.pageSize + 1,
    select: {
      id: true,
      sourceDefinitionId: true,
      sourceRunId: true,
      revisions: {
        orderBy: [
          { observedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: 1,
        select: {
          id: true,
          revisionIdentity: true,
          sourceRunId: true,
        },
      },
    },
  });
  const hasMore = events.length > payload.pageSize;
  const page = hasMore ? events.slice(0, payload.pageSize) : events;

  let matched = 0;
  let noLongerEligible = 0;
  for (const radarEvent of page) {
    const revision = radarEvent.revisions?.[0] ?? null;
    const result = await matchEvent(
      radarEvent.id,
      [payload.propertyId],
      {
        radarEventRevisionId: revision?.id ?? null,
        revisionIdentity: revision?.revisionIdentity ?? null,
        sourceRunId: revision?.sourceRunId ?? radarEvent.sourceRunId ?? null,
        sourceDefinitionId: radarEvent.sourceDefinitionId ?? null,
        correlationId: payload.correlationId,
      },
    );
    if (
      result.skipped > 0
      || result.failedPropertyIds.includes(payload.propertyId)
    ) {
      throw new Error(
        `Radar property reconciliation failed for event ${radarEvent.id}`,
      );
    }
    if (result.matched > 0) matched += 1;
    else noLongerEligible += 1;
  }

  const nextCursor = hasMore && page.length > 0
    ? String(page[page.length - 1].id)
    : null;
  if (nextCursor) {
    await requestRadarPropertyReconciliation(
      {
        propertyId: payload.propertyId,
        reasons: payload.reasons,
        changeToken: payload.changeToken,
        correlationId: payload.correlationId,
        afterEventId: nextCursor,
        pageSize: payload.pageSize,
      },
      db,
      now,
    );
  }

  return {
    outcome: 'page_reconciled',
    propertyId: payload.propertyId,
    reasons: payload.reasons,
    evaluatedEvents: page.length,
    matched,
    noLongerEligible,
    continuationCreated: nextCursor !== null,
    nextCursor,
  };
}
