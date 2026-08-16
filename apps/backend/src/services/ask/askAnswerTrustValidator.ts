import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import { getAskOperationDefinition, type AskOperationId, type AskOperationResult } from './askOperationRegistry';
import type { AskAnswerTrustResult } from './askTrust.contract';
import { validateAskSemanticAnswerRelevance, type AskSemanticAnswerRelevanceResult } from './askSemanticAnswerValidator';
import type { AskLanguageCode } from './askLanguageRegistry';
import type { HouseholdRole } from '@prisma/client';
import { applyAskAudiencePresentation } from './askAudiencePresentation';
import {
  actionsForAskBlock,
  attachAskAuthoritativeSourceEvidence,
  authoritativeEvidenceState,
  completedAskAuthoritativeSourceEvidence,
  householdRoleFromResult,
  isAskActionApplicable,
  isBoundaryAllowedForOperation,
  isAskHrefSafeForProperty,
  nestedAskHrefs,
} from './askAnswerTrustPolicy';

export const ASK_ANSWER_TRUST_VALIDATOR_VERSION = 'deterministic-2.0';

const ABSENCE_CLAIM = /\b(?:nothing|none|no (?:active|current|future|items?|tasks?|details?|coverage|risk|permits?|maintenance|mortgage|record|quotes?|systems?|cases?|flags?|gaps?|issues?|actions?)|not missing|fully complete|everything is complete|all clear|no action (?:is )?needed)\b/i;
const INTERNAL_TOKEN = /\b(?:MAINTENANCE_STATUS|PROPERTY_SUMMARY|COVERAGE_GAPS|[A-Z]{3,}_[A-Z0-9_]{2,})\b|\b\d+\s+cents?\b/i;
const SUCCESS_STATUSES = new Set(['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS']);

function visibleText(block: AskPresentationBlock): string {
  const visibleKeys = new Set([
    'title', 'body', 'label', 'description', 'summary', 'value', 'detail', 'meta',
    'expectedOutput', 'readinessLabel', 'sourceBoundary', 'threshold', 'product',
    'channel', 'cadence', 'quietHours', 'limitation', 'note', 'observedCostLabel',
    'predictedCostLabel', 'watchState',
  ]);
  const parts: string[] = [];
  const visit = (value: unknown, key?: string): void => {
    if (typeof value === 'string') {
      if (key && visibleKeys.has(key)) parts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  visit(block);
  return parts.join(' ');
}

/**
 * Internal implementation tokens are unsafe when they leak through copy that
 * Ask authors. Canonical record values are different: homeowners can
 * legitimately store titles, labels, model numbers, and source names that
 * resemble an enum (for example, `HVAC_FILTER_CHANGE`). Those values must not
 * invalidate an otherwise trustworthy record query.
 */
function authoredPresentationText(block: AskPresentationBlock): string {
  if (block.type === 'GROUPED_LIST') {
    return [
      block.title,
      block.description,
      ...block.sections.map((section) => section.title),
    ].filter(Boolean).join(' ');
  }
  if (block.type === 'EVIDENCE') return block.title;
  if (block.type === 'TABLE') {
    return [block.title, block.description, ...block.columns.map((column) => column.label)]
      .filter(Boolean).join(' ');
  }
  return visibleText(block);
}

function operationSpecificFirstBlock(operationId: AskOperationId, blocks: AskPresentationBlock[]): boolean {
  const first = blocks[0];
  if (!first) return false;
  if (operationId === 'HOME_CHANGE_SUMMARY') return first.type === 'CHANGE_SUMMARY' || first.type === 'EMPTY_STATE';
  if (operationId === 'HVAC_DECISION_CONTINUE') return ['DECISION_PROGRESS', 'EMPTY_STATE'].includes(first.type);
  if (operationId === 'HVAC_DECISION_OUTCOME_VIEW') return ['OUTCOME_SUMMARY', 'EMPTY_STATE'].includes(first.type);
  if (operationId.endsWith('_BOUNDARY')) return first.type === 'BOUNDARY';
  if (['WORKFLOW_PROGRESS', 'MONITOR', 'OUTCOME_SUMMARY', 'DECISION_PROGRESS', 'SCENARIO_COMPARISON', 'PREFERENCE_REFERENCE'].includes(first.type)) {
    return getAskOperationDefinition(operationId).allowedBlockTypes.includes(first.type);
  }
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
  const invalidBoundary = blocks.some((block) => block.type === 'BOUNDARY'
    && !isBoundaryAllowedForOperation(input.operationId, block.id, input.result));
  if (invalidBoundary) {
    const withoutInapplicableBoundaries = blocks.filter((block) => block.type !== 'BOUNDARY'
      || isBoundaryAllowedForOperation(input.operationId, block.id, input.result));
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

  const source = authoritativeEvidenceState(input.result, input.operationId);
  const text = blocks.map(visibleText).join(' ');
  const hasAbsenceClaim = ABSENCE_CLAIM.test(text);
  const absenceSupported = !hasAbsenceClaim || source === 'COMPLETE';
  const hasInternalToken = INTERNAL_TOKEN.test(blocks.map(authoredPresentationText).join(' '));
  const householdRole = householdRoleFromResult(input.result);
  const actionApplicable = (action: ReturnType<typeof actionsForAskBlock>[number]) => isAskActionApplicable({
    action, operationId: input.operationId, propertyId: input.propertyId, householdRole,
    authoritativeSourceAvailable: source !== 'UNAVAILABLE',
  });
  const invalidAction = blocks.some((block) => actionsForAskBlock(block).some((action) => {
    if (block.type === 'PRIORITY_LIST' && block.items.some((item) => item.cta?.id === action.id && item.homeActionId === action.id)) {
      return !isAskActionApplicable({
        action, operationId: input.operationId, propertyId: input.propertyId, householdRole,
        authoritativeSourceAvailable: source !== 'UNAVAILABLE', trustedDynamicAction: true,
      });
    }
    return !actionApplicable(action);
  })) || blocks.some((block) => nestedAskHrefs(block).some((href) => source === 'UNAVAILABLE' || !isAskHrefSafeForProperty(href, input.propertyId)));
  if (invalidAction) {
    blocks = blocks.map((block) => {
      if (block.type === 'PRIORITY_LIST') {
        return { ...block, items: block.items.map((item) => ({
          ...item, cta: item.cta && isAskActionApplicable({
            action: item.cta, operationId: input.operationId, propertyId: input.propertyId, householdRole,
            authoritativeSourceAvailable: source !== 'UNAVAILABLE', trustedDynamicAction: item.cta.id === item.homeActionId,
          }) ? item.cta : null,
        })) };
      }
      if (block.type === 'CAPABILITY_LIST') {
        return { ...block, capabilities: block.capabilities.filter((capability) => source !== 'UNAVAILABLE' && isAskHrefSafeForProperty(capability.href, input.propertyId)) };
      }
      if (block.type === 'GROUPED_LIST') {
        return { ...block, sections: block.sections.map((section) => ({
          ...section, items: section.items.map((item) => ({
            ...item, href: item.href && (source === 'UNAVAILABLE' || !isAskHrefSafeForProperty(item.href, input.propertyId)) ? null : item.href,
          })),
        })) };
      }
      if (block.type === 'TIMELINE') {
        return { ...block, items: block.items.map((item) => ({
          ...item, href: item.href && (source === 'UNAVAILABLE' || !isAskHrefSafeForProperty(item.href, input.propertyId)) ? null : item.href,
        })) };
      }
      if (block.type === 'CHANGE_SUMMARY' && block.linkedAction
        && (source === 'UNAVAILABLE' || !isAskHrefSafeForProperty(block.linkedAction.href, input.propertyId))) {
        return { ...block, linkedAction: null };
      }
      return 'actions' in block && Array.isArray(block.actions)
        ? { ...block, actions: block.actions.filter(actionApplicable) } as AskPresentationBlock
        : block;
    }).filter((block) => block.type !== 'CAPABILITY_LIST' || block.capabilities.length > 0);
    repaired = true;
    reasonCodes.push('INAPPLICABLE_ACTION_REMOVED');
  }

  const coverage = operationSpecificFirstBlock(input.operationId, blocks);
  const congruent = blocks.length > 0 && blocks.every((block) => block.type === 'BOUNDARY' || allowed.has(block.type));
  if (!coverage) reasonCodes.push('DIRECT_ANSWER_MISSING');
  if (!absenceSupported) reasonCodes.push('UNSUPPORTED_ABSENCE_CLAIM');
  if (source !== 'COMPLETE') reasonCodes.push(source === 'PARTIAL' ? 'AUTHORITATIVE_SOURCE_PARTIAL' : 'AUTHORITATIVE_SOURCE_EVIDENCE_MISSING');
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
      boundaryApplicability: invalidBoundary ? 'FAIL' : blocks.some((block) => block.type === 'BOUNDARY') ? 'PASS' : 'NOT_APPLICABLE',
      actionApplicability: blocks.some((block) => actionsForAskBlock(block).length) || invalidAction ? (invalidAction ? 'FAIL' : 'PASS') : 'NOT_APPLICABLE',
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
  recoveryAttempted?: boolean;
  operationConfirmedByUser?: boolean;
}): { result: AskOperationResult; trust: AskAnswerTrustResult; semantic: AskSemanticAnswerRelevanceResult | null; repaired: boolean } {
  const deterministic = validateAskAnswerTrust(input);
  if (!input.semanticEnabled) return { ...deterministic, semantic: null };
  const semantic = validateAskSemanticAnswerRelevance({
    question: input.question,
    operationId: input.operationId,
    result: deterministic.result,
    language: input.language,
    operationConfirmedByUser: input.operationConfirmedByUser,
  });
  const semanticFailed = semantic.outcome === 'FAIL' || semantic.outcome === 'UNKNOWN';
  const trust: AskAnswerTrustResult = {
    ...deterministic.trust,
    outcome: semanticFailed && SUCCESS_STATUSES.has(deterministic.result.status)
      ? 'CLARIFY'
      : deterministic.trust.outcome,
    checks: {
      ...deterministic.trust.checks,
      questionCoverage: semantic.outcome === 'FAIL'
        ? 'FAIL'
        : semantic.outcome === 'UNKNOWN'
          ? 'UNKNOWN'
          : deterministic.trust.checks.questionCoverage,
    },
    reasonCodes: [...new Set([...deterministic.trust.reasonCodes, ...semantic.reasonCodes])],
    validatorVersion: `${deterministic.trust.validatorVersion}+${semantic.validatorVersion}`,
  };
  if (semanticFailed && SUCCESS_STATUSES.has(deterministic.result.status)) {
    if (input.recoveryAttempted) {
      return {
        result: {
          status: 'UNAVAILABLE',
          reasonCode: 'ASK_ANSWER_RELEVANCE_UNRESOLVED_AFTER_CLARIFICATION',
          blocks: [{
            type: 'ERROR_STATE', id: 'answer-relevance-unresolved',
            title: 'I still couldn’t verify this answer',
            body: 'I used your clarification, but the prepared response still did not reliably match it. I won’t show a potentially unrelated answer. Open the relevant home workspace or ask with one more specific detail.',
            retryable: false, actions: [],
          }],
          suggestions: [],
          parameters: { ...(deterministic.result.parameters ?? {}), answerTrust: trust, semanticAnswerRelevance: semantic },
        },
        trust,
        semantic,
        repaired: true,
      };
    }
    const candidateOperationIds = [...new Set([
      input.operationId,
      semantic.competingOperationId,
    ].filter((operationId): operationId is AskOperationId => Boolean(operationId)))]
      .filter((operationId) => !getAskOperationDefinition(operationId).safetyClass.endsWith('_BOUNDARY'))
      .slice(0, 3);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const clearMismatch = semantic.outcome === 'FAIL';
    const clarification = {
      version: 1,
      question: clearMismatch
        ? 'Which home request did you want this answer to address?'
        : 'Which home information should I check for this request?',
      options: candidateOperationIds.map((operationId) => ({
        operationId,
        label: getAskOperationDefinition(operationId).semantic.supportedJobs[0],
      })),
      allowFreeText: true,
      expiresAt,
    };
    return {
      result: {
        status: 'NEEDS_CLARIFICATION',
        reasonCode: clearMismatch
          ? 'ASK_ANSWER_RELEVANCE_MISMATCH_CLARIFICATION_REQUIRED'
          : 'ASK_ANSWER_RELEVANCE_UNCERTAIN_CLARIFICATION_REQUIRED',
        blocks: [{
          type: 'ERROR_STATE',
          id: clearMismatch ? 'answer-relevance-mismatch' : 'answer-relevance-uncertain',
          title: clearMismatch ? 'Let’s make sure I answer the right home question' : 'I need one detail to verify this answer',
          body: clearMismatch
            ? 'The prepared response may address a different home request. Choose the home information you meant and I’ll run that canonical workflow again.'
            : 'I could not confidently connect the prepared response to the exact wording of your request. Choose a focus or add one detail so I can verify it without guessing.',
          retryable: false,
          actions: [],
        }],
        clarification,
        suggestions: [],
        parameters: {
          ...(deterministic.result.parameters ?? {}),
          answerTrust: trust,
          semanticAnswerRelevance: semantic,
          clarification: { version: 1, candidateOperationIds, expiresAt },
        },
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

export function validateAskConfirmedCompletion(input: {
  question: string;
  operationId: AskOperationId;
  result: AskOperationResult;
  propertyId: string;
  householdRole: HouseholdRole;
}) {
  const presented = applyAskAudiencePresentation({
    result: input.result,
    householdRole: input.householdRole,
    journeyContext: null,
    propertyId: input.propertyId,
    lifecycleFramingEnabled: false,
  });
  return validateAskAnswerTrustPipeline({
    question: input.question,
    operationId: input.operationId,
    propertyId: input.propertyId,
    result: attachAskAuthoritativeSourceEvidence(presented, [completedAskAuthoritativeSourceEvidence(input.operationId)]),
    semanticEnabled: false,
  });
}
