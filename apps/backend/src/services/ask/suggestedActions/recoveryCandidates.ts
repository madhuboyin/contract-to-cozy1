// Plan C.13 (Phase 4): typed recovery candidates for the branches that end a request without a normal result. Each builder returns
// [] unless it can name a precise, executable target; the finalizer then runs them in SAFE_RECOVERY_ONLY (the result status is a
// recovery status), so authorization, health, applicability, existence and freshness are all re-checked. Retryable failures are
// deliberately absent: the existing "Try again with current records" button (retryAskExecution) already covers them.
import { logger } from '../../../lib/logger';
import { askSuggestedActionsProducerFailuresTotal } from '../../../lib/metrics';
import { prisma } from '../../../lib/prisma';
import { visibleInventoryItemWhere } from '../../riskAssetApplicability';
import type { AskOperationResult } from '../askOperationRegistry';
import { DEFAULT_CANDIDATE_SIGNALS, type SuggestedNextActionCandidate } from './suggestedNextActionCandidate';
import { inventoryItemContextVersion } from './domainVersions';
import { finalizeSuggestedNextActions } from './finalizeSuggestedNextActions';
import { RESTART_AFTER_EXPIRY_LABELS } from './suggestedNextActionRegistry';

const RECOVERY_TRAITS = { recovery: true, promotional: false, continuesPending: false } as const;
const shorten = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

function launchContextOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * "Start <task> again" after an expired confirmation, clarification or pending request. Built only from what the server persisted:
 * the stored operation, message and property. Offered only for operations in the reviewed label registry, and only when the stored
 * launch context carries no entity or outcome (so the message alone recreates the request).
 */
export function restartAfterExpiryCandidates(source: {
  operationId: string | null; message: string; propertyId: string | null; launchContextJson: unknown;
}): SuggestedNextActionCandidate[] {
  const label = source.operationId ? RESTART_AFTER_EXPIRY_LABELS[source.operationId] : undefined;
  if (!source.operationId || !label || !source.propertyId) return [];
  const launch = launchContextOf(source.launchContextJson);
  if (launch.entityId || launch.entityType || launch.outcomeKey) return [];
  const message = source.message.trim();
  if (!message || message.length > 300) return [];
  return [{
    producerId: 'platform.restart-after-expiry', source: 'PLATFORM_STATE', sourceOperationId: source.operationId,
    label, message, operationId: source.operationId, interactionType: 'START_WORKFLOW', outcomeKey: 'RESTART_AFTER_EXPIRY',
    entityContext: { propertyId: source.propertyId, entityType: null, entityId: null, contextVersion: null },
    tier: 'CONTINUE', requiredFacts: [], reasonCodes: ['REQUEST_EXPIRED'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS, currentResultOwnership: true }, traits: { ...RECOVERY_TRAITS },
  }];
}

/** "Review current <item>" for an inventory item row the caller already holds (the stale-selection handler has the list loaded). */
export function reviewCurrentInventoryItemCandidate(
  item: { id: string; name: string; updatedAt: Date }, context: { propertyId: string; sourceOperationId: string | null },
): SuggestedNextActionCandidate[] {
  return [{
    producerId: 'platform.review-current-record', source: 'PLATFORM_STATE', sourceOperationId: context.sourceOperationId,
    label: `Review current ${shorten(item.name, 40)}`, message: `Show the current details of my ${shorten(item.name, 80)}.`,
    operationId: 'INVENTORY_LOOKUP', interactionType: 'CONVERSATION_CONTINUE', outcomeKey: 'REVIEW_CURRENT_RECORD',
    entityContext: {
      propertyId: context.propertyId, entityType: 'INVENTORY_ITEM', entityId: item.id,
      contextVersion: inventoryItemContextVersion({ id: item.id, updatedAt: item.updatedAt }),
    },
    tier: 'CONTINUE', requiredFacts: [], reasonCodes: ['RECORD_CHANGED'],
    signals: { ...DEFAULT_CANDIDATE_SIGNALS, exactEntityMatch: true, currentResultOwnership: true }, traits: { ...RECOVERY_TRAITS },
  }];
}

/**
 * Same chip after a confirmation conflict, where nothing is loaded yet: INVENTORY_LOOKUP is the only confirmed exact-entity read, so
 * this covers inventory items only; a missing (deleted) item yields no chip.
 */
export async function reviewCurrentInventoryItemCandidates(input: {
  propertyId: string | null; itemId: string | null | undefined; sourceOperationId: string | null;
}): Promise<SuggestedNextActionCandidate[]> {
  if (!input.propertyId || !input.itemId) return [];
  const item = await prisma.inventoryItem.findFirst({
    where: { id: input.itemId, propertyId: input.propertyId, ...visibleInventoryItemWhere() }, select: { id: true, name: true, updatedAt: true },
  });
  return item ? reviewCurrentInventoryItemCandidate(item, { propertyId: input.propertyId, sourceOperationId: input.sourceOperationId }) : [];
}

/**
 * Runs recovery candidates through the shared finalizer and returns the persisted ledger. `message` is passed empty on purpose:
 * a restart action intentionally repeats the stored message, which the "already asked" history rule would otherwise suppress.
 * Never throws: a failure means no chip, but it is logged and counted so it is distinguishable from an intentional no-chip decision.
 */
export async function finalizeRecoveryActions(input: {
  status: string; executionId: string; userId: string; sessionId: string; propertyId: string | null;
  operationId: string | null; candidates: () => Promise<SuggestedNextActionCandidate[]> | SuggestedNextActionCandidate[];
}): Promise<NonNullable<AskOperationResult['suggestedNextActions']>> {
  try {
    const candidates = await input.candidates();
    if (candidates.length === 0) return [];
    const result = await finalizeSuggestedNextActions({
      result: { status: input.status, blocks: [], suggestions: [], suggestedNextActionCandidates: candidates } as unknown as AskOperationResult,
      executionId: input.executionId, userId: input.userId, sessionId: input.sessionId, propertyId: input.propertyId,
      operationId: input.operationId, message: '', completedSemanticKeyHashes: new Set(),
    });
    return result.suggestedNextActions ?? [];
  } catch (error) {
    askSuggestedActionsProducerFailuresTotal.inc({ producer: 'platform.recovery', reason: 'ERROR' });
    logger.warn({ err: error, executionId: input.executionId, operationId: input.operationId }, '[ask-suggested-actions] recovery actions dropped');
    return [];
  }
}
