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
import { KnowledgeArticleStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordAdminAction } from './adminAudit.service';
import { AdminCapability } from '../config/adminCapabilities';

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

/**
 * The Pending Reviews workspace's two queues: articles awaiting a review
 * decision, and approved articles awaiting publication. Oldest-updated
 * first so the longest-waiting item is handled next.
 */
export async function getEditorialQueues() {
  const [reviewQueue, approvedQueue] = await Promise.all([
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
  ]);

  return { reviewQueue, approvedQueue };
}
