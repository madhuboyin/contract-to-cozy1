import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../types/auth.types';
import { CreateAskExecutionRequestSchema, SubmitAskCaptureRequestSchema, SubmitAskConfirmationSchema } from '../productFramework/ask/ask.contract';
import { cancelAskExecution, confirmAskExecution, createAskExecution, getAskSession, submitAskCapture } from '../services/ask/askOrchestrator.service';
import {
  PropertyContextCaptureValidationError,
  PropertyContextIdempotencyConflictError,
  PropertyContextVersionConflictError,
} from '../modules/propertyContext/application/captureFeatureContext';
import { getRefinanceRateMonitor, updateRefinanceRateMonitorStatus } from '../refinanceRadar/refinanceRateMonitor.service';
import { RefinanceRateMonitorStatus } from '@prisma/client';

export async function postAskExecution(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const parsed = CreateAskExecutionRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_REQUEST', message: 'The Ask request is invalid.', details: parsed.error.flatten() } });
    const execution = await createAskExecution(userId, parsed.data);
    return res.status(201).json({ success: true, data: execution });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === 'ASK_PROPERTY_NOT_FOUND' || code === 'ASK_SESSION_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Ask context was not found.' } });
    }
    return next(error);
  }
}

export async function postAskConfirmation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const input = SubmitAskConfirmationSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_CONFIRMATION', message: 'The confirmation is invalid.' } });
    return res.json({ success: true, data: await confirmAskExecution(userId, req.params.executionId, input.data) });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === 'ASK_EXECUTION_NOT_FOUND') return res.status(404).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Ask execution not found.' } });
    if (code === 'ASK_PERMISSION_REQUIRED') return res.status(403).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Owner permission is required.' } });
    if (code === 'ASK_CONTEXT_VERSION_CONFLICT') return res.status(409).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'The workflow context changed.' } });
    if (code === 'ASK_CONFIRMATION_EXPIRED' || code === 'ASK_CONFIRMATION_NOT_ACTIVE' || code === 'ASK_CONFIRMATION_IDEMPOTENCY_CONFLICT') return res.status(409).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Confirmation is unavailable.' } });
    return next(error);
  }
}

export async function postAskCancellation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    return res.json({ success: true, data: await cancelAskExecution(userId, req.params.executionId) });
  } catch (error) {
    return next(error);
  }
}

export async function patchAskMonitor(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const action = z.enum(['PAUSE', 'RESUME', 'STOP']).safeParse(req.body?.action);
    if (!action.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_MONITOR_ACTION', message: 'Invalid monitor action.' } });
    const status = action.data === 'PAUSE' ? RefinanceRateMonitorStatus.PAUSED : action.data === 'RESUME' ? RefinanceRateMonitorStatus.ACTIVE : RefinanceRateMonitorStatus.STOPPED;
    return res.json({ success: true, data: await updateRefinanceRateMonitorStatus(userId, req.params.monitorId, status) });
  } catch (error) {
    return next(error);
  }
}

export async function getAskMonitor(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    return res.json({ success: true, data: await getRefinanceRateMonitor(userId, req.params.monitorId) });
  } catch (error) {
    return next(error);
  }
}

export async function postAskCapture(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const executionId = z.string().trim().min(1).max(160).safeParse(req.params.executionId);
    const input = SubmitAskCaptureRequestSchema.safeParse(req.body);
    if (!executionId.success || !input.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_CAPTURE', message: 'The inline answer is invalid.' } });
    const execution = await submitAskCapture(userId, executionId.data, input.data);
    return res.status(200).json({ success: true, data: execution });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === 'ASK_EXECUTION_NOT_FOUND') return res.status(404).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Ask execution not found.' } });
    if (code === 'ASK_PERMISSION_REQUIRED') return res.status(403).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Owner permission is required.' } });
    if (code === 'ASK_CAPTURE_NOT_ACTIVE') return res.status(409).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Inline capture is no longer active.' } });
    if (code === 'ASK_CONTEXT_VERSION_CONFLICT') return res.status(409).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'The home record changed.' } });
    if (code === 'ASK_CAPTURE_IDEMPOTENCY_CONFLICT') return res.status(409).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'The inline answer was already submitted.' } });
    if (code === 'ASK_CAPTURE_CONFIRMATION_REQUIRED' || code === 'ASK_CAPTURE_VALIDATION_ERROR') return res.status(400).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'The inline answer is invalid.' } });
    if (error instanceof PropertyContextVersionConflictError || error instanceof PropertyContextIdempotencyConflictError) {
      return res.status(409).json({ success: false, error: { code: error.name, message: error.message } });
    }
    if (error instanceof PropertyContextCaptureValidationError) {
      return res.status(400).json({ success: false, error: { code: error.name, message: error.message } });
    }
    return next(error);
  }
}

export async function getAskSessionExecutions(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const sessionId = z.string().trim().min(1).max(160).safeParse(req.params.sessionId);
    if (!sessionId.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_REQUEST', message: 'Invalid Ask session.' } });
    const executions = await getAskSession(userId, sessionId.data);
    return res.status(200).json({ success: true, data: { executions } });
  } catch (error) {
    return next(error);
  }
}
