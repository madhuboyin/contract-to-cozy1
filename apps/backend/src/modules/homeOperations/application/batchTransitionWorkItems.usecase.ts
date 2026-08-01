import crypto from 'crypto';
import type { OperationalWorkItem } from '@prisma/client';
import { findWorkItemById } from '../infrastructure/workItemRepository';
import { transitionWorkItem } from './transitionWorkItem.usecase';
import { rescheduleWorkItem } from './rescheduleWorkItem.usecase';
import { IllegalWorkItemTransitionError, InvalidClosureDispositionError } from '../domain/transitions';

/**
 * Item #22 (Slice 8: "batch scheduling for low-risk routine work"). Not a
 * generic "batch transition to any state" usecase — v1 is scoped to one
 * well-defined action: bulk-accept a batch of CANDIDATE items, with an
 * optional shared due date applied to all of them. Composes the existing
 * transitionWorkItem/rescheduleWorkItem usecases per item rather than
 * introducing new domain logic.
 *
 * Per-item, not all-or-nothing: one item's illegal-transition failure must
 * never roll back another item's legitimate success, so this is a loop with
 * per-item error tolerance, not a single Prisma transaction across items.
 *
 * "Low-risk" (safetyTier === LOW_CONSEQUENCE) is enforced HERE, server-side
 * — never trust the caller to have only sent eligible ids. A client bug or
 * crafted request must not be able to bulk-accept a SAFETY_EMERGENCY or
 * REGULATED_COVERAGE item without individual review.
 */
export interface BatchTransitionWorkItemResult {
  workItemId: string;
  success: boolean;
  message?: string;
  item?: OperationalWorkItem;
}

export interface BatchTransitionWorkItemsInput {
  propertyId: string;
  workItemIds: string[];
  actorUserId: string;
  dueWindowStart?: Date | null;
  dueAt?: Date | null;
  dueWindowEnd?: Date | null;
}

export async function batchTransitionWorkItems(input: BatchTransitionWorkItemsInput): Promise<BatchTransitionWorkItemResult[]> {
  const hasDueFields = 'dueWindowStart' in input || 'dueAt' in input || 'dueWindowEnd' in input;
  const results: BatchTransitionWorkItemResult[] = [];

  for (const workItemId of input.workItemIds) {
    try {
      const existing = await findWorkItemById(workItemId);
      if (!existing || existing.propertyId !== input.propertyId) {
        results.push({ workItemId, success: false, message: 'Work item not found for this property.' });
        continue;
      }
      if (existing.safetyTier !== 'LOW_CONSEQUENCE') {
        results.push({ workItemId, success: false, message: 'Not eligible for batch scheduling — safetyTier must be LOW_CONSEQUENCE.' });
        continue;
      }
      if (existing.state !== 'CANDIDATE') {
        results.push({ workItemId, success: false, message: `Not eligible for batch scheduling — expected CANDIDATE, was ${existing.state}.` });
        continue;
      }

      let item = await transitionWorkItem({
        workItemId,
        to: 'ACCEPTED',
        actorType: 'USER',
        actorUserId: input.actorUserId,
        idempotencyKey: crypto.randomUUID(),
      });

      if (hasDueFields) {
        item = await rescheduleWorkItem({
          workItemId,
          dueWindowStart: input.dueWindowStart,
          dueAt: input.dueAt,
          dueWindowEnd: input.dueWindowEnd,
          actorUserId: input.actorUserId,
          idempotencyKey: crypto.randomUUID(),
        });
      }

      results.push({ workItemId, success: true, item });
    } catch (err) {
      if (err instanceof IllegalWorkItemTransitionError || err instanceof InvalidClosureDispositionError) {
        results.push({ workItemId, success: false, message: err.message });
        continue;
      }
      throw err;
    }
  }

  return results;
}
