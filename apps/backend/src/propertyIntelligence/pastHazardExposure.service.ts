import {
  IntelligenceSourceFamily,
  PropertyHazardEffectStatus,
  PropertyHazardEvidenceKind,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { resolveAndUpsertWorkItem } from '../modules/homeOperations/application/resolveWorkItem.usecase';
import {
  getPropertyIntelligenceCoverage,
  getPropertyIntelligenceObservations,
} from './propertyIntelligence.service';

const HAZARD_SOURCE_FAMILIES = new Set<IntelligenceSourceFamily>([
  IntelligenceSourceFamily.HAZARD,
  IntelligenceSourceFamily.FLOOD_MAP,
  IntelligenceSourceFamily.ENVIRONMENTAL,
]);

const LONG_TERM_MARKERS = [
  'LONG_TERM',
  'CLIMATE_NORMAL',
  'FLOOD_ZONE',
  'WILDFIRE_ZONE',
  'SEA_LEVEL',
  'HEAT_TREND',
  'DROUGHT_TREND',
  'RADON_ZONE',
];

function isLongTermObservation(type: string) {
  const normalized = type.toUpperCase();
  return LONG_TERM_MARKERS.some((marker) => normalized.includes(marker));
}

function hazardLabel(type: string) {
  return type
    .replace(/_EVENT$|_OBSERVATION$|_EXPOSURE$|_ZONE$/gi, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function factualText(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sourceEnvironment() {
  return process.env.NODE_ENV || 'development';
}

function effectCopy(status: PropertyHazardEffectStatus) {
  if (status === PropertyHazardEffectStatus.NO_OBSERVED_EFFECT) {
    return 'The household reported no observed effect. This does not prove that no hidden effect occurred.';
  }
  if (status === PropertyHazardEffectStatus.OBSERVED_EFFECT_CONFIRMED) {
    return 'The household reported an observed effect. Review linked evidence for what is actually documented.';
  }
  return 'No property effect has been confirmed. A geographic match is not evidence of damage.';
}

export async function getPastHazardExposure(
  propertyId: string,
  input: { from?: Date; to?: Date; hazardType?: string } = {},
) {
  const environment = sourceEnvironment();
  const [coverageRows, observationRows] = await Promise.all([
    getPropertyIntelligenceCoverage(propertyId, environment),
    getPropertyIntelligenceObservations(propertyId, environment),
  ]);
  const coverage = coverageRows.filter((row) =>
    HAZARD_SOURCE_FAMILIES.has(row.source.family));
  const hazardRows = observationRows.filter((row) =>
    HAZARD_SOURCE_FAMILIES.has(row.observation.source.family));

  const matchIds = hazardRows.map((row) => row.id);
  const outcomes = matchIds.length > 0
    ? await prisma.propertyHazardOutcome.findMany({
        where: { propertyId, propertyMatchId: { in: matchIds } },
        include: {
          evidence: {
            include: {
              claim: { select: { id: true, title: true, status: true } },
              homeEvent: { select: { id: true, title: true, type: true, occurredAt: true } },
              document: { select: { id: true, name: true, type: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          assertions: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      })
    : [];
  const outcomeByMatchId = new Map(outcomes.map((outcome) => [outcome.propertyMatchId, outcome]));

  const filtered = hazardRows.filter((row) => {
    const date = row.observation.observedAt
      ?? row.observation.effectiveFrom
      ?? row.observation.lastVerifiedAt;
    if (input.from && date < input.from) return false;
    if (input.to && date > input.to) return false;
    if (
      input.hazardType
      && row.observation.observationType.toUpperCase() !== input.hazardType.toUpperCase()
    ) return false;
    return true;
  });

  const items = filtered.map((row) => {
    const observation = row.observation;
    const outcome = outcomeByMatchId.get(row.id);
    const status = outcome?.status ?? PropertyHazardEffectStatus.UNKNOWN;
    const assessment = row.assessments[0] ?? null;
    return {
      propertyMatchId: row.id,
      hazardType: observation.observationType,
      hazardLabel: hazardLabel(observation.observationType),
      category: isLongTermObservation(observation.observationType)
        ? 'LONG_TERM_CONTEXT' as const
        : 'PAST_EVENT' as const,
      title: factualText(observation.factualPayload, 'title')
        ?? hazardLabel(observation.observationType),
      factualSummary: factualText(observation.factualPayload, 'summary')
        ?? factualText(observation.factualPayload, 'description'),
      lifecycleStatus: observation.lifecycleStatus,
      observedAt: observation.observedAt,
      effectiveFrom: observation.effectiveFrom,
      effectiveTo: observation.effectiveTo,
      geography: {
        sourceType: observation.geographyType,
        sourceKey: observation.geographyKey,
        matchedGeography: row.matchedGeography,
        precision: row.geographicPrecision,
        distanceMiles: row.distanceMiles,
        matchMethod: row.matchMethod,
      },
      source: {
        key: observation.source.key,
        provider: observation.source.provider,
        url: observation.sourceUrl,
        publishedAt: observation.sourcePublishedAt,
        lastVerifiedAt: observation.lastVerifiedAt,
        revision: observation.revision,
      },
      interpretation: {
        relevance: assessment?.relevance ?? 'UNKNOWN',
        confidence: assessment?.confidence ?? row.matchConfidence,
        missingFacts: assessment?.missingFacts ?? ['PROPERTY_EFFECT_EVIDENCE'],
        boundedExplanation: assessment?.boundedExplanation
          ?? 'The source observation geographically matches this property. This does not confirm an effect on the home.',
      },
      propertyEffect: {
        outcomeId: outcome?.id ?? null,
        status,
        effectObservedAt: outcome?.effectObservedAt ?? null,
        note: outcome?.note ?? null,
        explanation: effectCopy(status),
        evidence: outcome?.evidence ?? [],
        assertions: outcome?.assertions ?? [],
        canonicalActionId: outcome?.canonicalActionId ?? null,
        canonicalTimelineEventId: outcome?.canonicalTimelineEventId ?? null,
      },
    };
  });

  const coverageStates = coverage.map((row) => row.state);
  const coverageState =
    coverage.length === 0 ? 'NOT_CONFIGURED'
      : coverageStates.some((state) => state === 'CURRENT') ? 'CURRENT'
        : coverageStates.some((state) => state === 'DEGRADED') ? 'DEGRADED'
          : coverageStates.some((state) => state === 'STALE') ? 'STALE'
            : 'UNAVAILABLE';
  const checkedThrough = coverage
    .map((row) => row.checkedThrough)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

  return {
    propertyId,
    generatedAt: new Date(),
    coverage: {
      state: coverageState,
      comprehensive: false,
      checkedThrough,
      sources: coverage,
      limitations: [
        ...new Set(coverage.flatMap((row) => row.limitations)),
        'Source coverage is bounded by provider, geography, and checked-through date.',
        'No nearby or matched observation is proof that this home was damaged.',
      ],
    },
    longTermContext: items.filter((item) => item.category === 'LONG_TERM_CONTEXT'),
    pastEvents: items.filter((item) => item.category === 'PAST_EVENT'),
    emptyState:
      items.length === 0
        ? coverageState === 'CURRENT'
          ? 'No matching records were returned within the reviewed source scope and selected dates. This is not confirmation that no hazard occurred.'
          : 'Past hazard results are unavailable or incomplete because reviewed source coverage is not current.'
        : null,
  };
}

async function requireHazardMatch(propertyId: string, propertyMatchId: string) {
  const match = await prisma.propertyObservationMatch.findFirst({
    where: {
      id: propertyMatchId,
      propertyId,
      observation: {
        supersededBy: { none: {} },
        source: {
          family: { in: [...HAZARD_SOURCE_FAMILIES] },
          reviewedStatus: 'APPROVED',
          enabledEnvironments: { has: sourceEnvironment() },
          pausedAt: null,
        },
      },
    },
    include: { observation: true, assessments: { where: { supersededAt: null }, take: 1 } },
  });
  if (!match) {
    throw new APIError(
      'Reviewed hazard observation match not found.',
      404,
      'HAZARD_MATCH_NOT_FOUND',
    );
  }
  return match;
}

async function ensureTimelineEvent(
  outcomeId: string,
  userId: string,
  match: Awaited<ReturnType<typeof requireHazardMatch>>,
  effectObservedAt: Date | null,
  note: string,
) {
  const occurredAt = effectObservedAt
    ?? match.observation.observedAt
    ?? match.observation.effectiveFrom
    ?? match.observation.lastVerifiedAt;
  const event = await prisma.homeEvent.upsert({
    where: {
      propertyId_idempotencyKey: {
        propertyId: match.propertyId,
        idempotencyKey: `hazard-outcome:${outcomeId}`,
      },
    },
    create: {
      propertyId: match.propertyId,
      createdById: userId,
      type: 'OTHER',
      subtype: 'CONFIRMED_HAZARD_EFFECT',
      occurredAt,
      datePrecision: effectObservedAt ? 'EXACT_DATE' : 'UNKNOWN',
      title: `${hazardLabel(match.observation.observationType)} effect reported`,
      summary: note,
      groupKey: `hazard:${match.observationId}`,
      groupType: 'HAZARD_OUTCOME',
      idempotencyKey: `hazard-outcome:${outcomeId}`,
      observationKind: 'USER_REPORTED',
      verificationStatus: 'HOMEOWNER_CONFIRMED',
      sourceType: 'DOMAIN_ENTITY',
      sourceEntityType: 'PropertyHazardOutcome',
      sourceEntityId: outcomeId,
      sourceAsOf: new Date(),
      confirmedAt: new Date(),
      confirmedByUserId: userId,
    },
    update: {},
  });
  await prisma.propertyHazardOutcome.update({
    where: { id: outcomeId },
    data: { canonicalTimelineEventId: event.id },
  });
  return event;
}

export async function recordPropertyHazardOutcome(input: {
  propertyId: string;
  propertyMatchId: string;
  userId: string;
  status: PropertyHazardEffectStatus;
  effectObservedAt?: Date | null;
  note: string;
}) {
  const match = await requireHazardMatch(input.propertyId, input.propertyMatchId);
  const outcome = await prisma.$transaction(async (tx) => {
    const current = await tx.propertyHazardOutcome.upsert({
      where: { propertyMatchId: input.propertyMatchId },
      create: {
        propertyId: input.propertyId,
        propertyMatchId: input.propertyMatchId,
        status: input.status,
        effectObservedAt: input.effectObservedAt ?? null,
        note: input.note,
        confirmedAt: new Date(),
        confirmedByUserId: input.userId,
      },
      update: {
        status: input.status,
        effectObservedAt: input.effectObservedAt ?? null,
        note: input.note,
        confirmedAt: new Date(),
        confirmedByUserId: input.userId,
      },
    });
    await tx.propertyHazardOutcomeAssertion.create({
      data: {
        outcomeId: current.id,
        status: input.status,
        effectObservedAt: input.effectObservedAt ?? null,
        note: input.note,
        assertedByUserId: input.userId,
      },
    });
    return current;
  });

  if (input.status === PropertyHazardEffectStatus.OBSERVED_EFFECT_CONFIRMED) {
    await ensureTimelineEvent(
      outcome.id,
      input.userId,
      match,
      input.effectObservedAt ?? null,
      input.note,
    );
  }
  return prisma.propertyHazardOutcome.findUnique({
    where: { id: outcome.id },
    include: { evidence: true, assertions: { orderBy: { createdAt: 'desc' } } },
  });
}

async function validateEvidence(input: {
  propertyId: string;
  kind: PropertyHazardEvidenceKind;
  claimId?: string | null;
  homeEventId?: string | null;
  documentId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}) {
  if (input.kind === PropertyHazardEvidenceKind.CLAIM) {
    if (!input.claimId) throw new APIError('claimId is required.', 400, 'CLAIM_ID_REQUIRED');
    const claim = await prisma.claim.findFirst({
      where: { id: input.claimId, propertyId: input.propertyId },
      select: { id: true },
    });
    if (!claim) throw new APIError('Claim not found.', 404, 'CLAIM_NOT_FOUND');
    return `claim:${claim.id}`;
  }
  if (
    input.kind === PropertyHazardEvidenceKind.INSPECTION
    || input.kind === PropertyHazardEvidenceKind.REPAIR
  ) {
    if (!input.homeEventId) {
      throw new APIError('homeEventId is required.', 400, 'HOME_EVENT_ID_REQUIRED');
    }
    const event = await prisma.homeEvent.findFirst({
      where: { id: input.homeEventId, propertyId: input.propertyId, deletedAt: null },
      select: { id: true, type: true },
    });
    const allowed = input.kind === PropertyHazardEvidenceKind.INSPECTION
      ? ['INSPECTION']
      : ['REPAIR', 'MAINTENANCE', 'IMPROVEMENT'];
    if (!event || !allowed.includes(event.type)) {
      throw new APIError(
        `A matching ${input.kind.toLowerCase()} event was not found.`,
        404,
        'HOME_EVENT_EVIDENCE_NOT_FOUND',
      );
    }
    return `home-event:${event.id}`;
  }
  if (
    input.kind === PropertyHazardEvidenceKind.PHOTO
    || input.kind === PropertyHazardEvidenceKind.DOCUMENT
  ) {
    if (!input.documentId) {
      throw new APIError('documentId is required.', 400, 'DOCUMENT_ID_REQUIRED');
    }
    const document = await prisma.document.findFirst({
      where: { id: input.documentId, propertyId: input.propertyId },
      select: { id: true },
    });
    if (!document) throw new APIError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
    return `document:${document.id}`;
  }
  if (!input.entityType || !input.entityId) {
    throw new APIError(
      'User attestation requires entityType and entityId.',
      400,
      'ATTESTATION_IDENTITY_REQUIRED',
    );
  }
  return `attestation:${input.entityType}:${input.entityId}`;
}

export async function linkPropertyHazardEvidence(input: {
  propertyId: string;
  outcomeId: string;
  userId: string;
  kind: PropertyHazardEvidenceKind;
  claimId?: string | null;
  homeEventId?: string | null;
  documentId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  note?: string | null;
}) {
  const outcome = await prisma.propertyHazardOutcome.findFirst({
    where: { id: input.outcomeId, propertyId: input.propertyId },
    include: { propertyMatch: { include: { observation: true } } },
  });
  if (!outcome) throw new APIError('Hazard outcome not found.', 404, 'HAZARD_OUTCOME_NOT_FOUND');
  const entityKey = await validateEvidence(input);
  const evidence = await prisma.propertyHazardEvidenceLink.upsert({
    where: { outcomeId_entityKey: { outcomeId: outcome.id, entityKey } },
    create: {
      outcomeId: outcome.id,
      kind: input.kind,
      entityKey,
      claimId: input.claimId ?? null,
      homeEventId: input.homeEventId ?? null,
      documentId: input.documentId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      note: input.note ?? null,
      linkedByUserId: input.userId,
    },
    update: { note: input.note ?? undefined },
  });

  if (outcome.canonicalTimelineEventId) {
    const timelineEvidenceType =
      input.kind === PropertyHazardEvidenceKind.REPAIR ? 'REPAIR_RECORD'
        : input.kind === PropertyHazardEvidenceKind.DOCUMENT ? 'DOCUMENT'
          : input.kind;
    await prisma.homeEventEvidence.upsert({
      where: {
        eventId_evidenceKey: {
          eventId: outcome.canonicalTimelineEventId,
          evidenceKey: entityKey,
        },
      },
      create: {
        eventId: outcome.canonicalTimelineEventId,
        evidenceType: timelineEvidenceType,
        evidenceKey: entityKey,
        documentId: input.documentId ?? null,
        sourceEntityType:
          input.kind === PropertyHazardEvidenceKind.CLAIM ? 'Claim'
            : input.kind === PropertyHazardEvidenceKind.INSPECTION
              || input.kind === PropertyHazardEvidenceKind.REPAIR ? 'HomeEvent'
              : input.entityType ?? null,
        sourceEntityId:
          input.claimId ?? input.homeEventId ?? input.entityId ?? null,
        note: input.note ?? null,
        addedByUserId: input.userId,
      },
      update: { note: input.note ?? undefined },
    });
  }

  if (outcome.status === PropertyHazardEffectStatus.OBSERVED_EFFECT_CONFIRMED) {
    const workItem = await resolveAndUpsertWorkItem({
      propertyId: input.propertyId,
      subject: { type: 'PROPERTY', id: input.propertyId },
      obligationType: 'INCIDENT_RESPONSE',
      occurrence: {
        obligationSlug: 'review-confirmed-hazard-effect',
        occurrenceKey: outcome.propertyMatch.observation.externalId,
      },
      title: `Review reported ${hazardLabel(outcome.propertyMatch.observation.observationType)} effect`,
      homeownerReason:
        'A household-reported property effect now has linked evidence. Decide whether inspection, documentation, or maintenance is still needed.',
      expectedOutcome:
        'The confirmed outcome and evidence are reviewed, with any necessary follow-up tracked once in Home Actions.',
      priority: 'SOON',
      safetyTier: 'LOW_CONSEQUENCE',
      confidence: 1,
      source: {
        sourceType: 'HAZARD_OBSERVATION',
        sourceEntityId: outcome.id,
        sourceVersion: outcome.updatedAt.toISOString(),
        sourceRole: 'TRIGGER',
      },
    });
    await prisma.propertyHazardOutcome.update({
      where: { id: outcome.id },
      data: { canonicalActionId: workItem.id },
    });
  }
  return evidence;
}
