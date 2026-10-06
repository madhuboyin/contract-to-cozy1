// apps/backend/src/services/adminContentGovernance.service.ts
//
// Knowledge editorial lifecycle governance (ADMIN_MODULE_FRD.md §10.6,
// Phase 4 slice). The lifecycle DRAFT → REVIEW → APPROVED → PUBLISHED →
// ARCHIVED moves only through these transitions, each authorized by a
// separate capability at the route layer:
//   CONTENT_AUTHOR  — submit for review, revive an archived article
//   CONTENT_REVIEW  — approve, return to draft
//   CONTENT_PUBLISH — publish, unpublish, archive
// Saving an article (knowledgeHubAdmin.service upsert) can no longer touch
// status/publishedAt. Public reads only ever surface PUBLISHED, so
// unpublish/archive take effect immediately.

import { Request } from 'express';
import { DiyTemplateStatus, KnowledgeArticleStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordAdminAction } from './adminAudit.service';
import { AdminCapability } from '../config/adminCapabilities';
import {
  approveRevision, createCandidateRevision, DiyTemplateRevisionError, findOpenCandidate, findPublishableRevision, publishRevision, retireHead,
  retireOpenCandidate, returnRevision, type RevisionErrorCode,
} from './diyTemplateRevision.service';

export class AdminContentGovernanceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AdminContentGovernanceError';
  }
}

interface ActionContext {
  req?: Pick<Request, 'ip' | 'headers'> | null;
}

export type AuthorAction = 'SUBMIT_FOR_REVIEW' | 'REVIVE_TO_DRAFT';
export type ReviewDecision = 'APPROVE' | 'RETURN_TO_DRAFT';
export type PublishAction = 'PUBLISH' | 'UNPUBLISH' | 'ARCHIVE';

interface TransitionSpec {
  from: KnowledgeArticleStatus[];
  to: KnowledgeArticleStatus;
  capability: AdminCapability;
}

const TRANSITIONS: Record<AuthorAction | ReviewDecision | PublishAction, TransitionSpec> = {
  SUBMIT_FOR_REVIEW: { from: ['DRAFT'], to: 'REVIEW', capability: 'CONTENT_AUTHOR' },
  REVIVE_TO_DRAFT: { from: ['ARCHIVED'], to: 'DRAFT', capability: 'CONTENT_AUTHOR' },
  APPROVE: { from: ['REVIEW'], to: 'APPROVED', capability: 'CONTENT_REVIEW' },
  RETURN_TO_DRAFT: { from: ['REVIEW'], to: 'DRAFT', capability: 'CONTENT_REVIEW' },
  PUBLISH: { from: ['APPROVED'], to: 'PUBLISHED', capability: 'CONTENT_PUBLISH' },
  // UNPUBLISH keeps publishedAt as last-publish history — public reads
  // filter on status, so the article disappears from the site immediately.
  UNPUBLISH: { from: ['PUBLISHED'], to: 'APPROVED', capability: 'CONTENT_PUBLISH' },
  ARCHIVE: { from: ['PUBLISHED', 'APPROVED'], to: 'ARCHIVED', capability: 'CONTENT_PUBLISH' },
};

export interface TransitionInput {
  articleId: string;
  actorId: string;
  action: AuthorAction | ReviewDecision | PublishAction;
  reason: string;
}

export async function transitionKnowledgeArticle(input: TransitionInput, ctx: ActionContext = {}) {
  const spec = TRANSITIONS[input.action];
  if (!spec) {
    throw new AdminContentGovernanceError('INVALID_ACTION', `"${input.action}" is not a lifecycle action.`);
  }

  const article = await prisma.knowledgeArticle.findUnique({
    where: { id: input.articleId },
    select: { id: true, slug: true, title: true, status: true, publishedAt: true },
  });
  if (!article) {
    throw new AdminContentGovernanceError('ARTICLE_NOT_FOUND', `No knowledge article with id "${input.articleId}".`);
  }

  if (!spec.from.includes(article.status)) {
    throw new AdminContentGovernanceError(
      'INVALID_TRANSITION',
      `Cannot ${input.action} a ${article.status} article.`
    );
  }

  await prisma.knowledgeArticle.update({
    where: { id: input.articleId },
    data: {
      status: spec.to,
      ...(input.action === 'PUBLISH' ? { publishedAt: article.publishedAt ?? new Date() } : {}),
    },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_KNOWLEDGE_LIFECYCLE',
    entityType: 'KNOWLEDGE_ARTICLE',
    entityId: input.articleId,
    capability: spec.capability,
    reason: input.reason,
    disposition: input.action,
    oldValues: { status: article.status } as Prisma.InputJsonValue,
    newValues: { status: spec.to } as Prisma.InputJsonValue,
    relatedRefs: { slug: article.slug },
    req: ctx.req,
  });

  return { previousStatus: article.status, status: spec.to, action: input.action };
}

// ─── DIY template lifecycle ───────────────────────────────────────────────────
//
// Same editorial workflow as knowledge articles, with DIY specifics (docs/architecture/ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md):
//  - The template row is the editable working copy; a hashed, immutable REVISION is created at submit-for-review, approved against that exact
//    content, and promoted to the template's published head at publish (services/diyTemplateRevision.service.ts, the only writer of revisions).
//  - `status` describes the working copy's next revision; a template is LIVE when it has a published head, which can be true in any status (a
//    live template being edited as a draft keeps its head published). UNPUBLISH and ARCHIVE therefore work from any status that has a head, so a
//    live template can always be withdrawn at once.
//  - HIGH-safety templates get stronger approval: the publisher must be a different admin than the revision's approver (FRD §10.6).
//    approvedBy/approvedAt on the template mirror the open candidate's approval for the queue and admin UI and are cleared on return to draft.
//  - Every transition is ONE transaction that first claims the template with a conditional write on the expected status, so two simultaneous
//    actions cannot both succeed and a failure part-way leaves nothing half-applied.

type DiyRule = { from: DiyTemplateStatus; to: DiyTemplateStatus; requireHead?: boolean };
type DiyAction = AuthorAction | ReviewDecision | PublishAction;

const DIY_TRANSITIONS: Record<DiyAction, { rules: DiyRule[]; capability: AdminCapability }> = {
  SUBMIT_FOR_REVIEW: { rules: [{ from: 'DRAFT', to: 'REVIEW' }], capability: 'CONTENT_AUTHOR' },
  REVIVE_TO_DRAFT: { rules: [{ from: 'ARCHIVED', to: 'DRAFT' }], capability: 'CONTENT_AUTHOR' },
  APPROVE: { rules: [{ from: 'REVIEW', to: 'APPROVED' }], capability: 'CONTENT_REVIEW' },
  RETURN_TO_DRAFT: { rules: [{ from: 'REVIEW', to: 'DRAFT' }, { from: 'APPROVED', to: 'DRAFT' }], capability: 'CONTENT_REVIEW' },
  PUBLISH: { rules: [{ from: 'APPROVED', to: 'ACTIVE' }], capability: 'CONTENT_PUBLISH' },
  // ACTIVE becomes APPROVED as before; any other status with a live head keeps its status while the head is withdrawn.
  UNPUBLISH: {
    rules: [
      { from: 'ACTIVE', to: 'APPROVED' },
      { from: 'APPROVED', to: 'APPROVED', requireHead: true }, { from: 'REVIEW', to: 'REVIEW', requireHead: true }, { from: 'DRAFT', to: 'DRAFT', requireHead: true },
    ],
    capability: 'CONTENT_PUBLISH',
  },
  ARCHIVE: {
    rules: [
      { from: 'ACTIVE', to: 'ARCHIVED' }, { from: 'APPROVED', to: 'ARCHIVED' },
      { from: 'REVIEW', to: 'ARCHIVED', requireHead: true }, { from: 'DRAFT', to: 'ARCHIVED', requireHead: true },
    ],
    capability: 'CONTENT_PUBLISH',
  },
};

export interface DiyTransitionInput {
  templateId: string;
  actorId: string;
  action: DiyAction;
  reason: string;
}

const REVISION_ERROR_TO_GOVERNANCE: Record<RevisionErrorCode, string> = {
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  REVISION_NOT_FOUND: 'REVISION_REQUIRED',
  REVISION_CONFLICT: 'REVISION_CONFLICT',
  REVISION_STATE_CONFLICT: 'REVISION_CONFLICT',
  REVISION_NOT_APPROVED: 'REVISION_NOT_APPROVED',
  INTEGRITY_FAILED: 'INTEGRITY_FAILED',
  WORKING_COPY_CHANGED: 'WORKING_COPY_CHANGED',
  HIGH_SAFETY_SEPARATION_REQUIRED: 'HIGH_SAFETY_SEPARATION_REQUIRED',
};

async function withRevisionErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DiyTemplateRevisionError) throw new AdminContentGovernanceError(REVISION_ERROR_TO_GOVERNANCE[error.code], error.message);
    throw error;
  }
}

export async function transitionDiyTemplate(input: DiyTransitionInput, ctx: ActionContext = {}) {
  const spec = DIY_TRANSITIONS[input.action];
  if (!spec) {
    throw new AdminContentGovernanceError('INVALID_ACTION', `"${input.action}" is not a lifecycle action.`);
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const now = new Date();
    // 1. Claim: a conditional write on the expected status (and, for withdrawals, on a live head). A concurrent action holds the row until it
    //    commits and then fails this check, so only one of two simultaneous transitions can succeed.
    let matched: DiyRule | null = null;
    for (const rule of spec.rules) {
      const claimed = await tx.diyProjectTemplate.updateMany({
        where: { id: input.templateId, status: rule.from, ...(rule.requireHead ? { publishedRevisionId: { not: null } } : {}) },
        data: {
          status: rule.to,
          ...(input.action === 'APPROVE' ? { approvedBy: input.actorId, approvedAt: now } : {}),
          ...(rule.to === 'DRAFT' ? { approvedBy: null, approvedAt: null } : {}),
        },
      });
      if (claimed.count === 1) { matched = rule; break; }
    }
    if (!matched) {
      const current = await tx.diyProjectTemplate.findUnique({ where: { id: input.templateId }, select: { status: true } });
      if (!current) throw new AdminContentGovernanceError('TEMPLATE_NOT_FOUND', `No DIY template with id "${input.templateId}".`);
      throw new AdminContentGovernanceError('INVALID_TRANSITION', `Cannot ${input.action} a ${current.status} template.`);
    }

    // 2. Revision work, in the same transaction: any failure here rolls the claim back too.
    let revisionNumber: number | null = null;
    let publishedRevisionId: string | null = null;
    await withRevisionErrors(async () => {
      switch (input.action) {
        case 'SUBMIT_FOR_REVIEW': {
          revisionNumber = (await createCandidateRevision(tx, { templateId: input.templateId, actorId: input.actorId, now })).revision;
          break;
        }
        case 'APPROVE': {
          const candidate = await findOpenCandidate(tx, input.templateId);
          if (!candidate) {
            throw new AdminContentGovernanceError('REVISION_REQUIRED', 'No revision is awaiting review for this template (it was sent for review before revisions existed). Return it to draft and submit it again.');
          }
          await approveRevision(tx, { revisionId: candidate.id, actorId: input.actorId, now });
          revisionNumber = candidate.revision;
          break;
        }
        case 'RETURN_TO_DRAFT': {
          const candidate = await findOpenCandidate(tx, input.templateId);
          if (candidate) { await returnRevision(tx, { revisionId: candidate.id, now }); revisionNumber = candidate.revision; }
          break;
        }
        case 'PUBLISH': {
          const revision = await findPublishableRevision(tx, input.templateId);
          if (!revision) {
            throw new AdminContentGovernanceError('REVISION_REQUIRED', 'No approved revision is available to publish (it was approved before revisions existed). Return it to draft and submit it again for review.');
          }
          const published = await publishRevision(tx, { templateId: input.templateId, revisionId: revision.id, actorId: input.actorId, now });
          publishedRevisionId = published.publishedRevisionId;
          revisionNumber = revision.revision;
          break;
        }
        case 'UNPUBLISH': {
          await retireHead(tx, { templateId: input.templateId, reason: 'UNPUBLISHED', now });
          break;
        }
        case 'ARCHIVE': {
          await retireHead(tx, { templateId: input.templateId, reason: 'ARCHIVED', now });
          await retireOpenCandidate(tx, { templateId: input.templateId, reason: 'ARCHIVED', now });
          break;
        }
        default:
          break;
      }
    });

    const template = await tx.diyProjectTemplate.findUnique({ where: { id: input.templateId }, select: { slug: true, safetyLevel: true } });
    return { previousStatus: matched.from, status: matched.to, revisionNumber, publishedRevisionId, slug: template?.slug ?? null, safetyLevel: template?.safetyLevel ?? null };
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_DIY_LIFECYCLE',
    entityType: 'DIY_TEMPLATE',
    entityId: input.templateId,
    capability: spec.capability,
    reason: input.reason,
    disposition: input.action,
    oldValues: { status: outcome.previousStatus } as Prisma.InputJsonValue,
    newValues: { status: outcome.status, revision: outcome.revisionNumber } as Prisma.InputJsonValue,
    relatedRefs: { slug: outcome.slug, safetyLevel: outcome.safetyLevel },
    req: ctx.req,
  });

  return { previousStatus: outcome.previousStatus, status: outcome.status, action: input.action };
}

// ─── Editorial queues ─────────────────────────────────────────────────────────

const QUEUE_SELECT = {
  id: true,
  slug: true,
  title: true,
  status: true,
  articleType: true,
  readingMinutes: true,
  publishedAt: true,
  updatedAt: true,
} as const;

const DIY_QUEUE_SELECT = {
  id: true,
  slug: true,
  title: true,
  status: true,
  safetyLevel: true,
  approvedBy: true,
  updatedAt: true,
} as const;

/**
 * The Pending Reviews workspace's queues: knowledge articles and DIY
 * templates awaiting a review decision or publication. Oldest-updated
 * first so the longest-waiting item is handled next.
 */
export async function getEditorialQueues() {
  const [reviewQueue, approvedQueue, diyReviewQueue, diyApprovedQueue] = await Promise.all([
    prisma.knowledgeArticle.findMany({
      where: { status: 'REVIEW' },
      orderBy: { updatedAt: 'asc' },
      select: QUEUE_SELECT,
    }),
    prisma.knowledgeArticle.findMany({
      where: { status: 'APPROVED' },
      orderBy: { updatedAt: 'asc' },
      select: QUEUE_SELECT,
    }),
    prisma.diyProjectTemplate.findMany({
      where: { status: 'REVIEW' },
      orderBy: { updatedAt: 'asc' },
      select: DIY_QUEUE_SELECT,
    }),
    prisma.diyProjectTemplate.findMany({
      where: { status: 'APPROVED' },
      orderBy: { updatedAt: 'asc' },
      select: DIY_QUEUE_SELECT,
    }),
  ]);

  return { reviewQueue, approvedQueue, diyReviewQueue, diyApprovedQueue };
}
