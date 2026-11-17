/**
 * ASK_COZY_CROSS_DOMAIN_SEMANTIC_ARCHITECTURE_FRD.md — FR-ANS-6 / §18 Phase 1 / §19 Artifact #16
 *
 * Shared Presentation Humanizer & Deterministic Failure Retry Scrubber:
 * 1. Humanizes registered database enums, internal state codes, and relationship
 *    states at the shared rendering boundary without mutating genuine user-recorded
 *    values (serial numbers, model numbers, policy numbers).
 * 2. Removes retry affordances (`retryable: false`, `actions: []`) from deterministic
 *    contract or entailment failures so homeowners are never told to retry a
 *    deterministic rejection.
 */

import type { AskPresentationBlock } from '../../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../../askOperationRegistry';

export const ASK_PRESENTATION_HUMANIZER_VERSION = '1.0.0' as const;

/**
 * Registered internal enum/status/relationship codes mapped to homeowner-facing labels.
 */
export const REGISTERED_PRESENTATION_TOKEN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  // Transitional warranty & coverage evidence states
  ITEM_WARRANTY_LINKED: 'linked warranty record',
  PROPERTY_PLAN_LINKED: 'linked home warranty plan',
  BOTH_CONSISTENT: 'linked warranty record',
  CONFLICTED_LINKS: 'conflicting warranty links',
  NO_LINK_RECORDED: 'no linked warranty record',
  EXPLICIT_NO_COVERAGE: 'explicitly recorded as no coverage',
  NOT_SURE: 'not sure',
  COVERAGE_GAP: 'coverage gap',
  PARTIAL_COVERAGE: 'partial coverage',

  // Maintenance & operational work statuses / priorities
  IN_PROGRESS: 'in progress',
  NEEDS_REVIEW: 'needs review',
  NEEDS_ATTENTION: 'needs attention',
  ACTION_REQUIRED: 'action required',
  PAST_DUE: 'past due',
  HIGH_PRIORITY: 'high priority',
  MEDIUM_PRIORITY: 'medium priority',
  LOW_PRIORITY: 'low priority',
  REPLACE_SOON: 'replace soon',
  NEEDS_REPAIR: 'needs repair',
  GOOD_CONDITION: 'good condition',
  FAIR_CONDITION: 'fair condition',
  POOR_CONDITION: 'poor condition',

  // Claim & inspection statuses
  UNDER_REVIEW: 'under review',
  PENDING_DOCUMENTATION: 'pending documentation',
  APPROVED_PARTIAL: 'partially approved',
  CLOSED_NO_PAYMENT: 'closed without payment',
  SAFETY_HAZARD: 'safety hazard',
  DEFERRED_MAINTENANCE: 'deferred maintenance',

  // Home systems & categories
  HVAC_SYSTEM: 'HVAC system',
  WATER_HEATER: 'water heater',
  ELECTRICAL_PANEL: 'electrical panel',
  ROOFING_SYSTEM: 'roofing system',
  PLUMBING_SYSTEM: 'plumbing system',
  MAJOR_APPLIANCE: 'major appliance',
  HOMEOWNERS_INSURANCE: 'homeowners insurance',
  HOME_WARRANTY: 'home warranty',
});

const REGISTERED_TOKEN_PATTERN = new RegExp(
  `\\b(${Object.keys(REGISTERED_PRESENTATION_TOKEN_LABELS).sort((a, b) => b.length - a.length).join('|')})\\b`,
  'g',
);

export function humanizePresentationToken(code: string | null | undefined): string {
  if (!code) return '';
  const trimmed = code.trim();
  if (REGISTERED_PRESENTATION_TOKEN_LABELS[trimmed]) {
    return REGISTERED_PRESENTATION_TOKEN_LABELS[trimmed];
  }
  if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(trimmed)) {
    return trimmed
      .toLowerCase()
      .split('_')
      .map((word) => (word === 'hvac' ? 'HVAC' : word === 'hoa' ? 'HOA' : word === 'diy' ? 'DIY' : word === 'ac' ? 'AC' : word))
      .join(' ');
  }
  return trimmed;
}

/**
 * Replaces registered internal enum/state tokens inside rendered prose while
 * leaving user-recorded identifiers (e.g. serial/model codes with digits or hyphens)
 * untouched.
 */
export function humanizePresentationText(text: string): string {
  if (!text) return text;
  return text.replace(REGISTERED_TOKEN_PATTERN, (match) => REGISTERED_PRESENTATION_TOKEN_LABELS[match] ?? match);
}

/**
 * FR-ANS-6 shared rendering boundary: any bare SCREAMING_SNAKE enum token left in authored copy (a status, a requirement type) is
 * rendered as plain words. User-recorded identifiers with digits and hyphens (serial and model codes) are not enum tokens and are
 * left untouched.
 */
const ENUM_TOKEN_IN_COPY = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
export function humanizeEnumTokensInCopy(text: string): string {
  if (!text) return text;
  return humanizePresentationText(text).replace(ENUM_TOKEN_IN_COPY, (token) => humanizePresentationToken(token));
}

export function humanizeAskBlockPresentation(block: AskPresentationBlock): AskPresentationBlock {
  const clone = { ...block } as Record<string, unknown>;
  if (typeof clone.title === 'string') {
    clone.title = humanizePresentationText(clone.title);
  }
  if (typeof clone.body === 'string') {
    clone.body = humanizePresentationText(clone.body);
  }
  if (typeof clone.subtitle === 'string') {
    clone.subtitle = humanizePresentationText(clone.subtitle);
  }
  if (Array.isArray(clone.items)) {
    clone.items = clone.items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const itemRecord = { ...(item as Record<string, unknown>) };
      if (typeof itemRecord.title === 'string') itemRecord.title = humanizePresentationText(itemRecord.title);
      if (typeof itemRecord.body === 'string') itemRecord.body = humanizePresentationText(itemRecord.body);
      if (typeof itemRecord.detail === 'string') itemRecord.detail = humanizePresentationText(itemRecord.detail);
      if (typeof itemRecord.status === 'string' && REGISTERED_PRESENTATION_TOKEN_LABELS[itemRecord.status]) {
        itemRecord.status = REGISTERED_PRESENTATION_TOKEN_LABELS[itemRecord.status];
      }
      return itemRecord;
    });
  }
  return clone as AskPresentationBlock;
}

export function humanizeAskOperationResultPresentation(result: AskOperationResult): AskOperationResult {
  return {
    ...result,
    blocks: result.blocks.map(humanizeAskBlockPresentation),
  };
}

export const DETERMINISTIC_CONTRACT_OR_ENTAILMENT_FAILURE_CODES: ReadonlySet<string> = new Set([
  'ASK_ANSWER_TRUST_FAILED',
  'ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE',
  'ASK_ANSWER_RELEVANCE_UNRESOLVED_AFTER_CLARIFICATION',
  'SEMANTIC_RECEIPT_NOT_ENTAILED',
  'DATA_POINT_SEMANTIC_AGREEMENT_REQUIRED',
  'ASK_COMMAND_PREVIEW_ADMISSION_BLOCKED',
]);

/**
 * FR-ANS-6: Deterministic contract or entailment failures must never offer retry
 * actions or mark `retryable: true`, because repeating the identical request
 * against a deterministic contract gate produces the same rejection.
 */
export function stripRetryFromDeterministicFailure(result: AskOperationResult): AskOperationResult {
  const isDeterministicFailure = DETERMINISTIC_CONTRACT_OR_ENTAILMENT_FAILURE_CODES.has(result.reasonCode ?? '');
  if (!isDeterministicFailure) return result;

  const blocks = result.blocks.map((block) => {
    const record = { ...(block as Record<string, unknown>) };
    if ('retryable' in record) {
      record.retryable = false;
    }
    if (Array.isArray(record.actions)) {
      record.actions = record.actions.filter((action) => {
        if (!action || typeof action !== 'object') return false;
        const kind = String((action as { kind?: unknown; type?: unknown; id?: unknown }).kind ?? (action as { type?: unknown }).type ?? '');
        const label = String((action as { label?: unknown }).label ?? '');
        return !/retry|try again/i.test(kind) && !/retry|try again/i.test(label);
      });
    }
    return record as AskPresentationBlock;
  });

  return {
    ...result,
    blocks,
  };
}
