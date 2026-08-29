// apps/backend/src/controllers/agentSpecialist.controller.ts
//
// §7.4: authenticated profile-selected Repair-or-Replace Specialist endpoint. Property authorization is
// enforced by propertyAuthMiddleware AND re-checked inside invokeAgentRuntime
// (defense in depth). The response is the bounded run-status projection plus
// the canonical decisionThreadId — never raw AgentRun / AgentState rows.

import { z } from 'zod';
import type { Response } from 'express';
import type { CustomRequest } from '../types';
import { logger } from '../lib/logger';
import {
  invokeAgentRuntime,
  AgentRuntimeAuthorizationError,
  AgentRuntimeCasConflictError,
  AgentRuntimeDisabledError,
  AgentRuntimeStateError,
} from '../services/agents/agentRuntime.service';
import { AGENT_RUNTIME_OPERATIONS, type AgentRuntimeOperation } from '../services/agents/agentRuntime.contract';

const bodySchema = z.object({
  inventoryItemId: z.string().min(1),
  contextIntake: z.record(z.string(), z.unknown()).optional(),
  dispute: z.object({ key: z.string().min(1), note: z.string().max(500).optional() }).optional(),
  expectedCasVersion: z.number().int().nonnegative().optional(),
  homeActionOrigin: z.object({
    homeActionId: z.string().min(1),
    lineageId: z.string().min(1),
    sourceEntityId: z.string().min(1),
    sourceVersion: z.string().nullable(),
    contextVersion: z.string().nullable(),
    engagementNonce: z.string().min(8).max(200),
  }).optional(),
  askExecutionId: z.string().min(1).optional(),
});

const REQUESTING_AGENT_ID = 'api.agent-specialist.controller';

export async function invokeHvacSpecialistHandler(req: CustomRequest, res: Response): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }
  const operation = String(req.params.operation).toUpperCase();
  if (!AGENT_RUNTIME_OPERATIONS.includes(operation as AgentRuntimeOperation)) {
    res.status(404).json({ success: false, message: `Unknown Specialist operation: ${req.params.operation}` });
    return;
  }
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Invalid Specialist request.', issues: parsed.error.flatten() });
    return;
  }

  try {
    const result = await invokeAgentRuntime({
      operation: operation as AgentRuntimeOperation,
      principalUserId: userId,
      propertyId: req.params.propertyId,
      inventoryItemId: parsed.data.inventoryItemId,
      requestingAgentId: REQUESTING_AGENT_ID,
      contextIntake: parsed.data.contextIntake,
      dispute: parsed.data.dispute,
      expectedCasVersion: parsed.data.expectedCasVersion,
      homeActionOrigin: parsed.data.homeActionOrigin,
      askExecutionId: parsed.data.askExecutionId,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AgentRuntimeAuthorizationError) {
      res.status(404).json({ success: false, message: 'Property not found or access denied.' });
      return;
    }
    if (error instanceof AgentRuntimeDisabledError) {
      res.status(503).json({ success: false, message: error.message, code: 'AGENT_DISABLED' });
      return;
    }
    if (error instanceof AgentRuntimeCasConflictError) {
      res.status(409).json({ success: false, message: error.message, code: 'AGENT_STATE_CONFLICT' });
      return;
    }
    if (error instanceof AgentRuntimeStateError) {
      res.status(422).json({ success: false, message: error.message, code: 'AGENT_STATE_INVALID' });
      return;
    }
    logger.error({ err: error }, '[AGENT-SPECIALIST] runtime invocation failed');
    res.status(500).json({ success: false, message: 'Repair-or-Replace Specialist request failed.' });
  }
}
