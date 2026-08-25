import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  COVERAGE_REVIEW_RULE_VERSION,
  evaluateCoverageReview,
  type ReviewTerm,
} from './coverageReviewRules';
import { getConflictedInsurancePolicyTerms } from './coverageConflict.service';

const REVIEW_TTL_DAYS = 30;

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function asNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object' && 'toNumber' in value) {
    const result = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(result) ? result : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function markCoverageReviewsStale(propertyId: string) {
  await prisma.coverageReview.updateMany({
    where: { propertyId, status: 'READY' },
    data: { status: 'STALE' },
  });
}

export async function getOrCreateCoverageReview(
  propertyId: string,
  userId: string,
  options: {
    triggerType?: string;
    triggerEntityType?: string;
    triggerEntityId?: string;
    evaluatedAt?: Date;
  } = {}
) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, homeownerProfile: { userId } },
    select: { id: true, updatedAt: true },
  });
  if (!property) throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');

  const policyTerm = await prisma.insurancePolicyTerm.findFirst({
    where: { propertyId },
    orderBy: [{ termStart: 'desc' }, { createdAt: 'desc' }],
    include: {
      insurancePolicy: {
        select: { id: true, carrierName: true, policyNumber: true },
      },
      sourceDocument: { select: { id: true, name: true } },
      facts: {
        orderBy: { factKey: 'asc' },
        include: { sourceDocument: { select: { id: true, name: true } } },
      },
    },
  });

  // HI-DOC-004: if this policy currently has an unresolved conflict between
  // a newly extracted fact and an already-confirmed one, the review cannot
  // trust either value — same detection as the advisory conflict Home
  // Action and Property Context's coverage.insurancePolicies fact state
  // (coverageConflict.service.ts is the single source of truth for all
  // three).
  const conflictedTerms = policyTerm ? await getConflictedInsurancePolicyTerms(propertyId, prisma) : [];
  const hasUnresolvedConflict = policyTerm
    ? conflictedTerms.some((term) => term.policyId === policyTerm.insurancePolicyId)
    : false;

  const inputFingerprint = fingerprint({
    propertyUpdatedAt: property.updatedAt.toISOString(),
    hasUnresolvedConflict,
    policyTerm: policyTerm
      ? {
          id: policyTerm.id,
          updatedAt: policyTerm.updatedAt.toISOString(),
          verificationStatus: policyTerm.verificationStatus,
          termStart: policyTerm.termStart?.toISOString() ?? null,
          termEnd: policyTerm.termEnd?.toISOString() ?? null,
          facts: policyTerm.facts.map((fact) => ({
            id: fact.id,
            factKey: fact.factKey,
            updatedAt: fact.updatedAt.toISOString(),
            confirmationStatus: fact.confirmationStatus,
            valueType: fact.valueType,
            amountValue: asNumber(fact.amountValue),
            textValue: fact.textValue,
            booleanValue: fact.booleanValue,
            sourceDocumentId: fact.sourceDocumentId,
            sourcePage: fact.sourcePage,
          })),
        }
      : null,
    ruleVersion: COVERAGE_REVIEW_RULE_VERSION,
  });
  const evaluatedAt = options.evaluatedAt ?? new Date();

  const existing = await prisma.coverageReview.findFirst({
    where: {
      propertyId,
      status: 'READY',
      reviewVersion: COVERAGE_REVIEW_RULE_VERSION,
      inputFingerprint,
      OR: [{ expiresAt: null }, { expiresAt: { gt: evaluatedAt } }],
    },
    orderBy: { generatedAt: 'desc' },
    include: {
      policyTerm: {
        include: {
          insurancePolicy: {
            select: { id: true, carrierName: true, policyNumber: true },
          },
          sourceDocument: { select: { id: true, name: true } },
        },
      },
      questions: {
        where: { isPrimary: true },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        take: 3,
      },
    },
  });
  if (existing) return existing;

  const rulesInput: ReviewTerm | null = policyTerm
    ? {
        id: policyTerm.id,
        verificationStatus: policyTerm.verificationStatus,
        termStart: policyTerm.termStart,
        termEnd: policyTerm.termEnd,
        facts: policyTerm.facts.map((fact) => ({
          id: fact.id,
          factKey: fact.factKey,
          confirmationStatus: fact.confirmationStatus,
          valueType: fact.valueType,
          amountValue: asNumber(fact.amountValue),
          textValue: fact.textValue,
          booleanValue: fact.booleanValue,
          sourceDocumentId: fact.sourceDocumentId,
          sourcePage: fact.sourcePage,
          effectiveFrom: fact.effectiveFrom,
          effectiveTo: fact.effectiveTo,
        })),
      }
    : null;
  const evaluation = evaluateCoverageReview(rulesInput, evaluatedAt, { hasUnresolvedConflict });
  const expiresAt = new Date(evaluatedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + REVIEW_TTL_DAYS);

  return prisma.$transaction(async (tx) => {
    await tx.coverageReview.updateMany({
      where: { propertyId, status: 'READY' },
      data: { status: 'STALE' },
    });
    return tx.coverageReview.create({
      data: {
        propertyId,
        policyTermId: policyTerm?.id,
        triggerType: options.triggerType ?? 'WORKSPACE_OPEN',
        triggerEntityType: options.triggerEntityType,
        triggerEntityId: options.triggerEntityId,
        status: 'READY',
        scopeStatus: evaluation.scopeStatus,
        overallState: evaluation.overallState,
        reviewVersion: COVERAGE_REVIEW_RULE_VERSION,
        inputFingerprint,
        generatedAt: evaluatedAt,
        expiresAt,
        questions: {
          create: evaluation.questions.map((question) => ({
            questionKey: question.questionKey,
            questionType: question.questionType,
            category: question.category,
            priority: question.priority,
            isPrimary: question.isPrimary,
            status: 'OPEN',
            plainLanguageQuestion: question.plainLanguageQuestion,
            whyItMatters: question.whyItMatters,
            evidenceJson: question.evidence as Prisma.InputJsonValue,
            missingEvidenceJson: question.missingEvidence as Prisma.InputJsonValue,
            jurisdictionReviewJson: {
              status: 'NOT_USED',
              reason: 'Slice 3 uses no state-specific add-on or coverage rules.',
            },
            professionalBoundary: question.professionalBoundary,
          })),
        },
      },
      include: {
        policyTerm: {
          include: {
            insurancePolicy: {
              select: { id: true, carrierName: true, policyNumber: true },
            },
            sourceDocument: { select: { id: true, name: true } },
          },
        },
        questions: {
          where: { isPrimary: true },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
          take: 3,
        },
      },
    });
  });
}
