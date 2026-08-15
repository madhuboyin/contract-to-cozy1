import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import { getAskOperationDefinition, type AskOperationId, type AskOperationResult } from './askOperationRegistry';
import type { AskAnswerTrustResult } from './askTrust.contract';
import { validateAskSemanticAnswerRelevance, type AskSemanticAnswerRelevanceResult } from './askSemanticAnswerValidator';
import type { AskLanguageCode } from './askLanguageRegistry';

export const ASK_ANSWER_TRUST_VALIDATOR_VERSION = 'deterministic-1.0';

const ABSENCE_CLAIM = /\b(?:nothing|none|no (?:items?|tasks?|details?|coverage|risk|permit|maintenance)|not missing|fully complete|everything is complete|all clear|safe|no action (?:is )?needed)\b/i;
const INTERNAL_TOKEN = /\b(?:MAINTENANCE_STATUS|PROPERTY_SUMMARY|COVERAGE_GAPS|[A-Z]{3,}_[A-Z0-9_]{2,})\b|\b\d+\s+cents?\b/i;
const SUCCESS_STATUSES = new Set(['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS']);

function visibleText(block: AskPresentationBlock): string {
  if (block.type === 'SUMMARY' || block.type === 'BOUNDARY' || block.type === 'LIMITATION' || block.type === 'EMPTY_STATE' || block.type === 'ERROR_STATE') {
    return `${block.title} ${'body' in block ? block.body : ''}`;
  }
  return block.title;
}

function actionsFor(block: AskPresentationBlock) {
  return 'actions' in block && Array.isArray(block.actions) ? block.actions : [];
}

function sourceState(result: AskOperationResult): 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' {
  if (['UNAVAILABLE', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'].includes(result.status)) return 'UNAVAILABLE';
  if (/PARTIAL|UNAVAILABLE|STALE/.test(result.reasonCode ?? '')) return 'PARTIAL';
  const serialized = JSON.stringify(result.parameters ?? {});
  if (/"status":"(?:UNAVAILABLE|FAILED|PARTIAL|STALE)"/i.test(serialized) || /provider.{0,30}(?:unavailable|partial|stale)/i.test(serialized)) return 'PARTIAL';
  return 'COMPLETE';
}

function operationSpecificFirstBlock(operationId: AskOperationId, blocks: AskPresentationBlock[]): boolean {
  const first = blocks[0];
  if (!first) return false;
  if (operationId === 'HOME_CHANGE_SUMMARY') return first.type === 'CHANGE_SUMMARY' || first.type === 'EMPTY_STATE';
  if (operationId === 'HVAC_DECISION_CONTINUE') return ['DECISION_PROGRESS', 'EMPTY_STATE'].includes(first.type);
  if (operationId === 'HVAC_DECISION_OUTCOME_VIEW') return ['OUTCOME_SUMMARY', 'EMPTY_STATE'].includes(first.type);
  if (operationId.endsWith('_BOUNDARY')) return first.type === 'BOUNDARY';
  return ['SUMMARY', 'EMPTY_STATE', 'ERROR_STATE', 'BOUNDARY'].includes(first.type);
}

export function validateAskAnswerTrust(input: {
  question: string;
  operationId: AskOperationId;
  result: AskOperationResult;
  propertyId?: string | null;
}): { result: AskOperationResult; trust: AskAnswerTrustResult; repaired: boolean } {
  const definition = getAskOperationDefinition(input.operationId);
  const allowed = new Set(definition.allowedBlockTypes);
  let blocks = input.result.blocks.filter((block) => block.type === 'BOUNDARY' || block.type === 'ERROR_STATE' || allowed.has(block.type));
  const reasonCodes: string[] = [];
  let repaired = blocks.length !== input.result.blocks.length;
  if (repaired) reasonCodes.push('DISALLOWED_BLOCK_REMOVED');
  if (SUCCESS_STATUSES.has(input.result.status) && !allowed.has('BOUNDARY') && !definition.safetyClass.endsWith('_BOUNDARY')) {
    const withoutInapplicableBoundaries = blocks.filter((block) => block.type !== 'BOUNDARY');
    if (withoutInapplicableBoundaries.length !== blocks.length) {
      blocks = withoutInapplicableBoundaries;
      repaired = true;
      reasonCodes.push('INAPPLICABLE_BOUNDARY_REMOVED');
    }
  }

  const summaryIndex = blocks.findIndex((block) => block.type === 'SUMMARY' || block.type === 'EMPTY_STATE' || block.type === 'ERROR_STATE');
  if (!operationSpecificFirstBlock(input.operationId, blocks) && summaryIndex > 0) {
    blocks = [blocks[summaryIndex], ...blocks.slice(0, summaryIndex), ...blocks.slice(summaryIndex + 1)];
    repaired = true;
    reasonCodes.push('DIRECT_ANSWER_PROMOTED');
  }

  const source = sourceState(input.result);
  const text = blocks.map(visibleText).join(' ');
  const hasAbsenceClaim = ABSENCE_CLAIM.test(text);
  const absenceSupported = !hasAbsenceClaim || source === 'COMPLETE';
  const hasInternalToken = INTERNAL_TOKEN.test(text);
  const invalidAction = blocks.some((block) => actionsFor(block).some((action) => {
    if (!action.href) return false;
    if (!action.href.startsWith('/')) return true;
    if (input.propertyId && /\/dashboard\/properties\/([^/?#]+)/.test(action.href)) {
      const id = action.href.match(/\/dashboard\/properties\/([^/?#]+)/)?.[1];
      return Boolean(id && decodeURIComponent(id) !== input.propertyId);
    }
    return false;
  }));
  if (invalidAction) {
    blocks = blocks.map((block) => 'actions' in block && Array.isArray(block.actions)
      ? { ...block, actions: block.actions.filter((action) => !action.href || (action.href.startsWith('/') && (!input.propertyId || !/\/dashboard\/properties\/([^/?#]+)/.test(action.href) || decodeURIComponent(action.href.match(/\/dashboard\/properties\/([^/?#]+)/)![1]) === input.propertyId))) } as AskPresentationBlock
      : block);
    repaired = true;
    reasonCodes.push('INAPPLICABLE_ACTION_REMOVED');
  }

  const coverage = operationSpecificFirstBlock(input.operationId, blocks);
  const congruent = blocks.length > 0 && blocks.every((block) => block.type === 'BOUNDARY' || allowed.has(block.type));
  if (!coverage) reasonCodes.push('DIRECT_ANSWER_MISSING');
  if (!absenceSupported) reasonCodes.push('UNSUPPORTED_ABSENCE_CLAIM');
  if (hasInternalToken) reasonCodes.push('INTERNAL_PRESENTATION_TOKEN');

  let outcome: AskAnswerTrustResult['outcome'] = 'PASS';
  if (!absenceSupported || source === 'UNAVAILABLE') outcome = 'UNAVAILABLE';
  else if (!congruent || hasInternalToken) outcome = 'BLOCK';
  else if (!coverage) outcome = 'CLARIFY';
  else if (repaired) outcome = 'REPAIRABLE';

  const trust: AskAnswerTrustResult = {
    schemaVersion: '1.0', outcome,
    checks: {
      questionCoverage: coverage ? 'PASS' : 'FAIL',
      operationCongruence: congruent ? 'PASS' : 'FAIL',
      sourceIntegrity: source === 'COMPLETE' ? 'PASS' : source === 'PARTIAL' ? 'PARTIAL' : 'FAIL',
      absenceClaimSupport: hasAbsenceClaim ? (absenceSupported ? 'PASS' : 'FAIL') : 'NOT_APPLICABLE',
      boundaryApplicability: blocks.some((block) => block.type === 'BOUNDARY') ? 'PASS' : 'NOT_APPLICABLE',
      actionApplicability: blocks.some((block) => actionsFor(block).length) ? (invalidAction ? 'FAIL' : 'PASS') : 'NOT_APPLICABLE',
      audienceSafety: invalidAction ? 'FAIL' : 'PASS',
    },
    reasonCodes,
    validatorVersion: ASK_ANSWER_TRUST_VALIDATOR_VERSION,
  };

  if (outcome === 'UNAVAILABLE' && SUCCESS_STATUSES.has(input.result.status)) {
    return {
      result: {
        status: 'UNAVAILABLE', reasonCode: 'ASK_ANSWER_SOURCE_UNAVAILABLE',
        blocks: [{ type: 'ERROR_STATE', id: 'answer-trust-unavailable', title: 'I can’t reliably check that right now', body: 'A required home source was unavailable or incomplete, so I won’t treat missing data as an all-clear. Try again or open the relevant home record.', retryable: true, actions: [] }],
        suggestions: ['Try again'], parameters: { ...(input.result.parameters ?? {}), answerTrust: trust },
      }, trust, repaired: true,
    };
  }
  if ((outcome === 'BLOCK' || outcome === 'CLARIFY') && SUCCESS_STATUSES.has(input.result.status)) {
    return {
      result: {
        status: 'FAILED_RETRYABLE', reasonCode: 'ASK_ANSWER_TRUST_FAILED',
        blocks: [{ type: 'ERROR_STATE', id: 'answer-trust-failed', title: 'I couldn’t verify this answer', body: 'The response did not safely match your question and the selected home workflow. Nothing was changed. Please try again with one more detail.', retryable: true, actions: [] }],
        suggestions: ['Ask this question again'], parameters: { ...(input.result.parameters ?? {}), answerTrust: trust },
      }, trust, repaired: true,
    };
  }
  return {
    result: { ...input.result, blocks, parameters: { ...(input.result.parameters ?? {}), answerTrust: trust } },
    trust, repaired,
  };
}

export function validateAskAnswerTrustPipeline(input: {
  question: string;
  operationId: AskOperationId;
  result: AskOperationResult;
  propertyId?: string | null;
  semanticEnabled: boolean;
  language?: AskLanguageCode;
}): { result: AskOperationResult; trust: AskAnswerTrustResult; semantic: AskSemanticAnswerRelevanceResult | null; repaired: boolean } {
  const deterministic = validateAskAnswerTrust(input);
  if (!input.semanticEnabled) return { ...deterministic, semantic: null };
  const semantic = validateAskSemanticAnswerRelevance({
    question: input.question,
    operationId: input.operationId,
    result: deterministic.result,
    language: input.language,
  });
  const semanticFailed = semantic.outcome === 'FAIL';
  const trust: AskAnswerTrustResult = {
    ...deterministic.trust,
    outcome: semanticFailed && SUCCESS_STATUSES.has(deterministic.result.status)
      ? 'CLARIFY'
      : deterministic.trust.outcome,
    checks: {
      ...deterministic.trust.checks,
      questionCoverage: semanticFailed
        ? 'FAIL'
        : semantic.outcome === 'UNKNOWN' && deterministic.trust.checks.questionCoverage === 'PASS'
          ? 'UNKNOWN'
          : deterministic.trust.checks.questionCoverage,
    },
    reasonCodes: [...new Set([...deterministic.trust.reasonCodes, ...semantic.reasonCodes])],
    validatorVersion: `${deterministic.trust.validatorVersion}+${semantic.validatorVersion}`,
  };
  if (semanticFailed && SUCCESS_STATUSES.has(deterministic.result.status)) {
    return {
      result: {
        status: 'FAILED_RETRYABLE', reasonCode: 'ASK_ANSWER_RELEVANCE_FAILED',
        blocks: [{
          type: 'ERROR_STATE', id: 'answer-relevance-failed', title: 'I couldn’t verify that this answers your question',
          body: 'The response appears to address a different home request, so I won’t present it as a reliable answer. Nothing was changed. Try again or choose the home topic you meant.',
          retryable: true, actions: [],
        }],
        suggestions: ['Ask this question again'],
        parameters: { ...(deterministic.result.parameters ?? {}), answerTrust: trust, semanticAnswerRelevance: semantic },
      },
      trust,
      semantic,
      repaired: true,
    };
  }
  return {
    result: {
      ...deterministic.result,
      parameters: { ...(deterministic.result.parameters ?? {}), answerTrust: trust, semanticAnswerRelevance: semantic },
    },
    trust,
    semantic,
    repaired: deterministic.repaired,
  };
}
