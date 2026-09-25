// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationId, type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { getHomeActionFeed } from '../../homeActions.service';
import { AgentRuntimeAuthorizationError, AgentRuntimeCasConflictError, AgentRuntimeDisabledError, AgentRuntimeStateError, invokeAgentRuntime } from '../../agents/agentRuntime.service';
import type { AgentRunStatusProjection, HvacSpecialistHomeActionOrigin } from '../../agents/agentRuntime.contract';
import { askContextFingerprint, durableFreeTextClarification, ensurePropertyAccess, formatOutcomeCents, outcomeSummaryBlock } from '../askHandlerSupport';
import * as decisionThreadService from '../../decisionPlatform/decisionThreadService';
import * as decisionPreferenceService from '../../decisionPlatform/decisionPreferenceService';
import { assumptionsItemsForSnapshot, decisionProgressBlock, evidenceItemsForCanonicalFacts, recommendationChangeBlock, type HvacEvidenceSourceItem, whyNowBlock } from '../decisionThreadPresentationBlocks';
import * as outcomeObservationService from '../../decisionPlatform/outcomeObservationService';

export async function hvacDecisionStartContextVersion(propertyId: string, inventoryItemId: string): Promise<string> {
  const item = await prisma.inventoryItem.findFirst({ where: { id: inventoryItemId, propertyId }, select: { id: true, updatedAt: true } });
  return askContextFingerprint(item ? [item.id, item.updatedAt.toISOString()] : ['missing', inventoryItemId]);
}

export async function hvacDecisionThreadVersionFingerprint(threadId: string): Promise<string> {
  const thread = await prisma.decisionThread.findUnique({ where: { id: threadId }, select: { id: true, version: true, lifecycleStatus: true } });
  return askContextFingerprint(thread ? [thread.id, thread.version, thread.lifecycleStatus] : ['missing', threadId]);
}

// HvacRepairReplaceVerdict is ordinal (REPAIR < MONITOR < REPLACE), not
// binary -- comparing verdict codes directly would mislabel, e.g., a
// REPLACE-to-MONITOR shift as "favors repair" when it's really just "less
// urgent to replace." Rank the two verdicts and compare ranks instead.
export const HVAC_VERDICT_RANK: Record<string, number> = { REPAIR: 0, MONITOR: 1, REPLACE: 2 };

// D01 fix (docs/architecture/ASK_COZY_PHASE7_DECISIONS_ACCEPTANCE_VERIFICATION.md):
// a separate, wider function from preferenceReferenceBlocksForSnapshot above
// -- NOT a drop-in replacement -- because it also pushes EVIDENCE and
// ASSUMPTIONS blocks, and only HVAC_DECISION_START/CONTINUE's registry
// entries declare those (HVAC_DECISION_SCENARIO's confirm handler, the
// other consumer of the plain preference-only function, does not). Used
// only by hvacDecisionStartResult/hvacDecisionContinueResult's own 3 read
// paths below, never by a confirm handler. RecommendationSnapshot.canonicalFactReferences
// only stores {entityType, entityId, fieldPath} references, not values --
// EVIDENCE resolves them against the live, currently-passed InventoryItem
// (per "current...evidence loaded"), not what the values were at generation
// time. `item` is optional only for defensiveness -- every real call site
// has already resolved one by the time this is called.
async function hvacDecisionDisclosureBlocks(
  idPrefix: string,
  snapshot: { preferenceReferenceIds: string[]; canonicalFactReferences: unknown; engineVersion: string } | null | undefined,
  item: HvacEvidenceSourceItem | null,
): Promise<AskPresentationBlock[]> {
  if (!snapshot) return [];
  const details = await decisionPreferenceService.getPreferenceReferenceDetails(snapshot.preferenceReferenceIds);
  const blocks: AskPresentationBlock[] = details.map((detail) => ({
    type: 'PREFERENCE_REFERENCE', id: `${idPrefix}-preference-${detail.definitionId.toLowerCase().replace(/_/g, '-')}`,
    title: detail.definitionId === 'OWNERSHIP_HORIZON' ? 'Using your confirmed plan' : 'Using your confirmed preference',
    preferenceKey: detail.definitionId, summary: detail.summary, visibility: detail.visibility,
    confirmedAt: detail.confirmedAt ? detail.confirmedAt.toISOString() : null,
    expiresAt: detail.expiresAt ? detail.expiresAt.toISOString() : null,
  }));
  if (item) {
    const evidenceItems = evidenceItemsForCanonicalFacts(snapshot.canonicalFactReferences, item);
    if (evidenceItems.length) blocks.push({ type: 'EVIDENCE', id: `${idPrefix}-evidence`, title: 'What this is based on', items: evidenceItems });
  }
  blocks.push({ type: 'ASSUMPTIONS', id: `${idPrefix}-assumptions`, title: 'Assumptions used', items: assumptionsItemsForSnapshot(details, snapshot.engineVersion) });
  return blocks;
}

async function findHvacItemForMessage(propertyId: string, message: string, focusedInventoryItemId?: string | null): Promise<{ items: { id: string; name: string }[]; item: { id: string; name: string; condition: string; installedOn: Date | null; updatedAt: Date } | null }> {
  const items = await prisma.inventoryItem.findMany({ where: { propertyId, category: 'HVAC' }, select: { id: true, name: true, condition: true, installedOn: true, updatedAt: true }, take: 50 });
  const lower = message.toLowerCase();
  const matched = focusedInventoryItemId
    ? items.find((candidate) => candidate.id === focusedInventoryItemId)
    : items.find((candidate) => lower.includes(candidate.name.toLowerCase()));
  const item = matched ?? (items.length === 1 ? items[0] : null);
  return { items, item };
}

function hvacDecisionThreadAmbiguousResult(operationId: AskOperationId, candidates: { id: string; title: string; lifecycleStatus: string }[]): AskOperationResult {
  return {
    status: 'NEEDS_ENTITY', reasonCode: 'HVAC_DECISION_THREAD_AMBIGUOUS',
    ...durableFreeTextClarification(operationId, 'Multiple decision threads are active for this HVAC system. Which one should Ask continue?'),
    blocks: [{
      type: 'GROUPED_LIST', filters: [], id: 'hvac-decision-thread-candidates', title: 'Active decision threads',
      description: 'This should not normally happen; contact support if it persists.',
      sections: [{ id: 'threads', title: 'Threads', count: candidates.length, items: candidates.map((candidate) => ({ id: candidate.id, title: candidate.title, description: candidate.lifecycleStatus, meta: [], status: candidate.lifecycleStatus, href: null })) }],
      actions: [],
    }],
    suggestions: [],
  };
}

export async function hvacDecisionStartResult(userId: string, propertyId: string, message: string, executionId: string, focusedInventoryItemId?: string | null): Promise<AskOperationResult> {
  const { items, item } = await findHvacItemForMessage(propertyId, message, focusedInventoryItemId);
  if (!items.length) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'HVAC_DECISION_ITEM_REQUIRED',
      ...durableFreeTextClarification('HVAC_DECISION_START', 'No HVAC system is recorded on this property yet. What HVAC system should Ask track?'),
      blocks: [{ type: 'SUMMARY', id: 'hvac-decision-no-item', title: 'No HVAC system recorded', body: 'Add the HVAC system to the home record first, then ask again.', tone: 'CAUTION', actions: [{ id: 'open-inventory', label: 'Add HVAC system', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`, style: 'PRIMARY' }] }],
      suggestions: [],
    };
  }
  if (!item) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'HVAC_DECISION_ITEM_AMBIGUOUS',
      ...durableFreeTextClarification('HVAC_DECISION_START', 'Which recorded HVAC system should Ask evaluate?'),
      blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'hvac-decision-items', title: 'Choose an HVAC system', description: 'Use the exact name in your next message.', sections: [{ id: 'items', title: 'Recorded HVAC systems', count: items.length, items: items.map((candidate) => ({ id: candidate.id, title: candidate.name, description: null, meta: [], status: null, href: null })) }], actions: [] }],
      suggestions: items.slice(0, 3).map((candidate) => `Should I repair or replace my ${candidate.name}?`),
    };
  }

  const selection = await decisionThreadService.selectHvacDecisionThread(propertyId, item.id);
  if (selection.kind === 'UNIQUE') {
    const { thread, change, triggerReasonCodes } = await decisionThreadService.continueHvacDecisionThread(selection.thread.id, propertyId, executionId);
    const blocks: AskPresentationBlock[] = [decisionProgressBlock('hvac-decision-progress', `Repair or replace: ${item.name}`, thread, thread.currentRecommendationSnapshot, [])];
    if (change && thread.currentRecommendationSnapshot) {
      blocks.push(whyNowBlock('hvac-decision-why-now', thread.currentRecommendationSnapshot, triggerReasonCodes));
      blocks.push(recommendationChangeBlock('hvac-decision-change', thread.id, change));
    }
    blocks.push(...await hvacDecisionDisclosureBlocks('hvac-decision', thread.currentRecommendationSnapshot, item));
    return {
      status: 'ANSWERED', reasonCode: 'HVAC_DECISION_ALREADY_ACTIVE',
      blocks,
      suggestions: ['What changed about this decision?'],
    };
  }
  if (selection.kind === 'AMBIGUOUS') {
    return hvacDecisionThreadAmbiguousResult('HVAC_DECISION_START', selection.candidates);
  }

  const contextVersion = await hvacDecisionStartContextVersion(propertyId, item.id);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HVAC_DECISION_START_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { hvacDecisionStart: { inventoryItemId: item.id }, hvacDecisionContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'hvac-decision-review', title: `Start a decision thread for ${item.name}?`, body: 'This creates a durable, resumable repair-vs-replace decision using the registered HVAC engine. No purchase or provider selection happens.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `hvac-decision-start-${item.id}-1`, version: 1, title: `Start a decision thread for ${item.name}?`,
      description: 'Ask will evaluate the recorded condition, age, repair history, and warranty for this system and produce an explainable repair-or-replace recommendation you can resume across sessions.',
      fields: [{ label: 'System', value: item.name }],
      editableFields: [], confirmLabel: 'Start decision thread', consentText: 'I authorize creating this decision thread in the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function hvacDecisionContinueResult(userId: string, propertyId: string, message: string, executionId: string, focusedDecisionThreadId?: string | null): Promise<AskOperationResult> {
  if (focusedDecisionThreadId) {
    const focusedThread = await prisma.decisionThread.findFirst({
      where: {
        id: focusedDecisionThreadId,
        propertyId,
        decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
        primaryEntityType: 'InventoryItem',
        lifecycleStatus: { in: [...decisionThreadService.ACTIVE_LIFECYCLE_STATUSES] },
      },
      select: { id: true, primaryEntityId: true },
    });
    if (!focusedThread?.primaryEntityId) {
      return {
        status: 'NOT_APPLICABLE',
        reasonCode: 'HVAC_DECISION_SUBJECT_NOT_ACTIVE',
        blocks: [{
          type: 'EMPTY_STATE',
          id: 'hvac-decision-subject-not-active',
          title: 'This decision is no longer active',
          body: 'The selected decision thread is not active for this home. Ask will not substitute a different decision based on title or recency.',
          actions: [],
        }],
        suggestions: ['Show my active home decisions'],
      };
    }
    const focusedItem = await prisma.inventoryItem.findFirst({
      where: { id: focusedThread.primaryEntityId, propertyId, category: 'HVAC' },
      select: { id: true, name: true, condition: true, installedOn: true, updatedAt: true },
    });
    if (!focusedItem) {
      return {
        status: 'READY_WITH_LIMITATIONS',
        reasonCode: 'HVAC_DECISION_ITEM_UNAVAILABLE',
        blocks: [{
          type: 'EMPTY_STATE',
          id: 'hvac-decision-item-unavailable',
          title: 'The decision’s HVAC record is unavailable',
          body: 'Ask found the selected decision but could not resolve its recorded HVAC system. It will not continue against a different item.',
          actions: [],
        }],
        suggestions: [],
      };
    }
    const { thread, change, triggerReasonCodes } = await decisionThreadService.continueHvacDecisionThread(focusedThread.id, propertyId, executionId);
    const blocks: AskPresentationBlock[] = [decisionProgressBlock('hvac-decision-progress', `Repair or replace: ${focusedItem.name}`, thread, thread.currentRecommendationSnapshot, [])];
    if (change && thread.currentRecommendationSnapshot) {
      blocks.push(whyNowBlock('hvac-decision-why-now', thread.currentRecommendationSnapshot, triggerReasonCodes));
      blocks.push(recommendationChangeBlock('hvac-decision-change', thread.id, change));
    }
    blocks.push(...await hvacDecisionDisclosureBlocks('hvac-decision', thread.currentRecommendationSnapshot, focusedItem));
    return {
      status: 'ANSWERED',
      reasonCode: 'HVAC_DECISION_RESUMED',
      parameters: { focusedDecisionThreadId: focusedThread.id },
      blocks,
      suggestions: ['Compare a new quote for this decision', 'Abandon this decision'],
    };
  }
  const { items, item } = await findHvacItemForMessage(propertyId, message);
  if (!item) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'HVAC_DECISION_ITEM_REQUIRED',
      ...durableFreeTextClarification('HVAC_DECISION_CONTINUE', 'Which HVAC decision should Ask resume?'),
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-decision-continue-empty', title: 'No matching HVAC decision found', body: 'Name the HVAC system exactly as recorded, or start a new decision.', actions: [] }],
      suggestions: items.slice(0, 3).map((candidate) => `What's the status of my ${candidate.name} decision?`),
    };
  }
  const selection = await decisionThreadService.selectHvacDecisionThread(propertyId, item.id);
  if (selection.kind === 'NONE') {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'HVAC_DECISION_NOT_STARTED',
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-decision-none', title: 'No active decision for this system yet', body: `Ask has not started a repair-or-replace decision for ${item.name}.`, actions: [{ id: 'open-inventory', label: 'Open inventory', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/inventory`, style: 'PRIMARY' }] }],
      suggestions: [`Should I repair or replace my ${item.name}?`],
    };
  }
  if (selection.kind === 'AMBIGUOUS') {
    return hvacDecisionThreadAmbiguousResult('HVAC_DECISION_CONTINUE', selection.candidates);
  }
  const { thread, change, triggerReasonCodes } = await decisionThreadService.continueHvacDecisionThread(selection.thread.id, propertyId, executionId);
  const blocks: AskPresentationBlock[] = [decisionProgressBlock('hvac-decision-progress', `Repair or replace: ${item.name}`, thread, thread.currentRecommendationSnapshot, [])];
  if (change && thread.currentRecommendationSnapshot) {
    blocks.push(whyNowBlock('hvac-decision-why-now', thread.currentRecommendationSnapshot, triggerReasonCodes));
    blocks.push(recommendationChangeBlock('hvac-decision-change', thread.id, change));
  }
  blocks.push(...await hvacDecisionDisclosureBlocks('hvac-decision', thread.currentRecommendationSnapshot, item));
  return {
    status: 'ANSWERED', reasonCode: 'HVAC_DECISION_RESUMED',
    blocks,
    suggestions: ['Compare a new quote for this decision', 'Abandon this decision'],
  };
}

async function hvacDecisionScenarioResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const { item } = await findHvacItemForMessage(propertyId, message);
  if (!item) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'HVAC_DECISION_ITEM_REQUIRED',
      ...durableFreeTextClarification('HVAC_DECISION_SCENARIO', 'Which HVAC decision does this quote apply to?'),
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-scenario-item-required', title: 'Which HVAC system?', body: 'Name the HVAC system exactly as recorded.', actions: [] }],
      suggestions: [],
    };
  }
  const selection = await decisionThreadService.selectHvacDecisionThread(propertyId, item.id);
  if (selection.kind === 'AMBIGUOUS') return hvacDecisionThreadAmbiguousResult('HVAC_DECISION_SCENARIO', selection.candidates);
  if (selection.kind !== 'UNIQUE') {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'HVAC_DECISION_NOT_STARTED',
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-scenario-no-thread', title: 'No active decision to compare against', body: `Start a repair-or-replace decision for ${item.name} first.`, actions: [] }],
      suggestions: [`Should I repair or replace my ${item.name}?`],
    };
  }

  const amountMatch = message.match(/\$\s*([\d][\d,]*(?:\.\d{2})?)/) ?? message.match(/([\d][\d,]*(?:\.\d{2})?)\s*dollars/i);
  const vendorMatch = message.match(/from\s+([A-Z][\w&' -]{1,60})/);
  if (!amountMatch) {
    // Not a captureRequests/inline-capture flow: submitAskCapture (this
    // file) only resumes a fixed allowlist of operationIds, and a scenario
    // quote amount isn't a canonical-record patch like the capture flows in
    // that allowlist -- it's a one-time input for this evaluation only. The
    // free-text clarification path (already proven for "which item" above)
    // re-resolves and re-executes this same operation with the answer, so
    // reuse it instead of a capture form with no working submission path.
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'HVAC_DECISION_SCENARIO_QUOTE_REQUIRED',
      ...durableFreeTextClarification('HVAC_DECISION_SCENARIO', 'What was the quoted replacement amount, and from which vendor?'),
      blocks: [{ type: 'SUMMARY', id: 'hvac-scenario-quote-required', title: 'What was the quote amount?', body: 'Ask needs the quoted amount to compare this scenario against the current recommendation, e.g. "$8,500 from Acme HVAC". This is used only to evaluate a what-if scenario; it does not change the recorded decision until you review it.', tone: 'DEFAULT', actions: [] }],
      suggestions: [],
    };
  }
  const quoteAmountCents = Math.round(Number(amountMatch[1].replace(/,/g, '')) * 100);
  const vendorLabel = vendorMatch?.[1]?.trim() || 'the quoted vendor';

  const contextVersion = await hvacDecisionThreadVersionFingerprint(selection.thread.id);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HVAC_DECISION_SCENARIO_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { hvacDecisionScenario: { decisionThreadId: selection.thread.id, quoteAmountCents, vendorLabel }, hvacDecisionContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'hvac-scenario-review', title: `Compare a ${vendorLabel} quote?`, body: `Evaluate a $${(quoteAmountCents / 100).toFixed(2)} quote from ${vendorLabel} against the current recommendation. This does not change the recorded decision.`, tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `hvac-decision-scenario-${selection.thread.id}-1`, version: 1, title: `Compare this ${vendorLabel} quote?`,
      description: 'Ask will run the registered HVAC engine against this quote as an isolated scenario. It never overwrites the recorded decision.',
      fields: [{ label: 'Vendor', value: vendorLabel }, { label: 'Amount', value: `$${(quoteAmountCents / 100).toFixed(2)}` }],
      editableFields: [], confirmLabel: 'Compare scenario', consentText: 'I authorize evaluating this scenario against the recorded decision.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function hvacDecisionAbandonResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const { item } = await findHvacItemForMessage(propertyId, message);
  if (!item) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'HVAC_DECISION_ITEM_REQUIRED',
      ...durableFreeTextClarification('HVAC_DECISION_ABANDON', 'Which HVAC decision should Ask abandon?'),
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-abandon-item-required', title: 'Which HVAC system?', body: 'Name the HVAC system exactly as recorded.', actions: [] }],
      suggestions: [],
    };
  }
  const selection = await decisionThreadService.selectHvacDecisionThread(propertyId, item.id);
  if (selection.kind === 'AMBIGUOUS') return hvacDecisionThreadAmbiguousResult('HVAC_DECISION_ABANDON', selection.candidates);
  if (selection.kind !== 'UNIQUE') {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'HVAC_DECISION_NOT_STARTED',
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-abandon-no-thread', title: 'No active decision to abandon', body: `There is no active repair-or-replace decision for ${item.name}.`, actions: [] }],
      suggestions: [],
    };
  }

  const contextVersion = await hvacDecisionThreadVersionFingerprint(selection.thread.id);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HVAC_DECISION_ABANDON_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { hvacDecisionAbandon: { decisionThreadId: selection.thread.id }, hvacDecisionContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'hvac-abandon-review', title: `Abandon the decision for ${item.name}?`, body: 'The decision thread and its history remain visible but no longer active. This does not change the item record.', tone: 'CAUTION', actions: [] }],
    confirmation: {
      confirmationId: `hvac-decision-abandon-${selection.thread.id}-1`, version: 1, title: 'Abandon this decision?',
      description: 'You can start a new decision for this system at any time.',
      fields: [{ label: 'System', value: item.name }],
      editableFields: [], confirmLabel: 'Abandon decision', consentText: 'I authorize abandoning this decision thread.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

// Ask Intelligence FRD Phase 10A (§19.2's fourth allowed source: "an
// explicit homeowner report marked REPORTED, not VERIFIED"). Recording an
// outcome never derives verificationStatus from the message -- see
// outcomeObservationService.recordHomeownerReportedOutcome, which always
// writes REPORTED regardless of what this function parses.
async function hvacDecisionOutcomeReportResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const { item } = await findHvacItemForMessage(propertyId, message);
  if (!item) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'HVAC_DECISION_ITEM_REQUIRED',
      ...durableFreeTextClarification('HVAC_DECISION_OUTCOME_REPORT', 'Which HVAC decision does this outcome apply to?'),
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-outcome-report-item-required', title: 'Which HVAC system?', body: 'Name the HVAC system exactly as recorded.', actions: [] }],
      suggestions: [],
    };
  }
  const selection = await decisionThreadService.selectHvacDecisionThread(propertyId, item.id);
  if (selection.kind === 'AMBIGUOUS') return hvacDecisionThreadAmbiguousResult('HVAC_DECISION_OUTCOME_REPORT', selection.candidates);
  if (selection.kind !== 'UNIQUE') {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'HVAC_DECISION_NOT_STARTED',
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-outcome-report-no-thread', title: 'No active decision to record an outcome for', body: `Start a repair-or-replace decision for ${item.name} first.`, actions: [] }],
      suggestions: [`Should I repair or replace my ${item.name}?`],
    };
  }

  const actionState: outcomeObservationService.ReportedOutcomeActionState =
    /\bstarted\b/i.test(message) && !/\b(?:completed|finished|done|already)\b/i.test(message) ? 'STARTED' : 'COMPLETED';
  const amountMatch = message.match(/\$\s*([\d][\d,]*(?:\.\d{2})?)/) ?? message.match(/([\d][\d,]*(?:\.\d{2})?)\s*dollars/i);
  const costCents = amountMatch ? Math.round(Number(amountMatch[1].replace(/,/g, '')) * 100) : null;

  const contextVersion = await hvacDecisionThreadVersionFingerprint(selection.thread.id);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const actionLabel = actionState === 'COMPLETED' ? 'completed' : 'started';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HVAC_DECISION_OUTCOME_REPORT_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      hvacDecisionOutcomeReport: { decisionThreadId: selection.thread.id, actionState, costCents, note: message.slice(0, 500) },
      hvacDecisionContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{
      type: 'SUMMARY', id: 'hvac-outcome-report-review', title: `Record that ${item.name} was ${actionLabel}?`,
      body: `This records a homeowner-reported outcome${costCents != null ? ` (${formatOutcomeCents(costCents)})` : ''}. It is marked as reported, not independently verified, and does not change the recorded recommendation.`,
      tone: 'DEFAULT', actions: [],
    }],
    confirmation: {
      confirmationId: `hvac-decision-outcome-report-${selection.thread.id}-1`, version: 1, title: `Record this outcome for ${item.name}?`,
      description: 'Ask records this as a homeowner-reported outcome. It is never automatically treated as verified, and it never changes the existing recommendation.',
      fields: [
        { label: 'System', value: item.name }, { label: 'Status', value: actionLabel },
        ...(costCents != null ? [{ label: 'Cost', value: formatOutcomeCents(costCents)! }] : []),
      ],
      editableFields: [], confirmLabel: 'Record outcome', consentText: 'I confirm this reported outcome is accurate to the best of my knowledge.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function hvacDecisionOutcomeViewResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const { item } = await findHvacItemForMessage(propertyId, message);
  if (!item) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'HVAC_DECISION_ITEM_REQUIRED',
      ...durableFreeTextClarification('HVAC_DECISION_OUTCOME_VIEW', 'Which HVAC decision do you want the outcome for?'),
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-outcome-view-item-required', title: 'Which HVAC system?', body: 'Name the HVAC system exactly as recorded.', actions: [] }],
      suggestions: [],
    };
  }
  const selection = await decisionThreadService.selectHvacDecisionThread(propertyId, item.id);
  if (selection.kind === 'AMBIGUOUS') return hvacDecisionThreadAmbiguousResult('HVAC_DECISION_OUTCOME_VIEW', selection.candidates);
  if (selection.kind !== 'UNIQUE') {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'HVAC_DECISION_NOT_STARTED',
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-outcome-view-no-thread', title: 'No active decision for this system yet', body: `Ask has not started a repair-or-replace decision for ${item.name}.`, actions: [] }],
      suggestions: [`Should I repair or replace my ${item.name}?`],
    };
  }
  const rows = await outcomeObservationService.getOutcomeSummaryForThread(selection.thread.id, propertyId);
  if (!rows.length) {
    return {
      status: 'ANSWERED', reasonCode: 'HVAC_DECISION_OUTCOME_NONE',
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-outcome-view-empty', title: 'No outcome recorded yet', body: `Once ${item.name} is repaired or replaced, tell Ask what happened to record the outcome.`, actions: [] }],
      suggestions: [`I replaced my ${item.name}`],
    };
  }
  const disputable = rows.some((row) => (['REPORTED', 'CORROBORATED', 'VERIFIED'] as string[]).includes(row.observation.verificationStatus));
  return {
    status: 'ANSWERED', reasonCode: 'HVAC_DECISION_OUTCOME_FOUND',
    blocks: [outcomeSummaryBlock('hvac-outcome-summary', selection.thread.id, rows)],
    suggestions: disputable ? [`That outcome is wrong for my ${item.name}`] : [],
  };
}

async function hvacDecisionOutcomeUnlinkResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const { item } = await findHvacItemForMessage(propertyId, message);
  if (!item) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'HVAC_DECISION_ITEM_REQUIRED',
      ...durableFreeTextClarification('HVAC_DECISION_OUTCOME_UNLINK', "Which HVAC decision's outcome should Ask dispute?"),
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-outcome-unlink-item-required', title: 'Which HVAC system?', body: 'Name the HVAC system exactly as recorded.', actions: [] }],
      suggestions: [],
    };
  }
  const selection = await decisionThreadService.selectHvacDecisionThread(propertyId, item.id);
  if (selection.kind === 'AMBIGUOUS') return hvacDecisionThreadAmbiguousResult('HVAC_DECISION_OUTCOME_UNLINK', selection.candidates);
  if (selection.kind !== 'UNIQUE') {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'HVAC_DECISION_NOT_STARTED',
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-outcome-unlink-no-thread', title: 'No active decision for this system', body: `There is no active decision for ${item.name}.`, actions: [] }],
      suggestions: [],
    };
  }
  const rows = await outcomeObservationService.getOutcomeSummaryForThread(selection.thread.id, propertyId);
  const disputable = rows.find((row) => (['REPORTED', 'CORROBORATED', 'VERIFIED'] as string[]).includes(row.observation.verificationStatus));
  if (!disputable) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'HVAC_DECISION_OUTCOME_NONE',
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-outcome-unlink-empty', title: 'No outcome to dispute', body: `There is no active reported outcome for ${item.name}.`, actions: [] }],
      suggestions: [],
    };
  }

  const contextVersion = await hvacDecisionThreadVersionFingerprint(selection.thread.id);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HVAC_DECISION_OUTCOME_UNLINK_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { hvacDecisionOutcomeUnlink: { decisionThreadId: selection.thread.id, outcomeObservationId: disputable.observation.id }, hvacDecisionContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'hvac-outcome-unlink-review', title: `Dispute this reported outcome for ${item.name}?`, body: 'This marks the recorded outcome as disputed. It does not change the recorded recommendation.', tone: 'CAUTION', actions: [] }],
    confirmation: {
      confirmationId: `hvac-decision-outcome-unlink-${disputable.observation.id}-1`, version: 1, title: 'Dispute this outcome?',
      description: 'The disputed outcome remains visible with its status changed; it is never permanently deleted.',
      fields: [{ label: 'System', value: item.name }],
      editableFields: [], confirmLabel: 'Dispute outcome', consentText: 'I confirm this reported outcome is incorrect.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

// Ask Intelligence FRD Phase 8B §11.3 capture experience. No contextVersion
// conflict check here (unlike the other HVAC commands): unlike a thread or
// an inventory item, there is no mutable external row this depends on
// between propose and confirm -- the value being saved is entirely the
// homeowner's own just-typed statement, captured in `parameters`. The one
// real dependency (an enabled household profile for OWNERSHIP_HORIZON) is
// checked live at confirm time and surfaced as a clear error, not silently
// bypassed (see HouseholdProfileNotEnabledError below).
async function hvacPreferenceSaveResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const ownership = decisionPreferenceService.parseOwnershipHorizonFromMessage(message);
  const approach = decisionPreferenceService.parseRepairReplaceApproachFromMessage(message);
  if (!ownership && !approach) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'HVAC_PREFERENCE_SAVE_DETAILS_REQUIRED',
      ...durableFreeTextClarification('HVAC_PREFERENCE_SAVE', 'What would you like Ask to save for future HVAC decisions?'),
      blocks: [{ type: 'SUMMARY', id: 'hvac-preference-save-details-required', title: 'What should Ask save?', body: 'Say something like "Save that we plan to sell in about 18 months" or "Remember I want to minimize upfront cost."', tone: 'DEFAULT', actions: [] }],
      suggestions: ['Save that we plan to sell in about 18 months', 'Remember I want to minimize long-term cost'],
    };
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const fields: { label: string; value: string }[] = [];
  if (ownership) fields.push({ label: 'Plan', value: `Sell in about ${ownership.horizonMonths} months` });
  if (approach) fields.push({ label: 'Approach', value: approach.approach.replace(/_/g, ' ').toLowerCase() });
  fields.push(
    { label: 'Who can see this', value: 'Household summary' },
    { label: 'Used for', value: 'HVAC repair/replace decisions' },
    { label: 'Expires', value: 'In 12 months, or when you update or forget it' },
  );

  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HVAC_PREFERENCE_SAVE_CONFIRMATION_REQUIRED',
    parameters: { hvacPreferenceSave: { ownership, approach }, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'hvac-preference-save-review', title: 'Save this for future HVAC decisions?', body: 'You can change or forget this at any time.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `hvac-preference-save-${propertyId}-1`, version: 1, title: 'Save this for future HVAC decisions?',
      description: 'Ask will reuse this confirmed preference for repair-vs-replace recommendations on this home until it expires or you change it.',
      fields,
      editableFields: [], confirmLabel: 'Save', consentText: 'I confirm this is accurate and authorize saving it for future HVAC decisions.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

async function hvacPreferenceForgetResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const preferences = await decisionPreferenceService.getActiveHvacPreferences(propertyId, userId);
  const active: { key: 'OWNERSHIP_HORIZON' | 'REPAIR_REPLACE_APPROACH'; preferenceValueId: string; label: string }[] = [];
  if (preferences.ownershipHorizonPreferenceId) {
    active.push({ key: 'OWNERSHIP_HORIZON', preferenceValueId: preferences.ownershipHorizonPreferenceId, label: `your plan to sell in about ${preferences.ownershipHorizonMonths} months` });
  }
  if (preferences.repairReplaceApproachPreferenceId) {
    active.push({ key: 'REPAIR_REPLACE_APPROACH', preferenceValueId: preferences.repairReplaceApproachPreferenceId, label: 'your repair/replace approach' });
  }

  if (!active.length) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'HVAC_PREFERENCE_NONE_ACTIVE',
      blocks: [{ type: 'EMPTY_STATE', id: 'hvac-preference-forget-none', title: 'Nothing to forget', body: 'No confirmed HVAC decision preference is currently saved.', actions: [] }],
      suggestions: [],
    };
  }

  let target = active[0];
  if (active.length > 1) {
    const mentionsApproach = /\bapproach\b/i.test(message);
    const mentionsOwnership = /\b(?:ownership|sell(?:ing)?)\b/i.test(message);
    const matched = active.find((candidate) => (candidate.key === 'REPAIR_REPLACE_APPROACH' && mentionsApproach) || (candidate.key === 'OWNERSHIP_HORIZON' && mentionsOwnership));
    if (!matched) {
      return {
        status: 'NEEDS_ENTITY', reasonCode: 'HVAC_PREFERENCE_FORGET_AMBIGUOUS',
        ...durableFreeTextClarification('HVAC_PREFERENCE_FORGET', 'Which saved preference should Ask forget — the ownership horizon or the repair/replace approach?'),
        blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'hvac-preference-forget-candidates', title: 'Saved preferences', description: 'Use the exact name in your next message.', sections: [{ id: 'preferences', title: 'Active', count: active.length, items: active.map((candidate) => ({ id: candidate.key, title: candidate.label, description: null, meta: [], status: null, href: null })) }], actions: [] }],
        suggestions: ['Forget my ownership horizon', 'Forget my repair/replace approach'],
      };
    }
    target = matched;
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HVAC_PREFERENCE_FORGET_CONFIRMATION_REQUIRED',
    parameters: { hvacPreferenceForget: { preferenceValueId: target.preferenceValueId }, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'hvac-preference-forget-review', title: `Forget ${target.label}?`, body: 'Ask will no longer use this for HVAC repair/replace recommendations. Any decision that used it will be recalculated.', tone: 'CAUTION', actions: [] }],
    confirmation: {
      confirmationId: `hvac-preference-forget-${target.preferenceValueId}-1`, version: 1, title: `Forget ${target.label}?`,
      description: 'This does not delete any decision history — it only stops this preference from being reused.',
      fields: [{ label: 'Preference', value: target.label }],
      editableFields: [], confirmLabel: 'Forget it', consentText: 'I authorize forgetting this preference.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

// C2C Intelligence & Agentic Evolution Phase 3 / PR 12b. Routes an Ask "help me
// decide / why / walk me through" question that references an already-delivered
// HVAC repair-or-replace Home Action to the bounded Phase 2 Specialist Agent
// runtime, sharing the AgentRun idempotency ledger and canonical DecisionThread
// with the in-app HomeActionDecisionDetail panel (§7.4). This adapter never
// ranks, never promotes, and never creates a Home Action or coverage record --
// it resolves exactly one already-ranked action from getHomeActionFeed() and
// hands it to invokeAgentRuntime. It surfaces only the bounded run-status
// projection + decisionThreadId, never raw AgentRun / AgentState rows.
const REQUESTING_AGENT_ID = 'ask.orchestrator.hvac-specialist-engage';

const RESTART_INTENT = /\b(?:start|restart|re[- ]?run|begin|kick off|redo)\b/i;

const RESUME_INTENT = /\b(?:resume|continue|pick up|carry on|keep going)\b/i;

function specialistHomeOperationsHref(propertyId: string, homeActionId?: string): string {
  const base = `/dashboard/properties/${encodeURIComponent(propertyId)}/home-operations`;
  return homeActionId ? `${base}?focusActionId=${encodeURIComponent(homeActionId)}` : base;
}

function currentSpecialistTurn(message: string): string {
  return message.split('Homeowner follow-up:').at(-1)?.trim() || message;
}

function parseSpecialistContextIntake(message: string, outstanding: AgentRunStatusProjection['outstanding']): Record<string, unknown> {
  const turn = currentSpecialistTurn(message);
  const requested = new Set(outstanding.filter((item) => item.kind === 'FACT').map((item) => item.key));
  const intake: Record<string, unknown> = {};
  if (requested.has('hvac.installDate')) {
    const year = /\b(19\d{2}|20\d{2})\b/.exec(turn)?.[1];
    if (year) intake['hvac.installDate'] = Number(year);
  }
  if (requested.has('hvac.condition')) {
    const condition = /\b(new|good|fair|poor|unknown)\b/i.exec(turn)?.[1];
    if (condition) intake['hvac.condition'] = condition.toUpperCase();
  }
  if (requested.has('hvac.replacementCost') && /\b(?:replacement|replace|cost|estimate|quote|price)\b|\$/i.test(turn)) {
    const amountMatch = /\$\s*([\d,]+(?:\.\d{1,2})?)|\b([\d,]+(?:\.\d{1,2})?)\s*(k|thousand)\b|\b(?:cost|estimate|quote|price)(?:\s+(?:is|was|about|around))?\s*([\d,]+(?:\.\d{1,2})?)/i.exec(turn);
    const raw = amountMatch?.[1] ?? amountMatch?.[2] ?? amountMatch?.[4];
    if (raw) {
      const parsed = Number(raw.replace(/,/g, '')) * (amountMatch?.[3] ? 1_000 : 1);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000) intake['hvac.replacementCost'] = parsed;
    }
  }
  return intake;
}

function parseSpecialistDispute(message: string): { key: string; note?: string } | null {
  const turn = currentSpecialistTurn(message);
  if (!/\b(?:wrong|incorrect|not right|dispute|challenge|do not agree|don't agree)\b/i.test(turn)) return null;
  const key = /\b(?:install|installed|installation|age|year)\b/i.test(turn)
    ? 'hvac.installDate'
    : /\bcondition\b/i.test(turn)
      ? 'hvac.condition'
      : /\b(?:replacement|replace|cost|estimate|price)\b/i.test(turn)
        ? 'hvac.replacementCost'
        : /\b(?:technician|assessment|quote|document|report)\b/i.test(turn)
          ? 'hvac.technicianAssessment'
          : null;
  return key ? { key, note: turn.slice(0, 500) } : null;
}

function specialistUnavailableRedirect(propertyId: string, reason: string): AskOperationResult {
  return {
    status: 'NOT_APPLICABLE',
    reasonCode: 'HVAC_SPECIALIST_NO_DELIVERED_ACTION',
    blocks: [{
      type: 'EMPTY_STATE',
      id: 'hvac-specialist-no-action',
      title: 'No flagged HVAC repair-or-replace action to work from',
      body: `${reason} Ask can start a durable repair-or-replace decision instead, or you can open Home Actions to engage a flagged one.`,
      actions: [{ id: 'open-home-actions', label: 'View Home Actions', href: specialistHomeOperationsHref(propertyId), style: 'PRIMARY' }],
    }],
    suggestions: ['Should I repair or replace my furnace?', 'What needs my attention?'],
  };
}

function specialistProjectionBlocks(
  headline: string,
  projection: AgentRunStatusProjection,
  correctionHref: string,
): AskPresentationBlock[] {
  const blocks: AskPresentationBlock[] = [];
  const verdictLabel = projection.verdict
    ? { REPAIR: 'Repair', REPLACE: 'Replace', MONITOR: 'Monitor' }[projection.verdict]
    : null;

  if (projection.phase === 'RECOMMENDATION_READY' && verdictLabel) {
    blocks.push({
      type: 'SUMMARY', id: 'hvac-specialist-recommendation', tone: 'DEFAULT',
      title: `Repair or replace: ${headline}`,
      body: `The HVAC Specialist's current recommendation is to ${verdictLabel.toLowerCase()}${projection.confidenceLabel ? ` (${projection.confidenceLabel.toLowerCase()} confidence)` : ''}. This continues the same decision thread as the in-app panel; no purchase or provider is selected.`,
      actions: [],
    });
    if (projection.explanation.length) {
      blocks.push({
        type: 'ASSUMPTIONS', id: 'hvac-specialist-explanation',
        title: 'Why the Specialist reached this',
        items: projection.explanation.map((claim) => claim.text).slice(0, 20),
      });
    }
  } else if (projection.phase === 'NEEDS_CONTEXT' || projection.phase === 'NEEDS_DOCUMENT') {
    blocks.push({
      type: 'SUMMARY', id: 'hvac-specialist-needs-input', tone: 'CAUTION',
      title: `The HVAC Specialist needs more information for ${headline}`,
      body: 'Reply in Ask with the requested fact, or open the Specialist panel to enter facts and upload supporting documents. The same canonical run will continue.',
      actions: [{ id: 'open-specialist-panel', label: 'Open Specialist panel', href: correctionHref, style: 'PRIMARY' }],
    });
    if (projection.outstanding.length) {
      blocks.push({
        type: 'GROUPED_LIST', filters: [], id: 'hvac-specialist-outstanding',
        title: 'Still needed', description: 'Correct these on the home record.',
        sections: [{
          id: 'outstanding', title: 'Outstanding items', count: projection.outstanding.length,
          items: projection.outstanding.map((item) => ({
            id: item.key, title: item.label, description: item.kind === 'DOCUMENT' ? 'Document' : 'Fact',
            meta: [], status: null, href: correctionHref,
          })),
        }],
        actions: [],
      });
    }
  } else if (projection.phase === 'ABSTAINED') {
    blocks.push({
      type: 'LIMITATION', id: 'hvac-specialist-abstained', severity: 'CAUTION',
      title: `The HVAC Specialist did not reach a recommendation for ${headline}`,
      body: `The bounded review stopped without a verdict${projection.abstentionReason ? ` (${projection.abstentionReason.replace(/_/g, ' ').toLowerCase()})` : ''}. The canonical decision thread is unchanged; open the in-app panel to continue.`,
    });
  } else {
    blocks.push({
      type: 'SUMMARY', id: 'hvac-specialist-working', tone: 'DEFAULT',
      title: `The HVAC Specialist is reviewing ${headline}`,
      body: 'The bounded review is still in progress. Check back shortly or open the in-app decision panel.',
      actions: [],
    });
  }
  return blocks;
}

export interface HvacSpecialistEngageDependencies {
  authorize: typeof ensurePropertyAccess;
  loadHomeActionFeed: typeof getHomeActionFeed;
  invokeRuntime: typeof invokeAgentRuntime;
}

const DEFAULT_HVAC_SPECIALIST_ENGAGE_DEPENDENCIES: HvacSpecialistEngageDependencies = {
  authorize: ensurePropertyAccess,
  loadHomeActionFeed: getHomeActionFeed,
  invokeRuntime: invokeAgentRuntime,
};

export async function hvacSpecialistEngageResult(
  userId: string,
  propertyId: string,
  message: string,
  executionId: string,
  launchContext?: CreateAskExecutionRequest['launchContext'],
  dependencies: HvacSpecialistEngageDependencies = DEFAULT_HVAC_SPECIALIST_ENGAGE_DEPENDENCIES,
): Promise<AskOperationResult> {
  await dependencies.authorize(userId, propertyId);

  let feed: Awaited<ReturnType<typeof getHomeActionFeed>>;
  try {
    feed = await dependencies.loadHomeActionFeed(propertyId, userId);
  } catch {
    return {
      status: 'UNAVAILABLE', reasonCode: 'HOME_ACTION_FEED_UNAVAILABLE',
      blocks: [{
        type: 'SUMMARY', id: 'hvac-specialist-feed-unavailable', tone: 'CAUTION',
        title: 'Home Actions are temporarily unavailable',
        body: 'Ask could not load the governed action feed needed to engage the HVAC Specialist. It will not substitute a raw recommendation.',
        actions: [{ id: 'open-home-actions', label: 'View Home Actions', href: specialistHomeOperationsHref(propertyId), style: 'PRIMARY' }],
      }],
      suggestions: ['Should I repair or replace my furnace?'],
    };
  }

  const hvacActions = feed.actions.filter((action) =>
    action.decisionLineage?.decisionDefinitionId === 'HVAC_REPAIR_REPLACE'
    && Boolean(action.decisionLineage.primaryEntityId));

  const focusedActionId = launchContext?.entityType === 'HOME_ACTION'
    ? launchContext.actionId ?? launchContext.entityId ?? null
    : null;

  let action = focusedActionId
    ? hvacActions.find((candidate) => candidate.id === focusedActionId) ?? null
    : null;
  if (!action) {
    if (focusedActionId) {
      return specialistUnavailableRedirect(propertyId, 'The referenced Home Action is not a currently delivered HVAC repair-or-replace action.');
    }
    if (hvacActions.length === 1) {
      action = hvacActions[0];
    } else if (hvacActions.length > 1) {
      const lower = message.toLowerCase();
      action = hvacActions.find((candidate) => {
        const name = candidate.presentation?.headline?.toLowerCase() ?? '';
        return name && lower.includes(name);
      }) ?? null;
      if (!action) {
        const generic = new Set(['about', 'action', 'decide', 'decision', 'flagged', 'help', 'home', 'hvac', 'item', 'one', 'recommendation', 'repair', 'replace', 'system', 'the', 'this', 'through', 'with']);
        const messageTokens = new Set(lower.split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !generic.has(token)));
        let best: { candidate: typeof hvacActions[number]; score: number } | null = null;
        let tied = false;
        for (const candidate of hvacActions) {
          const headline = (candidate.presentation?.headline ?? candidate.recommendedAction).toLowerCase();
          const tokens = new Set(headline.split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !generic.has(token)));
          const score = [...tokens].filter((token) => messageTokens.has(token)).length;
          if (!best || score > best.score) {
            best = { candidate, score };
            tied = false;
          } else if (score > 0 && score === best.score) {
            tied = true;
          }
        }
        if (best && best.score > 0 && !tied) action = best.candidate;
      }
      if (!action) {
        return {
          status: 'NEEDS_ENTITY', reasonCode: 'HVAC_SPECIALIST_ACTION_AMBIGUOUS',
          blocks: [{
            type: 'GROUPED_LIST', filters: [], id: 'hvac-specialist-action-candidates',
            title: 'Which HVAC decision do you mean?',
            description: 'More than one HVAC repair-or-replace action is on your Home feed. Name the system in your next message.',
            sections: [{
              id: 'candidates', title: 'Flagged HVAC actions', count: hvacActions.length,
              items: hvacActions.map((candidate) => ({
                id: candidate.id, title: candidate.presentation?.headline ?? candidate.recommendedAction,
                description: candidate.signal, meta: [], status: null,
                href: specialistHomeOperationsHref(propertyId, candidate.id),
              })),
            }],
            actions: [{ id: 'open-home-actions', label: 'Open Home Actions', href: specialistHomeOperationsHref(propertyId), style: 'SECONDARY' }],
          }],
          suggestions: hvacActions.slice(0, 5).map((candidate) => `Help me decide about ${candidate.presentation?.headline ?? candidate.recommendedAction} from my Home Actions`),
        };
      }
    } else {
      return specialistUnavailableRedirect(propertyId, 'No HVAC repair-or-replace action is on your Home feed right now.');
    }
  }

  const inventoryItemId = action.decisionLineage?.primaryEntityId;
  if (!inventoryItemId) {
    return specialistUnavailableRedirect(propertyId, 'The flagged HVAC action has no resolvable system record yet.');
  }
  const headline = action.presentation?.headline ?? action.recommendedAction;
  const origin: HvacSpecialistHomeActionOrigin = {
    homeActionId: action.id,
    lineageId: action.lineageId,
    sourceEntityId: action.source.entityId,
    sourceVersion: action.source.version,
    contextVersion: launchContext?.contextVersion ?? null,
    // Stable for retries of one Ask turn; a new homeowner engagement (new
    // execution) gets a new nonce. Matches the contract's stated semantics.
    engagementNonce: createHash('sha256').update(`ask-engage:${executionId}:${action.id}`).digest('hex').slice(0, 32),
  };

  const runOperation = async (): Promise<AskOperationResult> => {
    const status = await dependencies.invokeRuntime({
      operation: 'GET_STATUS',
      principalUserId: userId,
      propertyId,
      inventoryItemId,
      requestingAgentId: REQUESTING_AGENT_ID,
      homeActionOrigin: origin,
      askExecutionId: executionId,
    });

    const wantsRestart = RESTART_INTENT.test(currentSpecialistTurn(message));
    const wantsResume = RESUME_INTENT.test(message);
    const noRunYet = status.status.runId === null;
    const paused = status.status.paused;

    let projection = status.status;
    let mutated = false;

    const dispute = parseSpecialistDispute(message);
    const contextIntake = paused ? parseSpecialistContextIntake(message, status.status.outstanding) : {};

    if (dispute) {
      const advanced = await dependencies.invokeRuntime({
        operation: 'DISPUTE_INPUT',
        principalUserId: userId,
        propertyId,
        inventoryItemId,
        requestingAgentId: REQUESTING_AGENT_ID,
        homeActionOrigin: origin,
        askExecutionId: executionId,
        dispute,
        ...(paused && status.status.casVersion !== null ? { expectedCasVersion: status.status.casVersion } : {}),
      });
      projection = advanced.status;
      mutated = advanced.mutated;
    } else if (paused && Object.keys(contextIntake).length > 0 && status.status.casVersion !== null) {
      const advanced = await dependencies.invokeRuntime({
        operation: 'SUBMIT_CONTEXT',
        principalUserId: userId,
        propertyId,
        inventoryItemId,
        requestingAgentId: REQUESTING_AGENT_ID,
        homeActionOrigin: origin,
        askExecutionId: executionId,
        contextIntake,
        expectedCasVersion: status.status.casVersion,
      });
      projection = advanced.status;
      mutated = advanced.mutated;
    } else if (noRunYet || wantsRestart || (paused && wantsResume)) {
      const advanced = await dependencies.invokeRuntime({
        operation: 'START_OR_RESUME',
        principalUserId: userId,
        propertyId,
        inventoryItemId,
        requestingAgentId: REQUESTING_AGENT_ID,
        homeActionOrigin: origin,
        askExecutionId: executionId,
        ...(paused && status.status.casVersion !== null ? { expectedCasVersion: status.status.casVersion } : {}),
      });
      projection = advanced.status;
      mutated = advanced.mutated;
    }

    const blocks = specialistProjectionBlocks(headline, projection, specialistHomeOperationsHref(propertyId, action.id));
    const answered = projection.phase === 'RECOMMENDATION_READY';
    return {
      status: answered ? 'ANSWERED' : 'READY_WITH_LIMITATIONS',
      reasonCode: answered
        ? (mutated ? 'HVAC_SPECIALIST_RECOMMENDATION_READY' : 'HVAC_SPECIALIST_RECOMMENDATION_EXISTING')
        : `HVAC_SPECIALIST_${projection.phase}`,
      contextVersion: origin.contextVersion,
      parameters: projection.decisionThreadId ? { decisionThreadId: projection.decisionThreadId } : undefined,
      blocks,
      suggestions: projection.phase === 'RECOMMENDATION_READY'
        ? ['What changed about this decision?', 'Compare a new quote for this decision']
        : projection.phase === 'NEEDS_CONTEXT'
          ? ['My HVAC condition is good', 'It was installed in 2012', 'The replacement estimate is $8,000']
          : ['Open my Home Actions'],
    };
  };

  try {
    return await runOperation();
  } catch (error) {
    if (error instanceof AgentRuntimeAuthorizationError) {
      return specialistUnavailableRedirect(propertyId, 'The HVAC Specialist could not authorize this property.');
    }
    if (error instanceof AgentRuntimeDisabledError) {
      return {
        status: 'READY_WITH_LIMITATIONS', reasonCode: 'HVAC_SPECIALIST_DISABLED',
        blocks: [{
          type: 'LIMITATION', id: 'hvac-specialist-disabled', severity: 'INFO',
          title: 'The HVAC Specialist is not available right now',
          body: 'The bounded HVAC Specialist is currently turned off. The canonical repair-or-replace decision is still available from Home Actions or by starting a decision here.',
        }],
        suggestions: ['Should I repair or replace my furnace?'],
      };
    }
    if (error instanceof AgentRuntimeCasConflictError) {
      return {
        status: 'READY_WITH_LIMITATIONS', reasonCode: 'HVAC_SPECIALIST_STATE_CONFLICT',
        blocks: [{
          type: 'LIMITATION', id: 'hvac-specialist-conflict', severity: 'CAUTION',
          title: 'This HVAC decision was updated elsewhere',
          body: 'The Specialist run changed while Ask was reading it. Open the in-app decision panel to see the current state.',
        }],
        suggestions: ['Open my Home Actions'],
      };
    }
    if (error instanceof AgentRuntimeStateError) {
      return {
        status: 'READY_WITH_LIMITATIONS', reasonCode: 'HVAC_SPECIALIST_STATE_INVALID',
        blocks: [{
          type: 'LIMITATION', id: 'hvac-specialist-state', severity: 'CAUTION',
          title: 'The HVAC Specialist could not continue from here',
          body: error.message,
        }],
        suggestions: ['Open my Home Actions', 'Should I repair or replace my furnace?'],
      };
    }
    throw error;
  }
}

registerCapabilityHandler('decision-platform.hvac.start', async (envelope) => hvacDecisionStartResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.executionId));

// Passthrough category (FRD §16): receives the whole launchContext object
// rather than a derived field; confirmation is self-managed inside the
// specialist-agent runtime (implementation plan §4.7, resolved -- by
// design, not a gap).
registerCapabilityHandler('decision-platform.hvac.specialist-engage', async (envelope) => hvacSpecialistEngageResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.executionId, envelope.launchContext));

registerCapabilityHandler('decision-platform.hvac.continue', async (envelope) => hvacDecisionContinueResult(
  envelope.userId,
  envelope.propertyId!,
  envelope.message,
  envelope.executionId,
  envelope.launchContext?.entityType === 'DECISION_THREAD' ? envelope.launchContext.entityId : null,
));

registerCapabilityHandler('decision-platform.hvac.scenario', async (envelope) => hvacDecisionScenarioResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('decision-platform.hvac.abandon', async (envelope) => hvacDecisionAbandonResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('decision-platform.hvac.preference.save', async (envelope) => hvacPreferenceSaveResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('decision-platform.hvac.preference.forget', async (envelope) => hvacPreferenceForgetResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('decision-platform.hvac.outcome.report', async (envelope) => hvacDecisionOutcomeReportResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('decision-platform.hvac.outcome.view', async (envelope) => hvacDecisionOutcomeViewResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('decision-platform.hvac.outcome.unlink', async (envelope) => hvacDecisionOutcomeUnlinkResult(envelope.userId, envelope.propertyId!, envelope.message));
