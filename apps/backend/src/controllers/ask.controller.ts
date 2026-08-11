import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../types/auth.types';
import { ContinueAskExecutionSchema, CreateAskExecutionRequestSchema, RecordAskCaptureEventSchema, RequestAskCorrectionSchema, ResolveAskExecutionPropertySchema, SubmitAskCaptureRequestSchema, SubmitAskClarificationSchema, SubmitAskConfirmationSchema, SubmitAskFeedbackSchema } from '../productFramework/ask/ask.contract';
import { cancelAskExecution, confirmAskExecution, continueAskExecution, createAskExecution, getAskExecution, getAskPendingWork, getAskSession, recordAskCaptureEvent, recordAskCaptureFailure, refreshAskExecutionAfterConflict, requestAskCorrection, resolveAskExecutionProperty, submitAskCapture, submitAskClarification, submitAskExecutionFeedback } from '../services/ask/askOrchestrator.service';
import { deleteAskSessionForUser } from '../services/ask/askRetention.service';
import {
  PropertyContextCaptureValidationError,
  PropertyContextIdempotencyConflictError,
  PropertyContextVersionConflictError,
} from '../modules/propertyContext/application/captureFeatureContext';
import { getRefinanceRateMonitor, updateRefinanceRateMonitorStatus } from '../refinanceRadar/refinanceRateMonitor.service';
import { RefinanceRateMonitorStatus } from '@prisma/client';

function sendAskDependencyError(res: Response, error: unknown): Response | null {
  const sourceCode = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
  if (sourceCode === 'AI_TIMEOUT') return res.status(503).json({ success: false, error: { code: 'ASK_DEPENDENCY_UNAVAILABLE', message: 'Ask timed out while contacting its guidance provider. Record-based operations remain available.' } });
  if (sourceCode === 'AI_CIRCUIT_OPEN' || sourceCode === 'AI_UPSTREAM_ERROR' || sourceCode === 'AI_EMPTY_RESPONSE') return res.status(503).json({ success: false, error: { code: 'ASK_MODEL_UNAVAILABLE', message: 'Generated guidance is temporarily unavailable. Record-based Ask operations remain available.' } });
  return null;
}

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
    const dependencyResponse = sendAskDependencyError(res, error);
    if (dependencyResponse) return dependencyResponse;
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
    if (code === 'ASK_PERMISSION_REQUIRED') return res.status(403).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Your household role cannot perform this action.' } });
    if (code === 'ASK_CONTEXT_VERSION_CONFLICT') return res.status(409).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'The workflow context changed.' } });
    if (code === 'ASK_CONFIRMATION_EXPIRED' || code === 'ASK_CONFIRMATION_NOT_ACTIVE' || code === 'ASK_CONFIRMATION_IDEMPOTENCY_CONFLICT' || code === 'ASK_CONFIRMATION_IN_PROGRESS') return res.status(409).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Confirmation is unavailable.' } });
    return next(error);
  }
}

export async function postAskClarification(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const input = SubmitAskClarificationSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_CLARIFICATION', message: 'The clarification is invalid.', details: input.error.flatten() } });
    return res.json({ success: true, data: await submitAskClarification(userId, req.params.executionId, input.data) });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === 'ASK_EXECUTION_NOT_FOUND') return res.status(404).json({ success: false, error: { code, message: 'Ask execution not found.' } });
    if (code === 'ASK_PERMISSION_REQUIRED') return res.status(403).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Your household role cannot access this home.' } });
    if (code?.startsWith('ASK_CLARIFICATION_')) return res.status(409).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Clarification is unavailable.' } });
    const dependencyResponse = sendAskDependencyError(res, error);
    if (dependencyResponse) return dependencyResponse;
    return next(error);
  }
}

export async function postAskExecutionProperty(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const input = ResolveAskExecutionPropertySchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_REQUEST', message: 'Select a home to continue.', details: input.error.flatten() } });
    return res.json({ success: true, data: await resolveAskExecutionProperty(userId, req.params.executionId, input.data) });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === 'ASK_EXECUTION_NOT_FOUND') return res.status(404).json({ success: false, error: { code, message: 'Ask execution not found.' } });
    if (code === 'ASK_PROPERTY_NOT_FOUND') return res.status(403).json({ success: false, error: { code: 'ASK_PERMISSION_REQUIRED', message: 'That home is not available for your account.' } });
    if (code === 'ASK_PROPERTY_SELECTION_NOT_ACTIVE') return res.status(409).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'This request no longer needs a home selection.' } });
    const dependencyResponse = sendAskDependencyError(res, error);
    if (dependencyResponse) return dependencyResponse;
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
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const executionId = z.string().trim().min(1).max(160).safeParse(req.params.executionId);
    const input = SubmitAskCaptureRequestSchema.safeParse(req.body);
    if (!executionId.success || !input.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_CAPTURE', message: 'The inline answer is invalid.' } });
    const execution = await submitAskCapture(userId, executionId.data, input.data);
    return res.status(200).json({ success: true, data: execution });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === 'ASK_EXECUTION_NOT_FOUND') return res.status(404).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Ask execution not found.' } });
    if (code === 'ASK_PERMISSION_REQUIRED') {
      await recordAskCaptureFailure(req.params.executionId, 'PERMISSION_DENIED');
      return res.status(403).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Your household role cannot perform this action.' } });
    }
    if (code === 'ASK_CAPTURE_NOT_ACTIVE') return res.status(409).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'Inline capture is no longer active.' } });
    if (code === 'ASK_CONTEXT_VERSION_CONFLICT') {
      await recordAskCaptureFailure(req.params.executionId, 'CONFLICT');
      const data = await refreshAskExecutionAfterConflict(userId, req.params.executionId);
      return res.status(409).json({ success: false, data, error: { code, message: error instanceof Error ? error.message : 'The home record changed.' } });
    }
    if (code === 'ASK_CAPTURE_IDEMPOTENCY_CONFLICT') return res.status(409).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'The inline answer was already submitted.' } });
    if (code === 'ASK_CAPTURE_CONFIRMATION_REQUIRED' || code === 'ASK_CAPTURE_VALIDATION_ERROR') return res.status(400).json({ success: false, error: { code, message: error instanceof Error ? error.message : 'The inline answer is invalid.' } });
    if (error instanceof PropertyContextVersionConflictError) {
      await recordAskCaptureFailure(req.params.executionId, 'CONFLICT');
      const data = await refreshAskExecutionAfterConflict(userId, req.params.executionId);
      return res.status(409).json({ success: false, data, error: { code: error.name, message: error.message } });
    }
    if (error instanceof PropertyContextIdempotencyConflictError) {
      return res.status(409).json({ success: false, error: { code: error.name, message: error.message } });
    }
    if (error instanceof PropertyContextCaptureValidationError) {
      return res.status(400).json({ success: false, error: { code: error.name, message: error.message } });
    }
    await recordAskCaptureFailure(req.params.executionId, 'RESUME_FAILED');
    const dependencyResponse = sendAskDependencyError(res, error);
    if (dependencyResponse) return dependencyResponse;
    return next(error);
  }
}

export async function postAskCaptureEvent(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const input = RecordAskCaptureEventSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_CAPTURE_EVENT', message: 'The capture event is invalid.' } });
    await recordAskCaptureEvent(userId, req.params.executionId, input.data);
    return res.status(204).send();
  } catch (error) {
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

export async function getAskExecutionById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    return res.status(200).json({ success: true, data: await getAskExecution(userId, req.params.executionId) });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === 'ASK_EXECUTION_NOT_FOUND') return res.status(404).json({ success: false, error: { code, message: 'Ask execution not found.' } });
    return next(error);
  }
}

export async function getAskPendingExecutions(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const propertyId = z.string().trim().min(1).max(160).optional().safeParse(req.query.propertyId);
    if (!propertyId.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_REQUEST', message: 'Invalid pending-work property scope.' } });
    return res.status(200).json({ success: true, data: { items: await getAskPendingWork(userId, propertyId.data ?? null) } });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === 'ASK_PROPERTY_NOT_FOUND') return res.status(404).json({ success: false, error: { code, message: 'Property not found or access was removed.' } });
    return next(error);
  }
}

export async function postAskContinuation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const input = ContinueAskExecutionSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_REQUEST', message: 'Invalid Ask continuation request.' } });
    return res.status(200).json({ success: true, data: await continueAskExecution(userId, req.params.executionId, input.data) });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === 'ASK_EXECUTION_NOT_FOUND') return res.status(404).json({ success: false, error: { code, message: 'Ask execution not found.' } });
    if (code === 'ASK_PROPERTY_NOT_FOUND') return res.status(403).json({ success: false, error: { code: 'ASK_PERMISSION_REQUIRED', message: 'Access to this home is no longer available.' } });
    return next(error);
  }
}

export async function postAskCorrection(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const input = RequestAskCorrectionSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_CORRECTION', message: 'The correction request is invalid.' } });
    return res.status(200).json({ success: true, data: await requestAskCorrection(userId, req.params.executionId, input.data) });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === 'ASK_EXECUTION_NOT_FOUND') return res.status(404).json({ success: false, error: { code, message: 'Ask execution not found.' } });
    return next(error);
  }
}

export async function postAskFeedback(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const input = SubmitAskFeedbackSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_FEEDBACK', message: 'Choose helpful or not helpful.' } });
    return res.status(200).json({ success: true, data: await submitAskExecutionFeedback(userId, req.params.executionId, input.data) });
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === 'ASK_EXECUTION_NOT_FOUND') return res.status(404).json({ success: false, error: { code, message: 'Ask execution not found.' } });
    return next(error);
  }
}

export async function deleteAskSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const sessionId = z.string().trim().min(1).max(160).safeParse(req.params.sessionId);
    if (!sessionId.success) return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_REQUEST', message: 'Invalid Ask session.' } });
    await deleteAskSessionForUser(userId, sessionId.data);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}
