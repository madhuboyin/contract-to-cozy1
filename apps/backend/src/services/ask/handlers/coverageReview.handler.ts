// The coverage review read inside Ask (register P0 "Coverage Intelligence"; FRD v1.317).
//
// Reads what GET /coverage-review reads (findCurrentCoverageReview, strictly read-only since FRD v1.308): the questions worth asking about the confirmed
// facts on the household's policy, with the evidence each rests on and what is missing. It never generates a review (that is the explicit, confirmed
// action) and never reaches a conclusion about what a claim would pay. Open to every household member, as the service and the route are. Ask links to no page.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate } from '../askFormatting';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { findCurrentCoverageReview } from '../../coverageReview.service';
import { CoverageIntelligenceService } from '../../coverageAnalysis.service';
import { COVERAGE_PROPERTY_ANALYSIS_ACTION_ID, COVERAGE_PROPERTY_ANALYSIS_MESSAGE } from '../support/coverageAnalysisRun';
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

const ANALYSIS_STATE_LABELS: Record<string, string> = {
  COST_EXPOSURE_EXCEEDS_PLAN_COST: 'The modeled repair cost is more than the plan costs', COSTS_ARE_CLOSE: 'The plan cost and the modeled repair cost are close',
  PLAN_COST_EXCEEDS_MODELED_EXPOSURE: 'The plan costs more than the modeled repairs', INSUFFICIENT_DATA: 'Not enough recorded to compare',
};
type AnalysisRead = { exists: false } | { exists: true; analysis: { id: string; status: string; computedAt: string; confidence: string; scenarioState: string; summary?: string; insuranceReviewState: string; nextSteps?: Array<{ title: string; detail?: string }> } };

/** Pure: the latest saved whole-home analysis beside the review (Desktop's Coverage Intelligence page), with the on-demand run for a contributor or owner. Text only; no link. */
export function coverageAnalysisBlocks(read: AnalysisRead | null, canRun: boolean, propertyId: string): AskPresentationBlock[] {
  const run = canRun ? [{
    id: COVERAGE_PROPERTY_ANALYSIS_ACTION_ID, label: read?.exists ? 'Run a new analysis' : 'Run a coverage analysis', interactionType: 'START_WORKFLOW' as const, message: COVERAGE_PROPERTY_ANALYSIS_MESSAGE,
    operationId: 'COVERAGE_ANALYSIS_RUN' as const, actionId: COVERAGE_PROPERTY_ANALYSIS_ACTION_ID, entityType: COVERAGE_PROPERTY_ENTITY_TYPE, entityId: propertyId, style: 'SECONDARY' as const,
  }] : [];
  if (!read) return [];
  if (!read.exists) {
    return [{ type: 'SUMMARY', id: 'coverage-analysis-summary', title: 'No coverage analysis has been run', body: 'An analysis compares the cost of your warranty and insurance with the modeled cost of repairs, from what is recorded. It is an estimate.', tone: 'DEFAULT', actions: run }];
  }
  const a = read.analysis;
  const computed = humanDate(new Date(a.computedAt));
  const stale = a.status === 'STALE';
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'coverage-analysis-summary', title: `Coverage analysis${computed ? ` · ${computed}` : ''}`,
    body: [a.summary, `${ANALYSIS_STATE_LABELS[a.scenarioState] ?? 'Not enough recorded to compare'}. Confidence: ${String(a.confidence).toLowerCase()}. It is an estimate from what is recorded, not advice.`].filter(Boolean).join(' '),
    tone: stale ? 'CAUTION' : 'DEFAULT', actions: run,
  }];
  if (stale) blocks.push({ type: 'LIMITATION', id: 'coverage-analysis-stale', severity: 'CAUTION', title: 'Your records have changed since this ran', body: 'Run a new analysis to include what changed.' });
  const steps = (a.nextSteps ?? []).slice(0, 4);
  if (steps.length) {
    blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'coverage-analysis-next-steps', title: 'What the analysis suggests', description: null,
      sections: [{ id: 'coverage-analysis-steps', title: 'Next steps', count: steps.length, items: steps.map((step, index) => ({ id: `coverage-analysis-step-${index}`, title: step.title, description: step.detail ?? null, meta: [], status: null, href: null })) }], actions: [] });
  }
  return blocks;
}

registerCapabilityHandler('coverage.review-status', async (envelope, deps) => {
  const propertyId = envelope.propertyId!;
  const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, propertyId);
  const result = coverageReviewFromView(await findCurrentCoverageReview(propertyId, envelope.userId), access.role !== 'VIEWER', propertyId);
  // The saved analysis is an addition to the review answer; if it cannot be read (for example a policy conflict the review already explains), the answer is given without it.
  const analysis = await new CoverageIntelligenceService().getLatest(propertyId, envelope.userId).catch(() => null) as AnalysisRead | null;
  const extra = coverageAnalysisBlocks(analysis, access.role !== 'VIEWER', propertyId);
  if (!extra.length) return result;
  const last = result.blocks[result.blocks.length - 1];
  return last?.type === 'BOUNDARY' ? { ...result, blocks: [...result.blocks.slice(0, -1), ...extra, last] } : { ...result, blocks: [...result.blocks, ...extra] };
});
