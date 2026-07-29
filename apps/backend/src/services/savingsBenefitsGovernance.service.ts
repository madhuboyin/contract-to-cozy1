// apps/backend/src/services/savingsBenefitsGovernance.service.ts
//
// Editorial lifecycle governance for the Savings and Benefits reviewed
// program registry (HIDDEN_SAVINGS_AND_BENEFITS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md
// Slice 2), mirroring apps/backend/src/services/adminContentGovernance.service.ts.
// DRAFT → IN_REVIEW → APPROVED → PUBLISHED → ARCHIVED, each transition
// authorized by a separate capability:
//   SAVINGS_BENEFITS_AUTHOR  — submit for review, revive an archived program
//   SAVINGS_BENEFITS_REVIEW  — approve, return to draft
//   SAVINGS_BENEFITS_PUBLISH — publish, unpublish, archive
// Saving a program (savingsBenefitsAdmin.service upsert) can never touch
// reviewStatus. Only PUBLISHED programs are ever evaluated against a
// homeowner's property (fetchCandidatePrograms in hiddenAssets.service.ts),
// so unpublish/archive take effect immediately.

import { Request } from 'express';
import { HiddenAssetProgramReviewStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordAdminAction } from './adminAudit.service';
import { AdminCapability } from '../config/adminCapabilities';
import { isReviewedProgramCurrent, isSourceReviewCurrent } from './hiddenAssets/sourceFreshness';
import { requestBroadSavingsBenefitsReevaluation } from './savingsBenefitsReevaluation.service';
import { isSupportedEligibilityAttribute } from './hiddenAssets/ruleEngine';

export class SavingsBenefitsGovernanceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SavingsBenefitsGovernanceError';
  }
}

interface ActionContext {
  req?: Pick<Request, 'ip' | 'headers'> | null;
}

export type AuthorAction = 'SUBMIT_FOR_REVIEW' | 'REVIVE_TO_DRAFT';
export type ReviewDecision = 'APPROVE' | 'RETURN_TO_DRAFT';
export type PublishAction = 'PUBLISH' | 'UNPUBLISH' | 'ARCHIVE';

interface TransitionSpec {
  from: HiddenAssetProgramReviewStatus[];
  to: HiddenAssetProgramReviewStatus;
  capability: AdminCapability;
}

const TRANSITIONS: Record<AuthorAction | ReviewDecision | PublishAction, TransitionSpec> = {
  SUBMIT_FOR_REVIEW: { from: ['DRAFT'], to: 'IN_REVIEW', capability: 'SAVINGS_BENEFITS_AUTHOR' },
  REVIVE_TO_DRAFT: { from: ['ARCHIVED'], to: 'DRAFT', capability: 'SAVINGS_BENEFITS_AUTHOR' },
  APPROVE: { from: ['IN_REVIEW'], to: 'APPROVED', capability: 'SAVINGS_BENEFITS_REVIEW' },
  RETURN_TO_DRAFT: { from: ['IN_REVIEW', 'APPROVED'], to: 'DRAFT', capability: 'SAVINGS_BENEFITS_REVIEW' },
  PUBLISH: { from: ['APPROVED'], to: 'PUBLISHED', capability: 'SAVINGS_BENEFITS_PUBLISH' },
  // UNPUBLISH keeps publishedAt as last-publish history — fetchCandidatePrograms
  // filters on reviewStatus, so the program stops matching immediately.
  UNPUBLISH: { from: ['PUBLISHED'], to: 'APPROVED', capability: 'SAVINGS_BENEFITS_PUBLISH' },
  ARCHIVE: { from: ['PUBLISHED', 'APPROVED'], to: 'ARCHIVED', capability: 'SAVINGS_BENEFITS_PUBLISH' },
};

export interface TransitionInput {
  programId: string;
  actorId: string;
  action: AuthorAction | ReviewDecision | PublishAction;
  reason: string;
}

export async function transitionSavingsBenefitProgram(input: TransitionInput, ctx: ActionContext = {}) {
  const spec = TRANSITIONS[input.action];
  if (!spec) {
    throw new SavingsBenefitsGovernanceError('INVALID_ACTION', `"${input.action}" is not a lifecycle action.`);
  }

  const program = await prisma.hiddenAssetProgram.findUnique({
    where: { id: input.programId },
    select: {
      id: true,
      name: true,
      reviewStatus: true,
      version: true,
      authoredBy: true,
      approvedVersion: true,
      reviewedBy: true,
      publishedAt: true,
      sourceUrl: true,
      lastVerifiedAt: true,
      rules: { select: { attribute: true } },
      source: {
        select: {
          status: true,
          officialUrl: true,
          lastReviewedAt: true,
          reviewSlaDays: true,
          version: true,
          reviewedVersion: true,
        },
      },
    },
  });
  if (!program) {
    throw new SavingsBenefitsGovernanceError('PROGRAM_NOT_FOUND', `No program with id "${input.programId}".`);
  }

  if (!spec.from.includes(program.reviewStatus)) {
    throw new SavingsBenefitsGovernanceError(
      'INVALID_TRANSITION',
      `Cannot ${input.action} a ${program.reviewStatus} program.`
    );
  }

  if (input.action === 'APPROVE' && program.authoredBy === input.actorId) {
    throw new SavingsBenefitsGovernanceError(
      'AUTHOR_REVIEWER_SEPARATION_REQUIRED',
      'Program approval must be performed by a different administrator than the current author.',
    );
  }
  if (input.action === 'PUBLISH' && program.reviewedBy === input.actorId) {
    throw new SavingsBenefitsGovernanceError(
      'REVIEWER_PUBLISHER_SEPARATION_REQUIRED',
      'Program publication must be performed by a different administrator than the reviewer.',
    );
  }

  if (input.action === 'PUBLISH') {
    const now = new Date();
    const unsupportedAttributes = [...new Set(
      program.rules
        .map((rule) => rule.attribute)
        .filter((attribute) => !isSupportedEligibilityAttribute(attribute)),
    )];
    if (unsupportedAttributes.length > 0) {
      throw new SavingsBenefitsGovernanceError(
        'UNSUPPORTED_ELIGIBILITY_ATTRIBUTE',
        `Cannot publish because these eligibility attributes have no supported capture path: ${unsupportedAttributes.join(', ')}.`,
      );
    }
    if (!isSourceReviewCurrent(program.source, now)) {
      throw new SavingsBenefitsGovernanceError(
        'SOURCE_NOT_CURRENT',
        'Cannot publish while the owning source is paused, unreviewed, or past its review SLA.',
      );
    }
    if (!program.sourceUrl?.trim()) {
      throw new SavingsBenefitsGovernanceError(
        'OFFICIAL_SOURCE_REQUIRED',
        'Cannot publish a program without an official source URL.',
      );
    }
    if (program.approvedVersion !== program.version) {
      throw new SavingsBenefitsGovernanceError(
        'APPROVED_VERSION_MISMATCH',
        'Cannot publish because the current program version was not the version approved by a reviewer.',
      );
    }
    // APPROVE stamps lastVerifiedAt below. This defensive check also protects
    // older rows that reached APPROVED before freshness became fail-closed.
    if (!isReviewedProgramCurrent(program, program.source, now)) {
      throw new SavingsBenefitsGovernanceError(
        'PROGRAM_NOT_CURRENT',
        'Cannot publish a program whose criteria have not been freshly reviewed.',
      );
    }
  }

  const transitionedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.hiddenAssetProgram.updateMany({
      where: {
        id: input.programId,
        reviewStatus: program.reviewStatus,
        version: program.version,
      },
      data: {
        reviewStatus: spec.to,
        ...(input.action === 'APPROVE'
          ? {
              reviewedAt: transitionedAt,
              reviewedBy: input.actorId,
              lastVerifiedAt: transitionedAt,
              approvedVersion: program.version,
            }
          : {}),
        ...(
          input.action === 'RETURN_TO_DRAFT' || input.action === 'REVIVE_TO_DRAFT'
            ? {
                approvedVersion: null,
                reviewedAt: null,
                reviewedBy: null,
                lastVerifiedAt: null,
              }
            : {}
        ),
        ...(input.action === 'PUBLISH'
          ? { publishedAt: program.publishedAt ?? transitionedAt, publishedBy: input.actorId }
          : {}),
      },
    });
    if (updated.count !== 1) {
      throw new SavingsBenefitsGovernanceError(
        'CONCURRENT_TRANSITION',
        'This program changed while the lifecycle action was being recorded. Refresh and try again.',
      );
    }

    await recordAdminAction({
      actorId: input.actorId,
      action: 'ADMIN_SAVINGS_BENEFITS_LIFECYCLE',
      entityType: 'HIDDEN_ASSET_PROGRAM',
      entityId: input.programId,
      capability: spec.capability,
      reason: input.reason,
      disposition: input.action,
      oldValues: {
        reviewStatus: program.reviewStatus,
        version: program.version,
        approvedVersion: program.approvedVersion,
      } as Prisma.InputJsonValue,
      newValues: {
        reviewStatus: spec.to,
        version: program.version,
        approvedVersion:
          input.action === 'APPROVE'
            ? program.version
            : input.action === 'RETURN_TO_DRAFT' || input.action === 'REVIVE_TO_DRAFT'
              ? null
              : program.approvedVersion,
      } as Prisma.InputJsonValue,
      relatedRefs: { name: program.name },
      req: ctx.req,
    }, tx);
  });

  if (input.action === 'PUBLISH' || input.action === 'UNPUBLISH' || input.action === 'ARCHIVE') {
    const queued = await requestBroadSavingsBenefitsReevaluation(
      `program:${input.programId}:${input.action.toLowerCase()}`,
    );
    if (!queued) {
      throw new SavingsBenefitsGovernanceError(
        'REEVALUATION_NOT_QUEUED',
        'The lifecycle transition committed, but property reevaluation could not be queued.',
      );
    }
  }

  return { previousStatus: program.reviewStatus, status: spec.to, action: input.action };
}

const QUEUE_SELECT = {
  id: true,
  name: true,
  category: true,
  regionType: true,
  regionValue: true,
  reviewStatus: true,
  updatedAt: true,
  source: { select: { id: true, name: true } },
} as const;

/**
 * The Savings and Benefits review workspace's queue: programs in IN_REVIEW
 * awaiting a review decision, and APPROVED programs awaiting publication.
 * Oldest-updated first so the longest-waiting item is handled next.
 */
export async function getSavingsBenefitsEditorialQueues() {
  const [reviewQueue, approvedQueue] = await Promise.all([
    prisma.hiddenAssetProgram.findMany({
      where: { reviewStatus: 'IN_REVIEW' },
      orderBy: { updatedAt: 'asc' },
      select: QUEUE_SELECT,
    }),
    prisma.hiddenAssetProgram.findMany({
      where: { reviewStatus: 'APPROVED' },
      orderBy: { updatedAt: 'asc' },
      select: QUEUE_SELECT,
    }),
  ]);

  return { reviewQueue, approvedQueue };
}
