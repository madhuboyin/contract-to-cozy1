import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../types/auth.types';
import { CreateAskExecutionRequestSchema, SubmitAskCaptureRequestSchema } from '../productFramework/ask/ask.contract';
import { createAskExecution, getAskSession, submitAskCapture } from '../services/ask/askOrchestrator.service';
import {
  PropertyContextCaptureValidationError,
  PropertyContextIdempotencyConflictError,
  PropertyContextVersionConflictError,
} from '../modules/propertyContext/application/captureFeatureContext';

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
