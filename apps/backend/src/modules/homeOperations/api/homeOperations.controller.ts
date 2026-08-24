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
import { batchTransitionWorkItems } from '../application/batchTransitionWorkItems.usecase';
import { recordDuplicateDecision, reverseDuplicateDecision } from '../application/recordDuplicateDecision.usecase';
import { recordEvidence } from '../application/recordEvidence.usecase';
import { IllegalWorkItemTransitionError, InvalidClosureDispositionError } from '../domain/transitions';
import { assertUserWorkItemTransition, GovernedWorkItemTransitionError } from '../domain/userGovernance';
import { ListWorkItemsQuerySchema } from './homeOperations.validators';
import { prisma } from '../../../lib/prisma';
import { listPendingReconciliations } from '../infrastructure/reconciliationRepository';
import { retryHomeOperationsReconciliation } from '../../../services/homeOperationsReconciliation.service';
import { resolvePropertyAccess } from '../../../services/propertyAccess.service';
import { approveMaterialWorkItem, recordWorkEvent } from '../infrastructure/workItemRepository';
import { assertMaterialApprovalEvidenceSatisfiesPolicy, MaterialApprovalEvidencePolicyViolationError } from '../../../services/homeOperationsMaterialApprovalEvidence.service';
import { recordOperationalWorkOutcome } from '../../../services/decisionPlatform/outcomeObservationService';
import {
  completeAcceptedOperationalWorkItem,
  CompletionEvidencePolicyViolationError,
  UnsupportedWorkItemCompletionError,
} from '../../../services/homeActionCompletion.service';

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

export async function listReconciliationsHandler(req: CustomRequest, res: Response) {
  const context = homeOperationsContext(req, res);
  if (!context) return;
  const reconciliations = await listPendingReconciliations(context.propertyId);
  return res.json({ success: true, data: { reconciliations } });
}

export async function retryReconciliationHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const reconciliation = await retryHomeOperationsReconciliation(context.propertyId, req.params.reconciliationId);
    return res.json({ success: true, data: reconciliation });
  } catch (err) { next(err); }
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

async function isPropertyHouseholdUser(propertyId: string, userId: string | null): Promise<boolean> {
  if (!userId) return true;
  return Boolean(await resolvePropertyAccess(userId, propertyId));
}

function handleWorkItemMutationError(err: unknown, res: Response) {
  if (err instanceof IllegalWorkItemTransitionError) {
    return res.status(409).json({ success: false, error: { code: 'ILLEGAL_TRANSITION', message: err.message } });
  }
  if (err instanceof InvalidClosureDispositionError) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_CLOSURE_DISPOSITION', message: err.message } });
  }
  if (err instanceof GovernedWorkItemTransitionError) {
    return res.status(409).json({ success: false, error: { code: 'GOVERNED_TRANSITION_REQUIRED', message: err.message } });
  }
  if (err instanceof MaterialApprovalEvidencePolicyViolationError) {
    return res.status(409).json({ success: false, error: { code: 'EVIDENCE_POLICY_VIOLATION', message: err.message } });
  }
  throw err;
}

export async function assignOwnerHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;
    if (!(await isPropertyHouseholdUser(context.propertyId, req.body.ownerUserId))) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_HOUSEHOLD_MEMBER', message: 'The owner must belong to this property household.' } });
    }

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
    if (!(await isPropertyHouseholdUser(context.propertyId, req.body.userId))) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_HOUSEHOLD_MEMBER', message: 'The watcher must belong to this property household.' } });
    }

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
      assertUserWorkItemTransition(item, req.body.to, req.body.disposition);
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

export async function approveMaterialWorkHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;
    if (!item.materialApprovalRequired) {
      return res.status(409).json({ success: false, error: { code: 'APPROVAL_NOT_REQUIRED', message: 'This work does not require material approval.' } });
    }
    const evidence = await prisma.operationalWorkEvidence.findFirst({
      where: { id: req.body.evidenceId, workItemId: item.id },
    });
    if (!evidence) {
      return res.status(400).json({ success: false, error: { code: 'EVIDENCE_REQUIRED', message: 'Select evidence attached to this work item.' } });
    }
    // Home Intelligence Functional Completeness FRD Phase 4 review finding
    // 1 gap fix: consult the same consequence-based policy the quick-
    // complete path already enforces (HI-OUT-002) -- this was previously
    // the one completion path that never checked it, so REGULATED_COVERAGE
    // work accepted any evidence type and SAFETY_EMERGENCY's ad hoc
    // DOCUMENT/PROPERTY_FACT check never proved the evidence was tied to a
    // real domain record.
    try {
      await assertMaterialApprovalEvidenceSatisfiesPolicy(item, evidence);
    } catch (err) {
      return handleWorkItemMutationError(err, res);
    }
    await prisma.operationalWorkEvidence.update({
      where: { id: evidence.id },
      data: { verificationStatus: 'VERIFIED' },
    });
    await approveMaterialWorkItem(item.id, req.user!.userId);
    await recordWorkEvent({
      workItemId: item.id,
      eventType: 'WORK_APPROVED',
      actorType: 'USER',
      actorUserId: req.user!.userId,
      idempotencyKey: `material-approval:${item.id}:${evidence.id}`,
      payload: { evidenceId: evidence.id, decisionNote: req.body.decisionNote },
    });
    if (item.state === 'REPORTED_COMPLETE') {
      const verified = await transitionWorkItem({
        workItemId: item.id,
        to: 'VERIFIED',
        actorType: 'USER',
        actorUserId: req.user!.userId,
        idempotencyKey: `material-approved-verified:${item.id}:${evidence.id}`,
      });
      // HI-OUT-005/006: the quick-complete path already records an
      // OutcomeObservation on VERIFIED; this approval path -- the one
      // reserved for the highest-consequence work -- previously did not.
      await recordOperationalWorkOutcome({
        propertyId: verified.propertyId,
        workItemId: verified.id,
        userId: req.user!.userId,
        costCents: null,
        recommendationSnapshotId: null,
      });
    }
    return res.json({ success: true, data: await loadWorkItem(item.id) });
  } catch (err) { next(err); }
}

/**
 * Home Intelligence Functional Completeness FRD Phase 4 review finding 2
 * gap fix (HI-OUT-003): Fix's own richer completion flow. WorkItemManage
 * Drawer only ever offered evidence/approval controls and told the
 * homeowner completion was "controlled by the linked execution record" --
 * true for guidance/project/booking, but not for the highest-volume
 * maintenance-backed obligation, which had a real quick-complete path on
 * Home with no Fix equivalent. Reuses completeAcceptedOperationalWorkItem
 * directly (Home-Operations-native, not the Home Action feed's
 * executeHomeActionCommand) -- decisionLineage is null here, the same
 * conservative choice bookingWorkReconciliation/inspectionFinding.adapter
 * already make for completions with no live Home Action context.
 */
export async function completeWorkItemHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;

    try {
      const result = await completeAcceptedOperationalWorkItem({
        workItemId: item.id,
        propertyId: context.propertyId,
        userId: req.user!.userId,
        safetyTier: item.safetyTier,
        decisionLineage: null,
        costCents: req.body.costCents ?? null,
        observedResult: req.body.observedResult ?? null,
        completedAt: req.body.completedAt ?? null,
        fulfillmentMode: req.body.fulfillmentMode ?? null,
        providerName: req.body.providerName ?? null,
        notes: req.body.notes ?? null,
        followUpNeeded: req.body.followUpNeeded ?? false,
        photoDocumentIds: req.body.photoDocumentIds ?? [],
      });
      return res.json({ success: true, data: { ...(await loadWorkItem(item.id)), alreadyComplete: result.alreadyComplete } });
    } catch (err) {
      if (err instanceof CompletionEvidencePolicyViolationError) {
        return res.status(409).json({ success: false, error: { code: 'EVIDENCE_POLICY_VIOLATION', message: err.message } });
      }
      if (err instanceof UnsupportedWorkItemCompletionError) {
        return res.status(409).json({ success: false, error: { code: 'UNSUPPORTED_COMPLETION', message: err.message } });
      }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function batchTransitionWorkItemsHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;

    const dueFields: { dueWindowStart?: Date | null; dueAt?: Date | null; dueWindowEnd?: Date | null } = {};
    if ('dueWindowStart' in req.body) dueFields.dueWindowStart = req.body.dueWindowStart ? new Date(req.body.dueWindowStart) : null;
    if ('dueAt' in req.body) dueFields.dueAt = req.body.dueAt ? new Date(req.body.dueAt) : null;
    if ('dueWindowEnd' in req.body) dueFields.dueWindowEnd = req.body.dueWindowEnd ? new Date(req.body.dueWindowEnd) : null;

    const results = await batchTransitionWorkItems({
      propertyId: context.propertyId,
      workItemIds: req.body.workItemIds,
      actorUserId: req.user!.userId,
      ...dueFields,
    });
    return res.json({ success: true, data: { results } });
  } catch (err) { next(err); }
}

export async function recordDuplicateDecisionHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;
    if (req.body.supersededByWorkItemId === item.id) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_DUPLICATE_TARGET', message: 'A work item cannot supersede itself.' } });
    }
    const target = await loadWorkItem(req.body.supersededByWorkItemId);
    if (!target || target.propertyId !== context.propertyId) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'The duplicate target was not found for this property.' } });
    }

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

export async function reverseDuplicateDecisionHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;
    await reverseDuplicateDecision({ workItemId: item.id, actorUserId: req.user!.userId, idempotencyKey: crypto.randomUUID() });
    return res.json({ success: true, data: await loadWorkItem(item.id) });
  } catch (err) { next(err); }
}

export async function recordEvidenceHandler(req: CustomRequest, res: Response, next: (err: unknown) => void) {
  try {
    const context = homeOperationsContext(req, res);
    if (!context) return;
    const item = await loadWorkItemForMutation(req, res, context);
    if (!item) return;

    if (req.body.verificationStatus === 'VERIFIED' && item.safetyTier !== 'LOW_CONSEQUENCE') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'AUTHORITATIVE_VERIFICATION_REQUIRED',
          message: 'Material, regulated, and safety work must be verified by its authoritative execution domain.',
        },
      });
    }

    const evidenceExists = req.body.evidenceType === 'DOCUMENT'
      ? Boolean(await prisma.document.findFirst({ where: { id: req.body.evidenceEntityId, propertyId: context.propertyId }, select: { id: true } }))
      : req.body.evidenceType === 'HOME_EVENT'
        ? Boolean(await prisma.homeEvent.findFirst({ where: { id: req.body.evidenceEntityId, propertyId: context.propertyId }, select: { id: true } }))
        : req.body.evidenceType === 'PROPERTY_FACT'
          ? Boolean(await prisma.propertyFactEvidence.findFirst({ where: { id: req.body.evidenceEntityId, propertyId: context.propertyId }, select: { id: true } }))
          : true;
    if (!evidenceExists) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_EVIDENCE_REFERENCE', message: 'The evidence record does not belong to this property.' },
      });
    }

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
