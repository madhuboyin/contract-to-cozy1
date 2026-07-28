import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import { savingsBenefitsAdminService } from '../services/savingsBenefitsAdmin.service';
import {
  SavingsBenefitsGovernanceError,
  getSavingsBenefitsEditorialQueues,
  transitionSavingsBenefitProgram,
} from '../services/savingsBenefitsGovernance.service';

function handleClientError(err: unknown, res: Response): boolean {
  if (err instanceof SavingsBenefitsGovernanceError) {
    const status = err.code.endsWith('NOT_FOUND') ? 404 : 409;
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
    return true;
  }
  if (err instanceof Error && /not found/i.test(err.message)) {
    res.status(404).json({ success: false, error: { message: err.message } });
    return true;
  }
  return false;
}

export async function listSources(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const sources = await savingsBenefitsAdminService.listSources();
    res.json({ success: true, data: { sources } });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to list sources');
    res.status(500).json({ success: false, error: { message: 'Failed to list sources' } });
  }
}

export async function getSource(req: AuthRequest, res: Response): Promise<void> {
  try {
    const source = await savingsBenefitsAdminService.getSource(req.params.sourceId);
    res.json({ success: true, data: { source } });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to load source');
    res.status(500).json({ success: false, error: { message: 'Failed to load source' } });
  }
}

export async function createSource(req: AuthRequest, res: Response): Promise<void> {
  try {
    const source = await savingsBenefitsAdminService.createSource(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: { source } });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to create source');
    res.status(500).json({ success: false, error: { message: 'Failed to create source' } });
  }
}

export async function updateSource(req: AuthRequest, res: Response): Promise<void> {
  try {
    const source = await savingsBenefitsAdminService.updateSource(req.params.sourceId, req.body, req.user!.userId);
    res.json({ success: true, data: { source } });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to update source');
    res.status(500).json({ success: false, error: { message: 'Failed to update source' } });
  }
}

export async function listPrograms(req: AuthRequest, res: Response): Promise<void> {
  try {
    const programs = await savingsBenefitsAdminService.listPrograms({
      sourceId: typeof req.query.sourceId === 'string' ? req.query.sourceId : undefined,
      reviewStatus: typeof req.query.reviewStatus === 'string' ? (req.query.reviewStatus as any) : undefined,
    });
    res.json({ success: true, data: { programs } });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to list programs');
    res.status(500).json({ success: false, error: { message: 'Failed to list programs' } });
  }
}

export async function getProgram(req: AuthRequest, res: Response): Promise<void> {
  try {
    const program = await savingsBenefitsAdminService.getProgram(req.params.programId);
    res.json({ success: true, data: { program } });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to load program');
    res.status(500).json({ success: false, error: { message: 'Failed to load program' } });
  }
}

export async function createProgram(req: AuthRequest, res: Response): Promise<void> {
  try {
    const program = await savingsBenefitsAdminService.createProgram(req.body);
    res.status(201).json({ success: true, data: { program } });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to create program');
    res.status(500).json({ success: false, error: { message: 'Failed to create program' } });
  }
}

export async function updateProgram(req: AuthRequest, res: Response): Promise<void> {
  try {
    const program = await savingsBenefitsAdminService.updateProgram(req.params.programId, req.body, req.user!.userId);
    res.json({ success: true, data: { program } });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to update program');
    res.status(500).json({ success: false, error: { message: 'Failed to update program' } });
  }
}

export async function listProgramVersionHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const versions = await savingsBenefitsAdminService.listProgramVersionHistory(req.params.programId);
    res.json({ success: true, data: { versions } });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to list program version history');
    res.status(500).json({ success: false, error: { message: 'Failed to list program version history' } });
  }
}

export function makeTransitionHandler(allowedActions: readonly string[]) {
  return async function transitionHandler(req: AuthRequest, res: Response): Promise<void> {
    const { action, reason } = req.body as { action: string; reason: string };

    if (!allowedActions.includes(action)) {
      res.status(403).json({
        success: false,
        error: { message: `Action "${action}" is not available on this endpoint.`, code: 'ACTION_NOT_ALLOWED' },
      });
      return;
    }

    try {
      const result = await transitionSavingsBenefitProgram(
        { programId: req.params.programId, actorId: req.user!.userId, action: action as any, reason },
        { req }
      );
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (handleClientError(err, res)) return;
      logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to transition program');
      res.status(500).json({ success: false, error: { message: 'Failed to transition program' } });
    }
  };
}

export async function getEditorialQueuesHandler(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const queues = await getSavingsBenefitsEditorialQueues();
    res.json({ success: true, data: queues });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to load editorial queues');
    res.status(500).json({ success: false, error: { message: 'Failed to load editorial queues' } });
  }
}
