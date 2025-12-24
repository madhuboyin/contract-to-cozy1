// apps/backend/src/controllers/orchestration.controller.ts
import { Request, Response } from 'express';
import { getOrchestrationSummary } from '../services/orchestration.service';
import { AuthRequest } from '../types/auth.types';
import { recordOrchestrationEvent } from '../services/orchestrationEvent.service';
import { prisma } from '../lib/prisma';

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
  const { propertyId, actionKey } = req.body;
  const userId = req.user?.userId ?? null;

  if (!propertyId || !actionKey) {
    return res.status(400).json({ error: 'Missing propertyId or actionKey' });
  }

  await recordOrchestrationEvent({
    propertyId,
    actionKey,
    actionType: 'USER_MARKED_COMPLETE',
    source: 'USER',
    createdBy: userId,
  });

  return res.json({ success: true });
}

// POST /api/orchestration/actions/:actionKey/undo
// POST /api/orchestration/:propertyId/actions/:actionKey/undo
export async function undoOrchestrationAction(
  req: AuthRequest,
  res: Response
) {
  const { propertyId, actionKey } = req.params;
  const userId = req.user?.userId ?? null;

  if (!propertyId || !actionKey) {
    return res.status(400).json({ error: 'Missing propertyId or actionKey' });
  }

  await prisma.orchestrationActionEvent.deleteMany({
    where: {
      propertyId,
      actionKey,
      actionType: 'USER_MARKED_COMPLETE',
    },
  });

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
