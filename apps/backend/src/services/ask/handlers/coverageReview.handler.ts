// The coverage review read inside Ask (register P0 "Coverage Intelligence"; FRD v1.317).
//
// Reads what GET /coverage-review reads (findCurrentCoverageReview, strictly read-only since FRD v1.308): the questions worth asking about the confirmed
// facts on the household's policy, with the evidence each rests on and what is missing. It never generates a review (that is the explicit, confirmed
// action) and never reaches a conclusion about what a claim would pay. Owner-only, as the service is. Ask links to no page.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { APIError } from '../../../middleware/error.middleware';
import { humanDate } from '../askFormatting';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { findCurrentCoverageReview } from '../../coverageReview.service';
import { COVERAGE_COMMAND_ACTION_IDS, COVERAGE_COMMAND_MESSAGES, COVERAGE_PROPERTY_ENTITY_TYPE } from '../support/coverageCommand';

type ReviewResult = Awaited<ReturnType<typeof findCurrentCoverageReview>>;

const BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY', id: 'coverage-review-boundary', title: 'Questions to ask, not advice',
  body: 'This review looks only at the confirmed deductible, policy form, dwelling limit and liability limit. It does not say whether a claim would be paid or whether your policy is right for you. Ask your insurer or a licensed professional.',
  severity: 'INFO', suggestions: [],
};

/** Pure: the answer from the read, exported for tests. */
export function coverageReviewFromView(read: ReviewResult, canGenerate: boolean, propertyId: string): AskOperationResult {
  const review = read.review as null | {
    overallState: string; scopeStatus: string; generatedAt: Date | string;
    policyTerm: { insurancePolicy: { carrierName: string; policyNumber: string }; sourceDocument: { title: string } | null } | null;
    questions: Array<{ id: string; plainLanguageQuestion: string; whyItMatters: string; priority: number | string; questionType: string; missingEvidenceJson: unknown; professionalBoundary: string }>;
  };
  const generate = canGenerate ? [{
    id: COVERAGE_COMMAND_ACTION_IDS.REVIEW, label: review ? 'Refresh the review' : 'Review my coverage', interactionType: 'START_WORKFLOW' as const, message: COVERAGE_COMMAND_MESSAGES.REVIEW,
    operationId: 'COVERAGE_COMMAND' as const, entityType: COVERAGE_PROPERTY_ENTITY_TYPE, entityId: propertyId, style: 'PRIMARY' as const,
  }] : [];
  if (!review) {
    return {
      status: 'ANSWERED', reasonCode: 'COVERAGE_REVIEW_NOT_GENERATED',
      blocks: [{
        type: 'SUMMARY', id: 'coverage-review-summary', title: 'No coverage review yet',
        body: canGenerate
          ? 'A review turns the confirmed facts on your policy into a short list of questions worth asking. Nothing is prepared until you ask for it.'
          : 'A review turns the confirmed facts on your policy into a short list of questions worth asking. A contributor or owner can prepare one.',
        tone: 'DEFAULT', actions: generate,
      }, BOUNDARY],
      suggestions: [],
    };
  }
  const questions = review.questions.slice(0, 3);
  const stateTitle = review.overallState === 'CONFLICTED' ? 'A policy detail needs to be resolved'
    : review.overallState === 'HEALTHY_SCOPED' ? 'No question within the reviewed fields'
      : review.scopeStatus === 'UNSUPPORTED' ? 'More policy evidence is needed'
        : `${questions.length} question${questions.length === 1 ? '' : 's'} to review`;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'coverage-review-summary', title: stateTitle,
    body: [
      review.overallState === 'CONFLICTED' ? 'A newly uploaded policy document disagrees with what is already confirmed on file. Resolve which value is correct before relying on this review.'
        : review.scopeStatus === 'SUPPORTED' ? 'Scope: the confirmed deductible, policy form, dwelling limit and liability limit.'
          : review.scopeStatus === 'PARTIAL' ? 'Scope: only the confirmed fields shown below; other policy language was not determined.'
            : 'The available record does not support a determination within this limited reviewed field set.',
      review.policyTerm ? `${review.policyTerm.insurancePolicy.carrierName}, policy ${review.policyTerm.insurancePolicy.policyNumber}${review.policyTerm.sourceDocument?.title ? `, from ${review.policyTerm.sourceDocument.title}` : ', no source document linked'}.` : null,
      `Prepared ${humanDate(new Date(review.generatedAt))}${read.isCurrent ? '' : ', and out of date: the policy facts have changed since'}.`,
    ].filter(Boolean).join(' '),
    tone: review.overallState === 'CONFLICTED' || !read.isCurrent ? 'CAUTION' : 'DEFAULT',
    actions: generate,
  }];
  if (review.overallState === 'HEALTHY_SCOPED') {
    blocks.push({ type: 'LIMITATION', id: 'coverage-review-healthy', severity: 'INFO', title: 'Healthy within the limited scope', body: 'No question was raised for the limited confirmed fields. This does not mean the policy has no gaps or that a claim would be covered.' });
  } else if (questions.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'coverage-review-questions', title: 'Questions to review',
      description: 'Each rests on a fact confirmed on your policy; what is missing is listed with it.',
      sections: [{
        id: 'coverage-review-questions-all', title: 'Questions', count: questions.length,
        items: questions.map((question) => {
          const missing = Array.isArray(question.missingEvidenceJson)
            ? (question.missingEvidenceJson as Array<{ factKey?: unknown }>).map((entry) => String(entry?.factKey ?? '').toLowerCase().replace(/_/g, ' ')).filter(Boolean) : [];
          return {
            id: question.id, title: question.plainLanguageQuestion, description: question.whyItMatters,
            meta: [question.questionType === 'GENERAL' ? 'General question' : 'About a confirmed fact', ...(missing.length ? [`Missing: ${missing.join(', ')}`] : []), question.professionalBoundary].slice(0, 4),
            status: null, href: null,
          };
        }),
      }],
      actions: [],
    });
  }
  blocks.push(BOUNDARY);
  return { status: read.isCurrent ? 'ANSWERED' : 'READY_WITH_LIMITATIONS', reasonCode: read.isCurrent ? undefined : 'COVERAGE_REVIEW_OUT_OF_DATE', blocks, suggestions: [] };
}

registerCapabilityHandler('coverage.review-status', async (envelope, deps) => {
  const propertyId = envelope.propertyId!;
  const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, propertyId);
  try {
    return coverageReviewFromView(await findCurrentCoverageReview(propertyId, envelope.userId), access.role !== 'VIEWER', propertyId);
  } catch (error) {
    if (error instanceof APIError && error.code === 'PROPERTY_NOT_FOUND') {
      return {
        status: 'BLOCKED', reasonCode: 'COVERAGE_REVIEW_OWNER_ONLY',
        blocks: [{ type: 'BOUNDARY', id: 'coverage-review-owner-only', title: 'Coverage review is for the primary owner', body: 'The coverage review currently works only for the property’s primary homeowner account, not shared household access.', severity: 'CAUTION', suggestions: [] }],
        suggestions: [],
      };
    }
    throw error;
  }
});
