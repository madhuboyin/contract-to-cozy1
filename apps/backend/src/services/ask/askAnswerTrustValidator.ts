import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import { getAskOperationDefinition, isReadOnlyOperation, type AskOperationId, type AskOperationResult } from './askOperationRegistry';
import type { AskAnswerTrustResult } from './askTrust.contract';
import { validateAskSemanticAnswerRelevance, type AskSemanticAnswerRelevanceResult } from './askSemanticAnswerValidator';
import type { AskLanguageCode } from './askLanguageRegistry';
import type { HouseholdRole } from '@prisma/client';
import { ASK_NAMING_HINT, ASK_UNVERIFIABLE_ANSWER_TEXT } from './askRemoteFallbackTypedClaims';
import { clarificationLabelFor } from './support/clarificationLabels';
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
  // Lifespan and progress items name canonical records (appliance names, checklist step titles), which may resemble
  // an enum; only the copy Ask itself writes is checked.
  if (block.type === 'LIFESPAN') {
    return [block.title, block.description, block.basis, block.missingAgeTitle, ...block.items.map((item) => item.statusLabel)].filter(Boolean).join(' ');
  }
  // Insight board items are canonical findings (driver, loss and step titles); only the block copy, section titles and badges are checked.
  if (block.type === 'INSIGHT_BOARD') {
    return [block.title, block.description, ...block.sections.flatMap((section) => [section.title, section.summary, ...section.items.map((item) => item.badge?.label)])].filter(Boolean).join(' ');
  }
  if (block.type === 'PROGRESS') {
    return [block.title, block.description, block.basis, ...block.metrics.map((metric) => metric.label)].filter(Boolean).join(' ');
  }
  // Timeline items are canonical event titles and summaries; only the block copy and Ask's category labels are checked.
  if (block.type === 'TIMELINE') {
    return [block.title, block.description, ...block.items.map((item) => item.category?.label)].filter(Boolean).join(' ');
  }
  // Comparison options name canonical records (provider names, recorded scope and terms); only Ask's own copy is
  // checked: titles, attribute labels and declared badges.
  if (block.type === 'COMPARISON') {
    return [
      block.title, block.description,
      ...block.options.flatMap((option) => [
        ...option.attributes.map((attribute) => attribute.label),
        ...[option.badge, ...(option.badges ?? [])].flatMap((badge) => (badge ? [badge.label, badge.basis] : [])),
      ]),
    ].filter(Boolean).join(' ');
  }
  if (block.type === 'EVIDENCE') return block.title;
  if (block.type === 'OUTPUT_ARTIFACTS' || block.type === 'RELATED_RECORDS') return block.title;
  if (block.type === 'TABLE') {
    return [block.title, block.description, ...block.columns.map((column) => column.label)]
      .filter(Boolean).join(' ');
  }
  if (block.type === 'ENVIRONMENT_REPORT') {
    return [block.title, block.summary].filter(Boolean).join(' ');
  }
  // Priority-list item titles, key-fact values and evidence-source labels are canonical recorded values that may
  // resemble an enum (for example, OPEN_METEO) and are exempt. The sentences shown to the homeowner (summary, impact,
  // recommended action, expected outcome, timing rationale, watch state) are still checked, as is Ask's own framing.
  if (block.type === 'PRIORITY_LIST') {
    return [
      block.title,
      ...(block.filters ?? []).map((filter) => filter.label),
      ...block.items.flatMap((item) => [
        item.watchState,
        item.presentation?.summary,
        item.presentation?.whyItMatters,
        item.presentation?.recommendedAction,
        item.presentation?.expectedOutcome,
        item.presentation?.timing.rationale,
      ]),
    ].filter(Boolean).join(' ');
  }
  return visibleText(block);
}

function operationSpecificFirstBlock(operationId: AskOperationId, blocks: AskPresentationBlock[]): boolean {
  const first = blocks[0];
  if (!first) return false;
  if (operationId === 'HOME_CHANGE_SUMMARY') return first.type === 'CHANGE_SUMMARY' || first.type === 'EMPTY_STATE' || (first.type === 'SUMMARY' && first.id === 'home-change-summary');
  if (operationId === 'HVAC_DECISION_CONTINUE') return ['DECISION_PROGRESS', 'EMPTY_STATE'].includes(first.type);
  if (operationId === 'HVAC_DECISION_OUTCOME_VIEW') return ['OUTCOME_SUMMARY', 'EMPTY_STATE'].includes(first.type);
  if (operationId.endsWith('_BOUNDARY')) return first.type === 'BOUNDARY';
  if (['WORKFLOW_PROGRESS', 'MONITOR', 'OUTCOME_SUMMARY', 'DECISION_PROGRESS', 'SCENARIO_COMPARISON', 'PREFERENCE_REFERENCE', 'TASK_GUIDE', 'ENVIRONMENT_REPORT'].includes(first.type)) {
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
  // A result that is not an answer (UNAVAILABLE, BLOCKED, ...) carries the operation-agnostic explanation of why there is no answer, often a
  // SUMMARY. That block is never one of the operation's answer types, so filtering it would leave the homeowner an empty card and a lone retry button.
  const answerShaped = SUCCESS_STATUSES.has(input.result.status);
  let blocks = input.result.blocks.filter((block) => !answerShaped || block.type === 'BOUNDARY' || block.type === 'ERROR_STATE' || allowed.has(block.type));
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
  // Block types whose repair (below) touches only their items' links and calls to action: their OWN typed in-Ask actions have never been subject to the
  // allowlist, and are not removed here. The report must say so (below) instead of claiming a removal that did not happen.
  const LIST_BLOCK_TYPES = new Set<AskPresentationBlock['type']>(['PRIORITY_LIST', 'CAPABILITY_LIST', 'GROUPED_LIST', 'TIMELINE', 'CHANGE_SUMMARY', 'OUTPUT_ARTIFACTS', 'RELATED_RECORDS']);
  let unlistedActionRetained = false;
  if (invalidAction) {
    const blocksBeforeRepair = JSON.stringify(blocks);
    const repairBlock = (block: AskPresentationBlock): AskPresentationBlock => {
      if (block.type === 'PRIORITY_LIST') {
        return { ...block, items: block.items.map((item) => ({
          ...item, cta: item.cta && isAskActionApplicable({
            action: item.cta, operationId: input.operationId, propertyId: input.propertyId, householdRole,
            authoritativeSourceAvailable: source !== 'UNAVAILABLE', trustedDynamicAction: item.cta.id === item.homeActionId,
          }) ? item.cta : null,
        })) };
      }
      if (block.type === 'CAPABILITY_LIST') {
        // Tool discovery keeps its cards when only the full-page link is unsafe: the card still names the tool and says what it does, and the
        // link is removed (Ask never links to desktop pages). Other capability lists keep dropping such cards.
        if (block.id === 'capability-matches') {
          return { ...block, capabilities: block.capabilities.map((capability) => ({
            ...capability, href: capability.href && source !== 'UNAVAILABLE' && isAskHrefSafeForProperty(capability.href, input.propertyId) ? capability.href : null,
          })) };
        }
        return { ...block, capabilities: block.capabilities.filter((capability) => source !== 'UNAVAILABLE' && capability.href !== null && isAskHrefSafeForProperty(capability.href, input.propertyId)) };
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
      if (block.type === 'OUTPUT_ARTIFACTS') {
        return { ...block, items: block.items.map((item) => ({
          ...item,
          navigation: item.navigation && source !== 'UNAVAILABLE' && isAskHrefSafeForProperty(item.navigation.href, input.propertyId)
            ? item.navigation
            : null,
        })) };
      }
      if (block.type === 'RELATED_RECORDS') {
        return { ...block, relationships: block.relationships.map((relationship) => ({
          ...relationship,
          navigation: relationship.navigation && source !== 'UNAVAILABLE' && isAskHrefSafeForProperty(relationship.navigation.href, input.propertyId)
            ? relationship.navigation
            : null,
        })) };
      }
      return 'actions' in block && Array.isArray(block.actions)
        ? { ...block, actions: block.actions.filter(actionApplicable) } as AskPresentationBlock
        : block;
    };
    // A block's own actions lose a link that leaves Ask whatever else its type repairs (a list or priority list keeps no desktop button after its
    // items lose their links). Only the link is judged here: a typed in-Ask action on those blocks was never subject to the allowlist and stays so.
    const leavesAsk = (action: ReturnType<typeof actionsForAskBlock>[number]) => Boolean(action.href) && !isAskHrefSafeForProperty(action.href as string, input.propertyId);
    blocks = blocks.map((block) => {
      const repaired = repairBlock(block);
      return 'actions' in repaired && Array.isArray(repaired.actions)
        ? { ...repaired, actions: repaired.actions.filter((action) => !leavesAsk(action)) } as AskPresentationBlock
        : repaired;
    }).filter((block) => block.type !== 'CAPABILITY_LIST' || block.capabilities.length > 0);
    // Report what actually happened. The check below still FAILS (the action is not allowlisted), but "repaired" and "removed" are claims about the
    // answer, so they are made only when the answer changed.
    const changed = JSON.stringify(blocks) !== blocksBeforeRepair;
    unlistedActionRetained = blocks.some((block) => LIST_BLOCK_TYPES.has(block.type) && 'actions' in block && Array.isArray(block.actions)
      && block.actions.some((action) => !action.href && !actionApplicable(action)));
    if (changed) {
      repaired = true;
      reasonCodes.push('INAPPLICABLE_ACTION_REMOVED');
    }
    if (unlistedActionRetained) reasonCodes.push('UNLISTED_ACTION_RETAINED');
  }

  const coverage = operationSpecificFirstBlock(input.operationId, blocks);
  const congruent = blocks.length > 0 && blocks.every((block) => block.type === 'BOUNDARY' || allowed.has(block.type));
  if (!coverage) reasonCodes.push('DIRECT_ANSWER_MISSING');
  if (!congruent) reasonCodes.push('OPERATION_CONGRUENCE_FAILED');
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
        suggestions: [], parameters: { ...(input.result.parameters ?? {}), answerTrust: trust },
      }, trust, repaired: true,
    };
  }
  if ((outcome === 'BLOCK' || outcome === 'CLARIFY') && SUCCESS_STATUSES.has(input.result.status)) {
    // The generic fallback's answer is assembled from recorded facts and may differ on a retry, but a blocked one is not an error the homeowner can fix by
    // pressing "Try again": it is an answer that could not be confirmed, which the turn replaces with the plain message and, where the router had candidates,
    // a "Did you mean" (support/didYouMean.ts).
    if (input.operationId === 'GROUNDED_GUIDANCE') {
      return {
        result: {
          status: 'READY_WITH_LIMITATIONS', reasonCode: 'ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE',
          blocks: [{ type: 'SUMMARY', id: 'answer-unverified', title: 'I’m not sure that answers your question', body: ASK_UNVERIFIABLE_ANSWER_TEXT, tone: 'CAUTION', actions: [] }],
          suggestions: [], parameters: { ...(input.result.parameters ?? {}), answerTrust: trust },
        }, trust, repaired: true,
      };
    }
    return {
      result: {
        status: 'FAILED_RETRYABLE', reasonCode: 'ASK_ANSWER_TRUST_FAILED',
        blocks: [{ type: 'ERROR_STATE', id: 'answer-trust-failed', title: 'I couldn’t verify this answer', body: 'The response did not safely match your question and the selected home workflow. Nothing was changed. Please try again with one more detail.', retryable: true, actions: [] }],
        suggestions: [], parameters: { ...(input.result.parameters ?? {}), answerTrust: trust },
      }, trust, repaired: true,
    };
  }
  return {
    result: { ...input.result, blocks, parameters: { ...(input.result.parameters ?? {}), answerTrust: trust } },
    trust, repaired,
  };
}

const LIMITATION_BLOCK_TYPES = new Set(['SUMMARY', 'EMPTY_STATE', 'BOUNDARY', 'EVIDENCE']);

/**
 * An operation's own plain "I can't do that with what is recorded" answer: a limitation status with a typed reason, made only of plain
 * blocks, one of which is a cautionary summary or an empty state. It carries no data that could belong to a different request, so when the
 * request reached the operation by a certain rule the relevance check can only add a confirmation click (its words rarely resemble the question).
 */
export function isAskHonestLimitationResult(result: AskOperationResult): boolean {
  return result.status === 'READY_WITH_LIMITATIONS' && Boolean(result.reasonCode)
    && result.blocks.length > 0 && result.blocks.every((block) => LIMITATION_BLOCK_TYPES.has(block.type))
    && result.blocks.some((block) => block.type === 'EMPTY_STATE' || (block.type === 'SUMMARY' && block.tone === 'CAUTION'));
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
  /** The runner-up requests the router weighed when it picked `operationId`; offered as choices if the prepared answer cannot be matched to the question. */
  routingAlternatives?: ReadonlyArray<{ operationId: AskOperationId; confidence: number }>;
  /** The request reached `operationId` by a certain (deterministic) rule, not by a score; see isAskHonestLimitationResult. */
  routedDeterministically?: boolean;
}): { result: AskOperationResult; trust: AskAnswerTrustResult; semantic: AskSemanticAnswerRelevanceResult | null; repaired: boolean } {
  const deterministic = validateAskAnswerTrust(input);
  if (!input.semanticEnabled || (input.routedDeterministically && isAskHonestLimitationResult(deterministic.result))) return { ...deterministic, semantic: null };
  const semantic = validateAskSemanticAnswerRelevance({
    question: input.question,
    operationId: input.operationId,
    result: deterministic.result,
    language: input.language,
    operationConfirmedByUser: input.operationConfirmedByUser,
    routedDeterministically: input.routedDeterministically,
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
            title: 'I still can’t confirm that answer',
            body: `I used your clarification, but I still can’t confirm the answer I prepared matches what you asked, so I haven’t shown it. ${ASK_NAMING_HINT}`,
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
    const clearMismatch = semantic.outcome === 'FAIL';
    // An UNKNOWN score is not evidence that the competing operation is relevant. Offering it as a choice exposed arbitrary semantic
    // neighbors (for example, Home Record export for a seasonal-care question). Only a clear mismatch may offer the competitor.
    // Runner-up requests the router weighed are real choices only when they were close to the one it picked and above the noise floor.
    const selectedConfidence = input.routingAlternatives?.find((entry) => entry.operationId === input.operationId)?.confidence ?? 0;
    const routedAlternatives = (input.routingAlternatives ?? [])
      .filter((entry) => entry.operationId !== input.operationId && entry.confidence >= 0.3 && selectedConfidence - entry.confidence <= 0.2)
      .map((entry) => entry.operationId);
    let candidateOperationIds = [...new Set([
      input.operationId,
      ...(clearMismatch ? [semantic.competingOperationId] : []),
      ...routedAlternatives,
    ].filter((operationId): operationId is AskOperationId => Boolean(operationId)))]
      .filter((operationId) => !getAskOperationDefinition(operationId).safetyClass.endsWith('_BOUNDARY'))
      // A competing or runner-up request is offered as a choice only if it is a read: "export the home record" is never what a water-heater question meant.
      .filter((operationId) => operationId === input.operationId || isReadOnlyOperation(operationId));
    // "Get general educational home guidance" is the fallback that just failed; it is a choice only when nothing else is.
    if (candidateOperationIds.length > 1) candidateOperationIds = candidateOperationIds.filter((operationId) => operationId !== 'GROUNDED_GUIDANCE');
    candidateOperationIds = candidateOperationIds.slice(0, 3);
    // FR-REC-1 / FR-REC-4: a card needs at least two options, and a withheld answer is never followed by a card whose only option re-runs the same operation.
    if (candidateOperationIds.length < 2 || candidateOperationIds.every((operationId) => operationId === 'GROUNDED_GUIDANCE')) {
      // Nothing real to choose between: a one-option question that re-runs the failed fallback only ends in "I still couldn't verify".
      return {
        result: {
          status: 'READY_WITH_LIMITATIONS',
          reasonCode: 'ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE',
          blocks: [{ type: 'SUMMARY', id: 'answer-unverified', title: 'I’m not sure that answers your question', body: ASK_UNVERIFIABLE_ANSWER_TEXT, tone: 'CAUTION', actions: [] }],
          suggestions: [],
          parameters: { ...(deterministic.result.parameters ?? {}), answerTrust: trust, semanticAnswerRelevance: semantic },
        },
        trust,
        semantic,
        repaired: true,
      };
    }
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const clarification = {
      version: 1,
      question: clearMismatch
        ? 'Which home request did you want this answer to address?'
        : 'What did you want to look at?',
      options: candidateOperationIds.map((operationId) => ({
        operationId,
        label: clarificationLabelFor(operationId),
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
          title: clearMismatch ? 'Let’s make sure I answer the right home question' : 'I’m not sure I understood that',
          body: clearMismatch
            ? 'The prepared response may address a different home request. Choose the home information you meant and I’ll run that canonical workflow again.'
            : 'I’m not confident the answer I prepared is what you asked for, so I haven’t shown it. Pick what you meant, or say it another way.',
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
