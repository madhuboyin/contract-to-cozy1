import {
  HomeSavingsOpportunityStatus,
  Prisma,
  PropertyHiddenAssetMatchStatus,
  SavingsBenefitActionType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HiddenAssetService } from './hiddenAssets.service';
import { HomeSavingsService } from './homeSavings.service';
import { isProgramActionableNow } from './hiddenAssets/sourceFreshness';
import {
  RecordHiddenAssetMatchOutcomeInput,
  RecordHomeSavingsOpportunityOutcomeInput,
  recordHiddenAssetMatchOutcome,
  recordHomeSavingsOpportunityOutcome,
  revokeHiddenAssetMatchOutcome,
  revokeHomeSavingsOpportunityOutcome,
} from './savingsOutcome.service';
import {
  RecordSensitiveFactInput,
  recordSensitiveFact,
} from './hiddenAssetSensitiveFacts.service';
import {
  getEligibleSavingsBenefitPartner,
  type SavingsBenefitPartnerRecord,
} from './savingsBenefitsPartner.service';
import {
  recordDecisionRecordOutcome,
  resolveCurrentDecisionSnapshotId,
} from './decisionPlatform/outcomeObservationService';

const hiddenAssets = new HiddenAssetService();
const homeSavings = new HomeSavingsService();

export type CanonicalOpportunityFamily = 'BENEFIT' | 'RECURRING_COST';

const CANONICAL_INTENT_ACTION_TYPES = new Set<SavingsBenefitActionType>([
  'SAVE',
  'DISMISS',
  'PREPARE',
  'OFFICIAL_SOURCE_OPENED',
  'QUOTE_REQUESTED',
  'PARTNER_HANDOFF_CONSENTED',
  'EXTERNALLY_SUBMITTED',
  'SWITCHED',
  'FOLLOW_UP_SCHEDULED',
]);

export function isCanonicalIntentActionType(
  actionType: SavingsBenefitActionType,
): boolean {
  return CANONICAL_INTENT_ACTION_TYPES.has(actionType);
}

async function assertProperty(propertyId: string, userId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, homeownerProfile: { userId } },
    select: { id: true, homeownerProfileId: true },
  });
  if (!property) throw new Error('Property not found or access denied.');
  return property;
}

export async function getCanonicalOpportunityDetail(
  propertyId: string,
  opportunityId: string,
  userId: string,
) {
  await assertProperty(propertyId, userId);
  const benefit = await prisma.propertyHiddenAssetMatch.findFirst({
    where: { id: opportunityId, propertyId },
    include: {
      program: { include: { source: true, rules: { orderBy: { sortOrder: 'asc' } } } },
      criterionResults: { orderBy: { evaluatedAt: 'desc' } },
      outcomes: {
        orderBy: { recordedAt: 'asc' },
        include: { documents: { select: { id: true, name: true } } },
      },
      savingsBenefitActions: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (benefit) {
    return { family: 'BENEFIT' as const, opportunity: benefit };
  }

  const recurring = await prisma.homeSavingsOpportunity.findFirst({
    where: {
      id: opportunityId,
      propertyId,
      resultKind: {
        in: ['BENCHMARK_OPPORTUNITY', 'ADDRESS_QUALIFIED_OPPORTUNITY'],
      },
    },
    include: {
      account: true,
      outcomes: {
        orderBy: { recordedAt: 'asc' },
        include: { documents: { select: { id: true, name: true } } },
      },
      savingsBenefitActions: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (recurring) return { family: 'RECURRING_COST' as const, opportunity: recurring };
  throw new Error('Opportunity not found or access denied.');
}

export interface CreateCanonicalActionInput {
  family: CanonicalOpportunityFamily;
  actionType: SavingsBenefitActionType;
  idempotencyKey: string;
  externalOwner?: string | null;
  consent?: Record<string, unknown> | null;
  sharedFields?: Record<string, unknown> | null;
  followUpAt?: Date | null;
}

export interface CanonicalActionChecklistItem {
  key: string;
  label: string;
  required: boolean;
  evidenceRequired: boolean;
  completedAt: string | null;
  evidenceDocumentIds: string[];
}

export interface UpdateCanonicalActionInput {
  state?: 'STARTED' | 'COMPLETED' | 'CANCELLED';
  followUpAt?: Date | null;
  checklist?: Array<{
    key: string;
    completed: boolean;
    evidenceDocumentIds?: string[];
  }>;
}

export const SAVINGS_BENEFIT_HANDOFF_SHARED_FIELD_NAMES = [
  'category',
  'opportunityFamily',
  'opportunityId',
  'opportunityTitle',
] as const;

export function assertPartnerHandoffGovernance(
  input: Pick<CreateCanonicalActionInput, 'externalOwner' | 'consent' | 'sharedFields'>,
  partner: Pick<SavingsBenefitPartnerRecord, 'id' | 'disclosureVersion' | 'compensationMayOccur'>,
  expectedSharedFields?: Record<string, unknown>,
) {
  const partnerId = input.externalOwner?.trim();
  if (!partnerId || partner.id !== partnerId) {
    throw new Error('The requested partner is not approved for Savings & Benefits handoffs.');
  }
  const consent = input.consent;
  if (
    !consent
    || consent.partnerId !== partnerId
    || consent.disclosureAcknowledged !== true
    || typeof consent.consentVersion !== 'string'
    || consent.consentVersion.trim() !== partner.disclosureVersion
    || typeof consent.consentedAt !== 'string'
    || Number.isNaN(new Date(consent.consentedAt).getTime())
    || consent.compensationMayOccur !== partner.compensationMayOccur
    || typeof consent.rankingInfluenced !== 'boolean'
    || consent.rankingInfluenced !== false
    || !Array.isArray(consent.selectionCriteria)
    || consent.selectionCriteria.length === 0
    || consent.selectionCriteria.some((value) => typeof value !== 'string' || !value.trim())
    || typeof consent.nonCommercialAlternative !== 'string'
    || !consent.nonCommercialAlternative.trim()
    || !Array.isArray(consent.sharedFieldNames)
  ) {
    throw new Error('Complete the partner disclosure and explicit consent contract before sharing data.');
  }
  const previewedFields = [...new Set(
    consent.sharedFieldNames.filter((value): value is string => typeof value === 'string'),
  )].sort();
  const actualFields = Object.keys(input.sharedFields ?? {}).sort();
  const allowedFields = [...SAVINGS_BENEFIT_HANDOFF_SHARED_FIELD_NAMES];
  if (
    previewedFields.length !== actualFields.length
    || previewedFields.some((value, index) => value !== actualFields[index])
    || actualFields.length !== allowedFields.length
    || actualFields.some((value, index) => value !== allowedFields[index])
  ) {
    throw new Error('The fields being shared do not match the approved consent contract.');
  }
  if (
    expectedSharedFields
    && actualFields.some((field) => input.sharedFields?.[field] !== expectedSharedFields[field])
  ) {
    throw new Error('The partner handoff payload does not match the server-derived opportunity data.');
  }
}

function buildActionChecklist(
  detail: Awaited<ReturnType<typeof getCanonicalOpportunityDetail>>,
): CanonicalActionChecklistItem[] {
  if (detail.family === 'BENEFIT') {
    return detail.opportunity.program.rules.map((rule) => ({
      key: rule.id,
      label:
        rule.evidenceRequirement
        ?? rule.homeownerExplanation
        ?? `Confirm ${rule.attribute.replace(/_/g, ' ')}`,
      required: rule.kind !== 'OPTIONAL' || rule.requiresExternalVerification,
      evidenceRequired:
        rule.requiresExternalVerification || Boolean(rule.evidenceRequirement?.trim()),
      completedAt: null,
      evidenceDocumentIds: [],
    }));
  }

  return [
    {
      key: 'current-cost',
      label: 'Confirm the current bill amount and billing period',
      required: true,
      evidenceRequired: false,
      completedAt: null,
      evidenceDocumentIds: [],
    },
    {
      key: 'comparison-terms',
      label:
        detail.opportunity.offerSourceKind === 'ADDRESS_QUALIFIED'
          ? 'Confirm the quoted service, fees, term, and ongoing price'
          : 'Review the benchmark assumptions; this is not an address-qualified offer',
      required: true,
      evidenceRequired: false,
      completedAt: null,
      evidenceDocumentIds: [],
    },
    {
      key: 'switching-friction',
      label: 'Confirm cancellation terms and switching costs before proceeding',
      required: true,
      evidenceRequired: false,
      completedAt: null,
      evidenceDocumentIds: [],
    },
  ];
}

function parseChecklist(value: Prisma.JsonValue | null): CanonicalActionChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.key !== 'string' || typeof row.label !== 'string') return [];
    return [{
      key: row.key,
      label: row.label,
      required: row.required === true,
      evidenceRequired: row.evidenceRequired === true,
      completedAt: typeof row.completedAt === 'string' ? row.completedAt : null,
      evidenceDocumentIds: Array.isArray(row.evidenceDocumentIds)
        ? row.evidenceDocumentIds.filter((id): id is string => typeof id === 'string')
        : [],
    }];
  });
}

function assertIdempotentActionMatches(
  action: {
    hiddenAssetMatchId: string | null;
    homeSavingsOpportunityId: string | null;
    actionType: SavingsBenefitActionType;
  },
  opportunityId: string,
  input: CreateCanonicalActionInput,
) {
  const storedOpportunityId =
    input.family === 'BENEFIT'
      ? action.hiddenAssetMatchId
      : action.homeSavingsOpportunityId;
  if (
    storedOpportunityId !== opportunityId
    || action.actionType !== input.actionType
  ) {
    throw new Error('This idempotency key was already used for a different action.');
  }
}

async function recordSavingsBenefitActionObservation(
  tx: Prisma.TransactionClient,
  action: {
    id: string;
    propertyId: string;
    actionType: SavingsBenefitActionType;
    state: string;
    startedAt: Date;
    completedAt: Date | null;
    influencingRecommendationSnapshotId: string | null;
  },
  userId: string,
) {
  if (!action.influencingRecommendationSnapshotId) return;
  const completed = action.state === 'COMPLETED';
  await recordDecisionRecordOutcome({
    idempotencyKey: `decision-record:SavingsBenefitAction:${action.id}:${completed ? 'COMPLETED' : 'STARTED'}`,
    propertyId: action.propertyId,
    sourceEntityType: 'SavingsBenefitAction',
    sourceEntityId: action.id,
    observedType: completed
      ? 'SAVINGS_BENEFIT_ACTION_COMPLETED'
      : 'SAVINGS_BENEFIT_ACTION_STARTED',
    observedPayload: {
      actionType: action.actionType,
      state: action.state,
    },
    occurredAt: action.completedAt ?? action.startedAt,
    recordedByUserId: userId,
    verificationStatus: 'CORROBORATED',
    provenanceRefs: [`SavingsBenefitAction:${action.id}`],
    recommendationSnapshotId: action.influencingRecommendationSnapshotId,
    relationshipTypes: completed
      ? ['SELECTED_OPTION', 'ACTION_COMPLETED']
      : ['SELECTED_OPTION', 'ACTION_STARTED'],
  }, tx);
}

export async function createCanonicalAction(
  propertyId: string,
  opportunityId: string,
  userId: string,
  input: CreateCanonicalActionInput,
) {
  if (!isCanonicalIntentActionType(input.actionType)) {
    throw new Error(
      `${input.actionType} is an outcome stage, not a canonical action. Record it through the action outcome endpoint.`,
    );
  }
  const detail = await getCanonicalOpportunityDetail(propertyId, opportunityId, userId);
  if (detail.family !== input.family) {
    throw new Error('Opportunity family does not match the requested action.');
  }
  const candidateRecommendationSnapshotId = detail.family === 'BENEFIT'
    ? await resolveCurrentDecisionSnapshotId({
        propertyId,
        decisionDefinitionId: 'SAVINGS_BENEFIT_MATCH',
        primaryEntityType: 'PropertyHiddenAssetMatch',
        primaryEntityId: opportunityId,
      })
    : null;
  const existingAction = await prisma.savingsBenefitAction.findUnique({
    where: {
      propertyId_idempotencyKey: {
        propertyId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (existingAction) {
    assertIdempotentActionMatches(existingAction, opportunityId, input);
    return existingAction;
  }
  if (input.actionType === 'PARTNER_HANDOFF_CONSENTED' && !input.consent) {
    throw new Error('Explicit partner-handoff consent is required.');
  }
  if (
    input.actionType === 'PARTNER_HANDOFF_CONSENTED'
    && (!input.externalOwner?.trim() || !input.sharedFields)
  ) {
    throw new Error('A partner handoff must name the recipient and preview the fields being shared.');
  }
  if (input.actionType === 'PARTNER_HANDOFF_CONSENTED') {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { state: true },
    });
    const partner = await getEligibleSavingsBenefitPartner(
      input.externalOwner!,
      property?.state,
    );
    const expectedSharedFields = detail.family === 'BENEFIT'
      ? {
          opportunityId,
          opportunityFamily: detail.family,
          opportunityTitle: detail.opportunity.program.name,
          category: detail.opportunity.program.category,
        }
      : {
          opportunityId,
          opportunityFamily: detail.family,
          opportunityTitle: detail.opportunity.headline,
          category: detail.opportunity.categoryKey,
        };
    assertPartnerHandoffGovernance(input, partner, expectedSharedFields);
  }

  const completedImmediately = new Set<SavingsBenefitActionType>([
    'SAVE',
    'DISMISS',
    'OFFICIAL_SOURCE_OPENED',
    'FOLLOW_UP_SCHEDULED',
  ]).has(input.actionType);
  const now = new Date();
  const checklist = buildActionChecklist(detail);
  const benefitStatus =
    input.actionType === 'DISMISS'
      ? PropertyHiddenAssetMatchStatus.DISMISSED
      : input.actionType === 'SAVE' || input.actionType === 'OFFICIAL_SOURCE_OPENED'
        ? PropertyHiddenAssetMatchStatus.VIEWED
        : PropertyHiddenAssetMatchStatus.PURSUING;
  const recurringStatus =
    input.actionType === 'DISMISS'
      ? HomeSavingsOpportunityStatus.DISMISSED
      : input.actionType === 'SAVE' || input.actionType === 'FOLLOW_UP_SCHEDULED'
        ? HomeSavingsOpportunityStatus.SAVED
        : input.actionType === 'SWITCHED'
          ? HomeSavingsOpportunityStatus.SWITCHED
          : HomeSavingsOpportunityStatus.APPLIED;

  if (
    detail.family === 'BENEFIT'
    && benefitStatus === PropertyHiddenAssetMatchStatus.PURSUING
    && !isProgramActionableNow(detail.opportunity.program, detail.opportunity.program.source)
  ) {
    throw new Error(
      'This program is not currently actionable because it is unpublished, unavailable, expired, outside its application window, or no longer current.',
    );
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const racedAction = await tx.savingsBenefitAction.findUnique({
        where: {
          propertyId_idempotencyKey: {
            propertyId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (racedAction) {
        assertIdempotentActionMatches(racedAction, opportunityId, input);
        await recordSavingsBenefitActionObservation(tx, racedAction, userId);
        return racedAction;
      }

      if (input.family === 'BENEFIT') {
        const updated = await tx.propertyHiddenAssetMatch.updateMany({
          where: { id: opportunityId, propertyId },
          data: {
            status: benefitStatus,
            dismissedAt:
              benefitStatus === PropertyHiddenAssetMatchStatus.DISMISSED
                ? now
                : detail.family === 'BENEFIT'
                  ? detail.opportunity.dismissedAt
                  : null,
            pursuedAt:
              benefitStatus === PropertyHiddenAssetMatchStatus.PURSUING
                ? now
                : detail.family === 'BENEFIT'
                  ? detail.opportunity.pursuedAt
                  : null,
          },
        });
        if (updated.count !== 1) throw new Error('Opportunity not found or access denied.');
      } else {
        const updated = await tx.homeSavingsOpportunity.updateMany({
          where: { id: opportunityId, propertyId },
          data: { status: recurringStatus },
        });
        if (updated.count !== 1) throw new Error('Opportunity not found or access denied.');
      }

      const action = await tx.savingsBenefitAction.create({
        data: {
          propertyId,
          idempotencyKey: input.idempotencyKey,
          hiddenAssetMatchId: input.family === 'BENEFIT' ? opportunityId : null,
          homeSavingsOpportunityId: input.family === 'RECURRING_COST' ? opportunityId : null,
          actionType: input.actionType,
          state: completedImmediately ? 'COMPLETED' : 'STARTED',
          externalOwner: input.externalOwner ?? null,
          partnerId:
            input.actionType === 'PARTNER_HANDOFF_CONSENTED'
              ? input.externalOwner
              : null,
          consentJson: input.consent
            ? input.consent as Prisma.InputJsonValue
            : undefined,
          sharedFieldsJson: input.sharedFields
            ? input.sharedFields as Prisma.InputJsonValue
              : undefined,
          handoffStatus:
            input.actionType === 'PARTNER_HANDOFF_CONSENTED'
              ? 'CONSENTED'
              : null,
          homeActionReference:
            input.family === 'BENEFIT'
              ? `savings-benefit-match:${opportunityId}`
              : `savings-benefit-recurring:${opportunityId}`,
          influencingRecommendationSnapshotId: candidateRecommendationSnapshotId,
          checklistJson: checklist as unknown as Prisma.InputJsonValue,
          submittedAt: input.actionType === 'EXTERNALLY_SUBMITTED' ? now : null,
          completedAt: completedImmediately ? now : null,
          followUpAt: input.followUpAt ?? null,
        },
      });
      await recordSavingsBenefitActionObservation(tx, action, userId);
      return action;
    });

    // This refresh is deliberately after the atomic domain write. The signal
    // is a derived projection and must never exist without its durable action.
    if (
      input.family === 'RECURRING_COST'
      && (
        recurringStatus === HomeSavingsOpportunityStatus.APPLIED
        || recurringStatus === HomeSavingsOpportunityStatus.SWITCHED
      )
    ) {
      await homeSavings.setOpportunityStatus(opportunityId, recurringStatus, userId);
    }
    return created;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      const racedAction = await prisma.savingsBenefitAction.findUnique({
        where: {
          propertyId_idempotencyKey: {
            propertyId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (racedAction) {
        assertIdempotentActionMatches(racedAction, opportunityId, input);
        return racedAction;
      }
    }
    throw error;
  }
}

const ACTION_STATE_TRANSITIONS: Record<string, string[]> = {
  STARTED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function isCanonicalActionTransitionAllowed(
  current: string,
  next: string,
): boolean {
  return current === next || (ACTION_STATE_TRANSITIONS[current]?.includes(next) ?? false);
}

export async function updateCanonicalAction(
  propertyId: string,
  actionId: string,
  userId: string,
  input: UpdateCanonicalActionInput,
) {
  const property = await assertProperty(propertyId, userId);
  const action = await prisma.savingsBenefitAction.findFirst({
    where: { id: actionId, propertyId },
  });
  if (!action) throw new Error('Action not found or access denied.');

  if (
    input.state
    && !isCanonicalActionTransitionAllowed(action.state, input.state)
  ) {
    throw new Error(`Cannot transition an action from ${action.state} to ${input.state}.`);
  }

  let checklist = parseChecklist(action.checklistJson);
  if (input.checklist?.length) {
    const requestedDocumentIds = [...new Set(
      input.checklist.flatMap((item) => item.evidenceDocumentIds ?? []),
    )];
    if (requestedDocumentIds.length > 0) {
      const ownedDocuments = await prisma.document.findMany({
        where: {
          id: { in: requestedDocumentIds },
          uploadedBy: property.homeownerProfileId,
          propertyId,
        },
        select: { id: true },
      });
      if (ownedDocuments.length !== requestedDocumentIds.length) {
        throw new Error('One or more checklist documents are unavailable or not owned by this user.');
      }
    }
    const updatesByKey = new Map(input.checklist.map((item) => [item.key, item]));
    const unknownKeys = [...updatesByKey.keys()].filter(
      (key) => !checklist.some((item) => item.key === key),
    );
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown checklist item: ${unknownKeys.join(', ')}.`);
    }
    checklist = checklist.map((item) => {
      const update = updatesByKey.get(item.key);
      if (!update) return item;
      return {
        ...item,
        completedAt: update.completed ? item.completedAt ?? new Date().toISOString() : null,
        evidenceDocumentIds: update.evidenceDocumentIds ?? item.evidenceDocumentIds,
      };
    });
    const invalidEvidenceItem = checklist.find(
      (item) =>
        item.evidenceRequired
        && Boolean(item.completedAt)
        && item.evidenceDocumentIds.length === 0,
    );
    if (invalidEvidenceItem) {
      throw new Error(`Attach evidence before completing "${invalidEvidenceItem.label}".`);
    }
  }

  if (
    input.state === 'COMPLETED'
    && checklist.some((item) =>
      (item.required && !item.completedAt)
      || (item.evidenceRequired && item.evidenceDocumentIds.length === 0))
  ) {
    throw new Error('Complete every required checklist item before completing this action.');
  }

  const nextState = input.state ?? action.state;
  const followUpChanged =
    input.followUpAt !== undefined
    && (input.followUpAt?.getTime() ?? null) !== (action.followUpAt?.getTime() ?? null);
  return prisma.$transaction(async (tx) => {
    if (input.state === 'CANCELLED' && action.state !== 'CANCELLED') {
      if (action.hiddenAssetMatchId) {
        const restored = await tx.propertyHiddenAssetMatch.updateMany({
          where: { id: action.hiddenAssetMatchId, propertyId },
          data: { status: PropertyHiddenAssetMatchStatus.VIEWED },
        });
        if (restored.count !== 1) throw new Error('Opportunity not found or access denied.');
      } else if (action.homeSavingsOpportunityId) {
        const restored = await tx.homeSavingsOpportunity.updateMany({
          where: { id: action.homeSavingsOpportunityId, propertyId },
          data: { status: HomeSavingsOpportunityStatus.SAVED },
        });
        if (restored.count !== 1) throw new Error('Opportunity not found or access denied.');
      }
    }
    const updated = await tx.savingsBenefitAction.updateMany({
      where: { id: action.id, state: action.state, updatedAt: action.updatedAt },
      data: {
        state: nextState,
        followUpAt: input.followUpAt === undefined ? action.followUpAt : input.followUpAt,
        ...(followUpChanged
          ? {
              followUpNotificationSentAt: null,
              followUpNotificationClaimedAt: null,
            }
          : {}),
        checklistJson: checklist as unknown as Prisma.InputJsonValue,
        completedAt: nextState === 'COMPLETED' ? action.completedAt ?? new Date() : null,
      },
    });
    if (updated.count !== 1) {
      throw new Error('Action changed concurrently. Refresh and try again.');
    }
    const persisted = await tx.savingsBenefitAction.findUniqueOrThrow({ where: { id: action.id } });
    if (persisted.state === 'COMPLETED') {
      await recordSavingsBenefitActionObservation(tx, persisted, userId);
    }
    return persisted;
  });
}

export async function recordCanonicalFact(
  propertyId: string,
  opportunityId: string,
  userId: string,
  input: RecordSensitiveFactInput,
) {
  const detail = await getCanonicalOpportunityDetail(propertyId, opportunityId, userId);
  if (detail.family !== 'BENEFIT') {
    throw new Error('Sensitive eligibility facts apply only to benefit opportunities.');
  }
  return recordSensitiveFact(opportunityId, userId, input);
}

export async function recordCanonicalActionOutcome(
  propertyId: string,
  actionId: string,
  userId: string,
  input: RecordHiddenAssetMatchOutcomeInput | RecordHomeSavingsOpportunityOutcomeInput,
) {
  await assertProperty(propertyId, userId);
  const action = await prisma.savingsBenefitAction.findFirst({
    where: { id: actionId, propertyId },
  });
  if (!action) throw new Error('Action not found or access denied.');
  if (action.state === 'CANCELLED') {
    throw new Error('A cancelled action cannot receive a new outcome.');
  }

  const outcome = action.hiddenAssetMatchId
    ? await recordHiddenAssetMatchOutcome(
        action.hiddenAssetMatchId,
        userId,
        { ...input, actionId: action.id } as RecordHiddenAssetMatchOutcomeInput,
      )
    : action.homeSavingsOpportunityId
      ? await recordHomeSavingsOpportunityOutcome(
          action.homeSavingsOpportunityId,
          userId,
          { ...input, actionId: action.id } as RecordHomeSavingsOpportunityOutcomeInput,
        )
      : null;
  if (!outcome) throw new Error('Action is not linked to an opportunity.');
  return outcome;
}

export async function revokeCanonicalActionOutcome(
  propertyId: string,
  actionId: string,
  outcomeId: string,
  userId: string,
  reason: string,
) {
  await assertProperty(propertyId, userId);
  const action = await prisma.savingsBenefitAction.findFirst({
    where: { id: actionId, propertyId },
    select: {
      id: true,
      hiddenAssetMatchId: true,
      homeSavingsOpportunityId: true,
    },
  });
  if (!action) throw new Error('Action not found or access denied.');

  if (action.hiddenAssetMatchId) {
    const outcome = await prisma.hiddenAssetMatchOutcome.findFirst({
      where: {
        id: outcomeId,
        actionId: action.id,
        matchId: action.hiddenAssetMatchId,
      },
      select: { id: true },
    });
    if (!outcome) throw new Error('Outcome not found or access denied.');
    return revokeHiddenAssetMatchOutcome(outcome.id, userId, reason);
  }
  if (action.homeSavingsOpportunityId) {
    const outcome = await prisma.homeSavingsOpportunityOutcome.findFirst({
      where: {
        id: outcomeId,
        actionId: action.id,
        opportunityId: action.homeSavingsOpportunityId,
      },
      select: { id: true },
    });
    if (!outcome) throw new Error('Outcome not found or access denied.');
    return revokeHomeSavingsOpportunityOutcome(outcome.id, userId, reason);
  }
  throw new Error('Action is not linked to an opportunity.');
}

export async function getCanonicalCoverage(propertyId: string, userId: string) {
  return hiddenAssets.getCoverageForProperty(propertyId, userId);
}
