import { prisma } from '../lib/prisma';
import { emitPropertyChange } from './propertyChange.service';

type Candidate = Parameters<typeof emitPropertyChange>[0];

function timestampRevision(updatedAt: Date, discriminator?: string | null) {
  return `${updatedAt.toISOString()}:${discriminator ?? 'current'}`;
}

async function emitAll(candidates: Candidate[]) {
  const results = [];
  // Auto-assigned revisions are serialized in the same order the source rows
  // changed, so a delayed briefing reconciliation cannot invert source state.
  for (const candidate of candidates.sort(
    (left, right) => (left.detectedAt?.getTime() ?? 0) - (right.detectedAt?.getTime() ?? 0),
  )) {
    results.push(await emitPropertyChange(candidate));
  }
  return results;
}

/**
 * Reconciles canonical records into the change ledger before briefing selection.
 * This deliberately references canonical rows instead of copying their payloads.
 * It also covers records written by workers and legacy services that do not share
 * a single application-layer event bus.
 */
export async function reconcileCanonicalPropertyChanges(input: {
  propertyId: string;
  since: Date;
  through: Date;
}) {
  const [events, facts, documents, claims, projects, maintenance] = await Promise.all([
    prisma.homeEvent.findMany({
      where: {
        propertyId: input.propertyId,
        isCurrent: true,
        deletedAt: null,
        updatedAt: { gte: input.since, lte: input.through },
      },
      select: {
        id: true,
        revision: true,
        occurredAt: true,
        updatedAt: true,
        verificationStatus: true,
        observationKind: true,
        importance: true,
      },
    }),
    prisma.propertyFactEvidence.findMany({
      where: {
        propertyId: input.propertyId,
        supersededAt: null,
        OR: [
          { observedAt: { gte: input.since, lte: input.through } },
          { verifiedAt: { gte: input.since, lte: input.through } },
        ],
      },
      select: {
        id: true,
        factKey: true,
        sourceEntityType: true,
        sourceEntityId: true,
        observedAt: true,
        verifiedAt: true,
        confidence: true,
      },
    }),
    prisma.document.findMany({
      where: {
        propertyId: input.propertyId,
        verificationStatus: 'VERIFIED',
        updatedAt: { gte: input.since, lte: input.through },
      },
      select: { id: true, updatedAt: true, verifiedAt: true },
    }),
    prisma.claim.findMany({
      where: {
        propertyId: input.propertyId,
        updatedAt: { gte: input.since, lte: input.through },
      },
      select: { id: true, status: true, incidentAt: true, updatedAt: true },
    }),
    prisma.projectRecord.findMany({
      where: {
        propertyId: input.propertyId,
        updatedAt: { gte: input.since, lte: input.through },
      },
      select: { id: true, status: true, startDate: true, actualEndDate: true, updatedAt: true },
    }),
    prisma.propertyMaintenanceTask.findMany({
      where: {
        propertyId: input.propertyId,
        updatedAt: { gte: input.since, lte: input.through },
      },
      select: {
        id: true,
        status: true,
        priority: true,
        nextDueDate: true,
        lastCompletedDate: true,
        updatedAt: true,
      },
    }),
  ]);

  // A fact may have multiple active evidence rows from different sources.
  // A homeowner briefing represents the semantic fact once, using the most
  // recently verified/observed evidence, rather than emitting duplicate cards.
  const latestFactsByKey = [...facts]
    .sort((left, right) =>
      (left.verifiedAt ?? left.observedAt).getTime()
      - (right.verifiedAt ?? right.observedAt).getTime())
    .reduce((byKey, fact) => byKey.set(fact.factKey, fact), new Map<string, (typeof facts)[number]>());
  const briefingFacts = [...latestFactsByKey.values()];

  const candidates: Candidate[] = [
    ...events.map((event): Candidate => ({
      propertyId: input.propertyId,
      sourceType: 'HOME_EVENT',
      sourceEntityId: event.id,
      sourceRevision: String(event.revision),
      sourceRevisionOrdinal: event.revision,
      changeType: event.revision > 1 ? 'SOURCE_RECORD_REVISED' : 'SOURCE_RECORD_CREATED',
      occurredAt: event.occurredAt,
      detectedAt: event.updatedAt,
      confidence: ['EVIDENCE_VERIFIED', 'HOMEOWNER_CONFIRMED'].includes(event.verificationStatus) ? 1 : null,
      sourceHealth: 'CURRENT',
      signals: {
        homeownerRelevant: event.observationKind !== 'INFERRED',
        lifecycleAdvanced: event.revision > 1,
        propertyEffectConfirmed: ['EVIDENCE_VERIFIED', 'HOMEOWNER_CONFIRMED'].includes(event.verificationStatus),
        urgentSafetyCondition: false,
        canonicalActionPriority: event.importance === 'HIGHLIGHT' ? 'SOON' : null,
      },
      canonicalEventId: event.id,
    })),
    ...briefingFacts.map((fact): Candidate => ({
      propertyId: input.propertyId,
      sourceType: 'PROPERTY_FACT',
      sourceEntityId: fact.id,
      sourceRevision: timestampRevision(fact.observedAt, fact.verifiedAt?.toISOString()),
      changeType: 'PROPERTY_FACT_CHANGED',
      occurredAt: fact.observedAt,
      detectedAt: fact.verifiedAt ?? fact.observedAt,
      confidence: fact.confidence,
      sourceHealth: 'CURRENT',
      changedFactKeys: [fact.factKey],
      canonicalReferences: [{
        entityType: fact.sourceEntityType || 'PROPERTY',
        entityId: fact.sourceEntityId || input.propertyId,
        fieldPath: fact.factKey,
      }],
      signals: {
        homeownerRelevant: fact.verifiedAt != null || (fact.confidence ?? 0) >= 0.5,
        lifecycleAdvanced: fact.verifiedAt != null,
        propertyEffectConfirmed: false,
        urgentSafetyCondition: false,
        canonicalActionPriority: null,
      },
    })),
    ...documents.map((document): Candidate => ({
      propertyId: input.propertyId,
      sourceType: 'DOCUMENT',
      sourceEntityId: document.id,
      sourceRevision: timestampRevision(document.updatedAt, 'VERIFIED'),
      changeType: 'SOURCE_RECORD_REVISED',
      occurredAt: document.verifiedAt ?? document.updatedAt,
      detectedAt: document.updatedAt,
      confidence: 1,
      sourceHealth: 'CURRENT',
      signals: {
        homeownerRelevant: true,
        lifecycleAdvanced: true,
        propertyEffectConfirmed: false,
        urgentSafetyCondition: false,
        canonicalActionPriority: null,
      },
    })),
    ...claims.map((claim): Candidate => ({
      propertyId: input.propertyId,
      sourceType: 'CLAIM_RECORD',
      sourceEntityId: claim.id,
      sourceRevision: timestampRevision(claim.updatedAt, claim.status),
      changeType: 'SOURCE_LIFECYCLE_CHANGED',
      occurredAt: claim.incidentAt ?? claim.updatedAt,
      detectedAt: claim.updatedAt,
      confidence: 1,
      sourceHealth: 'CURRENT',
      signals: {
        homeownerRelevant: true,
        lifecycleAdvanced: true,
        propertyEffectConfirmed: claim.status === 'CLOSED',
        urgentSafetyCondition: false,
        canonicalActionPriority: null,
      },
    })),
    ...projects.map((project): Candidate => ({
      propertyId: input.propertyId,
      sourceType: 'PROJECT_RECORD',
      sourceEntityId: project.id,
      sourceRevision: timestampRevision(project.updatedAt, project.status),
      changeType: 'SOURCE_LIFECYCLE_CHANGED',
      occurredAt: project.actualEndDate ?? project.startDate,
      detectedAt: project.updatedAt,
      confidence: 1,
      sourceHealth: 'CURRENT',
      signals: {
        homeownerRelevant: true,
        lifecycleAdvanced: true,
        propertyEffectConfirmed: project.status === 'COMPLETED',
        urgentSafetyCondition: false,
        canonicalActionPriority: null,
      },
    })),
    ...maintenance.map((task): Candidate => ({
      propertyId: input.propertyId,
      sourceType: 'MAINTENANCE_RECORD',
      sourceEntityId: task.id,
      sourceRevision: timestampRevision(task.updatedAt, task.status),
      changeType: 'SOURCE_LIFECYCLE_CHANGED',
      occurredAt: task.lastCompletedDate ?? task.nextDueDate ?? task.updatedAt,
      detectedAt: task.updatedAt,
      confidence: 1,
      sourceHealth: 'CURRENT',
      signals: {
        homeownerRelevant: task.status === 'COMPLETED'
          || (task.status !== 'CANCELLED'
            && task.nextDueDate != null
            && task.nextDueDate < input.through),
        lifecycleAdvanced: task.status === 'COMPLETED',
        propertyEffectConfirmed: task.status === 'COMPLETED',
        urgentSafetyCondition: false,
        canonicalActionPriority: task.status !== 'COMPLETED'
          && task.status !== 'CANCELLED'
          && task.nextDueDate != null
          && task.nextDueDate < input.through
          ? task.priority === 'URGENT' ? 'NOW' : 'SOON'
          : null,
      },
    })),
  ];

  const results = await emitAll(candidates);
  return {
    examined: candidates.length,
    created: results.filter((result) => !result.deduped).length,
    deduped: results.filter((result) => result.deduped).length,
  };
}
