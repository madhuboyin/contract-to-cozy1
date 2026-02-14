// apps/backend/src/controllers/orchestration.controller.ts

/**
 * PHASE 2 INTEGRATION NOTE:
 * ========================
 * 
 * Action Center task creation now routes to segment-specific services:
 * - HOME_BUYER → HomeBuyerTaskService.createTask()
 * - EXISTING_OWNER → PropertyMaintenanceTaskService.createFromActionCenter()
 * 
 * Integration happens in orchestration.service.ts when generating actions.
 * See: orchestrationIntegration.service.ts for routing logic.
 */

import { Request, Response } from 'express';
import { getOrchestrationSummary } from '../services/orchestration.service';
import { AuthRequest } from '../types/auth.types';
import { recordOrchestrationEvent } from '../services/orchestrationEvent.service';
import { snoozeAction, unsnoozeAction } from '../services/orchestrationSnooze.service';
import { prisma } from '../lib/prisma';
import { createCompletion } from '../services/orchestrationCompletion.service';
import { PropertyMaintenanceTaskService } from '../services/PropertyMaintenanceTask.service';
import { completionCreateSchema } from '../validators/orchestrationCompletion.validator';

/**
 * GET /api/orchestration/:propertyId/summary
 *
 * Purpose:
 * - Single authoritative orchestration endpoint
 * - Aggregates risk + checklist + coverage context
 * - Returns Phase-6 extended (non-breaking) summary
 *
 * Notes:
 * - Authorization is expected to be enforced by middleware (propertyAuth, auth, etc.)
 * - Controller remains intentionally thin
 */

export async function markOrchestrationActionCompleted(
  req: AuthRequest,
  res: Response
) {
  const { propertyId, actionKey, completionData } = req.body;
  const userId = req.user?.userId ?? null;

  if (!propertyId || !actionKey) {
    return res.status(400).json({ error: 'Missing propertyId or actionKey' });
  }

  // Validate completion data if provided
  if (completionData) {
    const validation = completionCreateSchema.safeParse(completionData);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid completion data', 
        details: validation.error.issues 
      });
    }
  }

  // Create the event
  const event = await recordOrchestrationEvent({
    propertyId,
    actionKey,
    actionType: 'USER_MARKED_COMPLETE',
    source: 'USER',
    createdBy: userId,
  });

  // If completion data provided, create completion record
  let completion = null;
  if (completionData && event) {
    completion = await createCompletion({
      propertyId,
      actionKey,
      eventId: event.id, // Link to the event
      data: completionData,
      userId,
    });
  }

  // Sync completion to linked PropertyMaintenanceTask (triggers seasonal checklist sync)
  try {
    const maintenanceTask = await prisma.propertyMaintenanceTask.findFirst({
      where: { propertyId, actionKey },
    });

    if (maintenanceTask && maintenanceTask.status !== 'COMPLETED' && userId) {
      await PropertyMaintenanceTaskService.updateTaskStatus(userId, maintenanceTask.id, 'COMPLETED');
      console.log(`[ORCHESTRATION] Synced completion to maintenance task ${maintenanceTask.id}`);
    }
  } catch (syncError: any) {
    console.warn('[ORCHESTRATION] Failed to sync completion to maintenance task:', syncError?.message);
  }

  return res.json({
    success: true,
    completion: completion ?? null,
  });
}

/**
 * POST /api/orchestration/:propertyId/actions/:actionKey/undo
 * 
 * Undoes a user's "mark as completed" action by:
 * 1. Deleting the USER_MARKED_COMPLETE event
 * 2. Recording a USER_UNMARKED_COMPLETE event for audit trail
 * 
 * This ensures:
 * - The action becomes active again
 * - Full audit trail is maintained
 * - Decision trace shows the restoration event
 */
export async function undoOrchestrationAction(
  req: AuthRequest,
  res: Response
) {
  const { propertyId, actionKey } = req.params;
  const userId = req.user?.userId ?? null;

  if (!propertyId || !actionKey) {
    return res.status(400).json({ error: 'Missing propertyId or actionKey' });
  }

  // Delete the mark-complete event
  await prisma.orchestrationActionEvent.deleteMany({
    where: {
      propertyId,
      actionKey,
      actionType: 'USER_MARKED_COMPLETE',
    },
  });

  // Record the undo event for audit trail and decision trace
  await recordOrchestrationEvent({
    propertyId,
    actionKey,
    actionType: 'USER_UNMARKED_COMPLETE',
    source: 'USER',
    createdBy: userId,
  });

  // Reverse sync: revert linked PropertyMaintenanceTask to IN_PROGRESS
  try {
    const maintenanceTask = await prisma.propertyMaintenanceTask.findFirst({
      where: { propertyId, actionKey },
    });

    if (maintenanceTask && maintenanceTask.status === 'COMPLETED' && userId) {
      await PropertyMaintenanceTaskService.updateTaskStatus(userId, maintenanceTask.id, 'IN_PROGRESS');
      console.log(`[ORCHESTRATION] Reverted maintenance task ${maintenanceTask.id} to IN_PROGRESS`);
    }
  } catch (syncError: any) {
    console.warn('[ORCHESTRATION] Failed to revert maintenance task:', syncError?.message);
  }

  return res.json({ success: true });
}


export async function getOrchestrationSummaryHandler(
  req: Request,
  res: Response
) {
  try {
    const { propertyId } = req.params;

    // -----------------------------
    // 1. Input Validation
    // -----------------------------
    if (!propertyId || typeof propertyId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'propertyId is required and must be a string',
      });
    }

    // -----------------------------
    // 2. Delegate to Orchestration
    // -----------------------------
    const summary = await getOrchestrationSummary(propertyId);

    // Defensive check (should never happen, but safe)
    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'No orchestration data available for this property',
      });
    }

    // -----------------------------
    // 3. Success Response
    // -----------------------------
    return res.status(200).json({
      success: true,
      data: summary,
    });

  } catch (error: any) {
    // -----------------------------
    // 4. Error Handling
    // -----------------------------
    console.error('[ORCHESTRATION_CONTROLLER] Failed to build summary:', {
      propertyId: req.params?.propertyId,
      error: error?.message || error,
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to build orchestration summary',
    });
  }
}

/**
 * POST /api/orchestration/:propertyId/actions/:actionKey/snooze
 * 
 * Snooze an action until a specific date
 */
export async function snoozeOrchestrationAction(
  req: AuthRequest,
  res: Response
) {
  const { propertyId, actionKey } = req.params;
  const { snoozeUntil, snoozeReason } = req.body;

  if (!propertyId || !actionKey) {
    return res.status(400).json({ error: 'Missing propertyId or actionKey' });
  }

  if (!snoozeUntil) {
    return res.status(400).json({ error: 'Missing snoozeUntil date' });
  }

  // Validate snoozeUntil is in the future
  const snoozeDate = new Date(snoozeUntil);
  if (snoozeDate <= new Date()) {
    return res.status(400).json({ error: 'Snooze date must be in the future' });
  }

  // Cap at 365 days
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 365);
  if (snoozeDate > maxDate) {
    return res.status(400).json({ error: 'Snooze period cannot exceed 365 days' });
  }

  await snoozeAction({
    propertyId,
    actionKey: decodeURIComponent(actionKey),
    snoozeUntil: snoozeDate,
    snoozeReason: snoozeReason || undefined,
  });

  return res.json({ success: true });
}

/**
 * POST /api/orchestration/:propertyId/actions/:actionKey/unsnooze
 * 
 * Un-snooze an action (bring back immediately)
 */
export async function unsnoozeOrchestrationAction(
  req: AuthRequest,
  res: Response
) {
  const { propertyId, actionKey } = req.params;

  if (!propertyId || !actionKey) {
    return res.status(400).json({ error: 'Missing propertyId or actionKey' });
  }

  await unsnoozeAction(propertyId, decodeURIComponent(actionKey));

  return res.json({ success: true });
}

/**
 * INTEGRATION INSTRUCTIONS FOR orchestration.service.ts
 * =====================================================
 * 
 * To complete Phase 2.3 integration, update orchestration.service.ts:
 * 
 * 1. Import the integration service:
 *    import { createTaskFromActionCenter } from './orchestrationIntegration.service';
 * 
 * 2. Find where checklist items are created (likely in a function that handles
 *    "Add to Checklist" action)
 * 
 * 3. Replace:
 *    await ChecklistService.createDirectChecklistItem(...)
 * 
 *    With:
 *    await createTaskFromActionCenter({
 *      userId,
 *      propertyId,
 *      title,
 *      description,
 *      assetType,
 *      priority,
 *      riskLevel,
 *      serviceCategory,
 *      estimatedCost,
 *      nextDueDate,
 *      actionKey,
 *    })
 * 
 * This automatically routes to:
 * - HomeBuyerTaskService for HOME_BUYER
 * - PropertyMaintenanceTaskService for EXISTING_OWNER
 * - ChecklistService as fallback (deprecated)
 */

export async function getOrchestrationDecisionTraceHandler(req: Request, res: Response) {
  try {
    const { propertyId, actionKey } = req.params;
    if (!propertyId || !actionKey) {
      return res.status(400).json({ success: false, message: 'Missing propertyId or actionKey' });
    }

    const decodedKey = decodeURIComponent(actionKey);

    const trace = await prisma.orchestrationDecisionTrace.findUnique({
      where: {
        propertyId_actionKey: {
          propertyId,
          actionKey: decodedKey,
        },
      },
    });

    return res.json({ success: true, data: trace });
  } catch (e: any) {
    console.error('[ORCHESTRATION] trace fetch failed:', e?.message || e);
    return res.status(500).json({ success: false, message: 'Failed to load decision trace' });
  }
}
