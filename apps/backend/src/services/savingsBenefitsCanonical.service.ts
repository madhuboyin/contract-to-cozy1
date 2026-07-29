import {
  HomeSavingsOpportunityStatus,
  Prisma,
  PropertyHiddenAssetMatchStatus,
  SavingsBenefitActionType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HiddenAssetService } from './hiddenAssets.service';
import { HomeSavingsService } from './homeSavings.service';
import {
  RecordHiddenAssetMatchOutcomeInput,
  RecordHomeSavingsOpportunityOutcomeInput,
  recordHiddenAssetMatchOutcome,
  recordHomeSavingsOpportunityOutcome,
} from './savingsOutcome.service';
import {
  RecordSensitiveFactInput,
  recordSensitiveFact,
} from './hiddenAssetSensitiveFacts.service';

const hiddenAssets = new HiddenAssetService();
const homeSavings = new HomeSavingsService();

export type CanonicalOpportunityFamily = 'BENEFIT' | 'RECURRING_COST';

async function assertProperty(propertyId: string, userId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, homeownerProfile: { userId } },
    select: { id: true },
  });
  if (!property) throw new Error('Property not found or access denied.');
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
  if (benefit) return { family: 'BENEFIT' as const, opportunity: benefit };

  const recurring = await prisma.homeSavingsOpportunity.findFirst({
    where: { id: opportunityId, propertyId },
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
  externalOwner?: string | null;
  consent?: Record<string, unknown> | null;
  sharedFields?: Record<string, unknown> | null;
  followUpAt?: Date | null;
}

export async function createCanonicalAction(
  propertyId: string,
  opportunityId: string,
  userId: string,
  input: CreateCanonicalActionInput,
) {
  const detail = await getCanonicalOpportunityDetail(propertyId, opportunityId, userId);
  if (detail.family !== input.family) {
    throw new Error('Opportunity family does not match the requested action.');
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

  if (input.family === 'BENEFIT') {
    const status =
      input.actionType === 'DISMISS'
        ? PropertyHiddenAssetMatchStatus.DISMISSED
        : input.actionType === 'SAVE' || input.actionType === 'OFFICIAL_SOURCE_OPENED'
          ? PropertyHiddenAssetMatchStatus.VIEWED
          : PropertyHiddenAssetMatchStatus.PURSUING;
    await hiddenAssets.updateMatchStatus(opportunityId, { status }, userId);
  } else {
    const status =
      input.actionType === 'DISMISS'
        ? HomeSavingsOpportunityStatus.DISMISSED
        : input.actionType === 'SAVE' || input.actionType === 'FOLLOW_UP_SCHEDULED'
          ? HomeSavingsOpportunityStatus.SAVED
          : input.actionType === 'SWITCHED'
            ? HomeSavingsOpportunityStatus.SWITCHED
            : HomeSavingsOpportunityStatus.APPLIED;
    await homeSavings.setOpportunityStatus(opportunityId, status, userId);
  }

  const completedImmediately = new Set<SavingsBenefitActionType>([
    'SAVE',
    'DISMISS',
    'OFFICIAL_SOURCE_OPENED',
    'FOLLOW_UP_SCHEDULED',
  ]).has(input.actionType);
  const now = new Date();
  return prisma.savingsBenefitAction.create({
    data: {
      propertyId,
      hiddenAssetMatchId: input.family === 'BENEFIT' ? opportunityId : null,
      homeSavingsOpportunityId: input.family === 'RECURRING_COST' ? opportunityId : null,
      actionType: input.actionType,
      state: completedImmediately ? 'COMPLETED' : 'STARTED',
      externalOwner: input.externalOwner ?? null,
      consentJson: input.consent
        ? input.consent as Prisma.InputJsonValue
        : undefined,
      sharedFieldsJson: input.sharedFields
        ? input.sharedFields as Prisma.InputJsonValue
        : undefined,
      submittedAt: input.actionType === 'EXTERNALLY_SUBMITTED' ? now : null,
      completedAt: completedImmediately ? now : null,
      followUpAt: input.followUpAt ?? null,
    },
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

  const outcome = action.hiddenAssetMatchId
    ? await recordHiddenAssetMatchOutcome(action.hiddenAssetMatchId, userId, input as RecordHiddenAssetMatchOutcomeInput)
    : action.homeSavingsOpportunityId
      ? await recordHomeSavingsOpportunityOutcome(
          action.homeSavingsOpportunityId,
          userId,
          input as RecordHomeSavingsOpportunityOutcomeInput,
        )
      : null;
  if (!outcome) throw new Error('Action is not linked to an opportunity.');

  await prisma.savingsBenefitAction.update({
    where: { id: action.id },
    data: {
      state: input.stage === 'DENIED' || input.stage === 'RECEIVED' || input.stage === 'WITHDRAWN'
        ? 'COMPLETED'
        : 'STARTED',
      completedAt: input.stage === 'DENIED' || input.stage === 'RECEIVED' || input.stage === 'WITHDRAWN'
        ? new Date()
        : null,
    },
  });
  return outcome;
}

export async function getCanonicalCoverage(propertyId: string, userId: string) {
  return hiddenAssets.getCoverageForProperty(propertyId, userId);
}
