import crypto from 'crypto';
import { Response } from 'express';
import { CustomRequest } from '../../../types';
import { listWorkItems } from '../application/listWorkItems.usecase';
import { getWorkItem as loadWorkItem } from '../application/getWorkItem.usecase';
import { assignWorkItemOwner } from '../application/assignOwner.usecase';
import { addWatcher, removeWatcher } from '../application/watchers.usecase';
import { transitionWorkItem } from '../application/transitionWorkItem.usecase';
import { snoozeWorkItem } from '../application/snoozeWorkItem.usecase';
import { rescheduleWorkItem } from '../application/rescheduleWorkItem.usecase';
import { recordDuplicateDecision } from '../application/recordDuplicateDecision.usecase';
import { recordEvidence } from '../application/recordEvidence.usecase';
import { IllegalWorkItemTransitionError, InvalidClosureDispositionError } from '../domain/transitions';
import { ListWorkItemsQuerySchema } from './homeOperations.validators';

function homeOperationsContext(req: CustomRequest, res: Response): { propertyId: string } | null {
  const propertyId = req.params.propertyId;
  if (!propertyId) {
    res.status(400).json({ success: false, error: { code: 'INVALID_CONTEXT', message: 'Property is required.' } });
    return null;
  }
  return { propertyId };
}

export async function listWorkItemsHandler(req: CustomRequest, res: Response) {
  const context = homeOperationsContext(req, res);
  if (!context) return;

  const query = ListWorkItemsQuerySchema.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_QUERY', message: 'Invalid query parameters.', details: query.error.flatten() } });
  }

  const items = await listWorkItems({ propertyId: context.propertyId, ...query.data });
  return res.json({ success: true, data: { items } });
}

export async function getWorkItemHandler(req: CustomRequest, res: Response) {
  const context = homeOperationsContext(req, res);
  if (!context) return;

  const workItemId = req.params.workItemId;
  const item = await loadWorkItem(workItemId);
  if (!item || item.propertyId !== context.propertyId) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Work item was not found for this property.' } });
  }
  return res.json({ success: true, data: item });
}

// ── Home Operations Slice 8: write API ──────────────────────────────────────

/**
 * Shared existence/ownership check every mutation handler below needs
 * before acting — never leaks cross-property existence (404, not 403, for a
 * work item that belongs to a different property).
 */
async function loadWorkItemForMutation(req: CustomRequest, res: Response, context: { propertyId: string }) {
  const item = await loadWorkItem(req.params.workItemId);
  if (!item || item.propertyId !== context.propertyId) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Work item was not found for this property.' } });
    return null;
  }
  return item;
}

function handleWorkItemMutationError(err: unknown, res: Response) {
  if (err instanceof IllegalWorkItemTransitionError) {
    return res.status(409).json({ success: false, error: { code: 'ILLEGAL_TRANSITION', message: err.message } });
  }
  if (err instanceof InvalidClosureDispositionError) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_CLOSURE_DISPOSITION', message: err.message } });
  }
  throw err;
}

export async function assignOwnerHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;

    await assignWorkItemOwner({
      workItemId: item.id,
      ownerUserId: req.body.ownerUserId,
      actorUserId: req.user!.userId,
      idempotencyKey: crypto.randomUUID(),
    });
    const updated = await loadWorkItem(item.id);
    return res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function addWatcherHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;

    await addWatcher({
      workItemId: item.id,
      userId: req.body.userId,
      addedByUserId: req.user!.userId,
      idempotencyKey: crypto.randomUUID(),
    });
    const updated = await loadWorkItem(item.id);
    return res.status(201).json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function removeWatcherHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;

    await removeWatcher({
      workItemId: item.id,
      userId: req.params.userId,
      actorUserId: req.user!.userId,
      idempotencyKey: crypto.randomUUID(),
    });
    const updated = await loadWorkItem(item.id);
    return res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function transitionWorkItemHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;

    try {
      await transitionWorkItem({
        workItemId: item.id,
        to: req.body.to,
        disposition: req.body.disposition,
        actorType: 'USER',
        actorUserId: req.user!.userId,
        idempotencyKey: crypto.randomUUID(),
        timestampValue: req.body.deferUntil ? new Date(req.body.deferUntil) : undefined,
      });
    } catch (err) {
      return handleWorkItemMutationError(err, res);
    }
    const updated = await loadWorkItem(item.id);
    return res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function snoozeWorkItemHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;

    await snoozeWorkItem({
      workItemId: item.id,
      snoozedUntil: req.body.snoozedUntil ? new Date(req.body.snoozedUntil) : null,
      actorUserId: req.user!.userId,
      idempotencyKey: crypto.randomUUID(),
    });
    const updated = await loadWorkItem(item.id);
    return res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function rescheduleWorkItemHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;

    const dueFields: { dueWindowStart?: Date | null; dueAt?: Date | null; dueWindowEnd?: Date | null } = {};
    if ('dueWindowStart' in req.body) dueFields.dueWindowStart = req.body.dueWindowStart ? new Date(req.body.dueWindowStart) : null;
    if ('dueAt' in req.body) dueFields.dueAt = req.body.dueAt ? new Date(req.body.dueAt) : null;
    if ('dueWindowEnd' in req.body) dueFields.dueWindowEnd = req.body.dueWindowEnd ? new Date(req.body.dueWindowEnd) : null;

    await rescheduleWorkItem({
      workItemId: item.id,
      ...dueFields,
      actorUserId: req.user!.userId,
      idempotencyKey: crypto.randomUUID(),
    });
    const updated = await loadWorkItem(item.id);
    return res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function recordDuplicateDecisionHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;

    await recordDuplicateDecision({
      workItemId: item.id,
      supersededByWorkItemId: req.body.supersededByWorkItemId,
      actorUserId: req.user!.userId,
      idempotencyKey: crypto.randomUUID(),
    });
    const updated = await loadWorkItem(item.id);
    return res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function recordEvidenceHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;

    await recordEvidence({
      workItemId: item.id,
      evidenceType: req.body.evidenceType,
      evidenceEntityId: req.body.evidenceEntityId,
      verificationStatus: req.body.verificationStatus,
      observedAt: req.body.observedAt ? new Date(req.body.observedAt) : new Date(),
      actorUserId: req.user!.userId,
      idempotencyKey: crypto.randomUUID(),
    });
    const updated = await loadWorkItem(item.id);
    return res.status(201).json({ success: true, data: updated });
  } catch (err) { next(err); }
}
