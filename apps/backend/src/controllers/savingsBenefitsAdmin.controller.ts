import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import { savingsBenefitsAdminService } from '../services/savingsBenefitsAdmin.service';
import {
  SavingsBenefitsGovernanceError,
  getSavingsBenefitsEditorialQueues,
  transitionSavingsBenefitProgram,
} from '../services/savingsBenefitsGovernance.service';
import {
  listSavingsBenefitOutcomeVerificationQueue,
  verifySavingsBenefitOutcome,
} from '../services/savingsOutcome.service';
import {
  listSavingsBenefitPartnerComplaints,
  listSavingsBenefitHandoffs,
  listSavingsBenefitPartners,
  resolveSavingsBenefitPartnerComplaint,
  transitionSavingsBenefitHandoff,
  upsertSavingsBenefitPartner,
} from '../services/savingsBenefitsPartner.service';

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

function paginationFromQuery(req: AuthRequest) {
  const rawOffset = Number(req.query.offset ?? 0);
  const rawLimit = Number(req.query.limit ?? 50);
  return {
    offset: Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0,
    limit: Number.isSafeInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50,
  };
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
    const source = await savingsBenefitsAdminService.createSource(
      req.body,
      req.user!.userId,
      req,
    );
    res.status(201).json({ success: true, data: { source } });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to create source');
    res.status(500).json({ success: false, error: { message: 'Failed to create source' } });
  }
}

export async function updateSource(req: AuthRequest, res: Response): Promise<void> {
  try {
    const source = await savingsBenefitsAdminService.updateSource(
      req.params.sourceId,
      req.body,
      req.user!.userId,
      req,
    );
    res.json({ success: true, data: { source } });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to update source');
    res.status(500).json({ success: false, error: { message: 'Failed to update source' } });
  }
}

export async function reviewSource(req: AuthRequest, res: Response): Promise<void> {
  try {
    const source = await savingsBenefitsAdminService.reviewSource(
      req.params.sourceId,
      req.user!.userId,
      req.body.reason,
      req,
    );
    res.json({ success: true, data: { source } });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to review source');
    res.status(500).json({ success: false, error: { message: 'Failed to review source' } });
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
    const program = await savingsBenefitsAdminService.createProgram(
      req.body,
      req.user!.userId,
      req,
    );
    res.status(201).json({ success: true, data: { program } });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to create program');
    res.status(500).json({ success: false, error: { message: 'Failed to create program' } });
  }
}

export async function updateProgram(req: AuthRequest, res: Response): Promise<void> {
  try {
    const program = await savingsBenefitsAdminService.updateProgram(
      req.params.programId,
      req.body,
      req.user!.userId,
      req,
    );
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

export async function verifyOutcome(req: AuthRequest, res: Response): Promise<void> {
  try {
    const outcome = await verifySavingsBenefitOutcome(
      req.body.family,
      req.params.outcomeId,
      req.user!.userId,
      req.body.reason,
      req,
    );
    res.json({ success: true, data: { outcome } });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to verify outcome');
    res.status(409).json({ success: false, error: { message: err.message ?? 'Failed to verify outcome' } });
  }
}

export async function listOutcomeVerificationQueue(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = await listSavingsBenefitOutcomeVerificationQueue(paginationFromQuery(req));
    res.json({ success: true, data: page });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to list verification queue');
    res.status(500).json({ success: false, error: { message: 'Failed to list verification queue' } });
  }
}

export async function listPartners(_req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json({ success: true, data: { partners: await listSavingsBenefitPartners() } });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to list partners');
    res.status(500).json({ success: false, error: { message: 'Failed to list partners' } });
  }
}

export async function upsertPartner(req: AuthRequest, res: Response): Promise<void> {
  try {
    const partner = await upsertSavingsBenefitPartner(
      {
        ...req.body,
        id: req.params.partnerId,
        effectiveAt: new Date(req.body.effectiveAt),
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      },
      req.user!.userId,
      req,
    );
    res.json({ success: true, data: { partner } });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to upsert partner');
    res.status(409).json({ success: false, error: { message: err.message ?? 'Failed to save partner' } });
  }
}

export async function listPartnerHandoffs(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json({ success: true, data: await listSavingsBenefitHandoffs(paginationFromQuery(req)) });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to list partner handoffs');
    res.status(500).json({ success: false, error: { message: 'Failed to list partner handoffs' } });
  }
}

export async function transitionHandoff(req: AuthRequest, res: Response): Promise<void> {
  try {
    const action = await transitionSavingsBenefitHandoff(
      req.params.actionId,
      req.body.status,
      req.user!.userId,
      req.body.reason,
      req.body.deliveryReference,
      req,
    );
    res.json({ success: true, data: { action } });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to transition handoff');
    res.status(409).json({ success: false, error: { message: err.message ?? 'Failed to transition handoff' } });
  }
}

export async function listPartnerComplaints(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = await listSavingsBenefitPartnerComplaints(
      req.query.status as any,
      paginationFromQuery(req),
    );
    res.json({ success: true, data: page });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to list complaints');
    res.status(500).json({ success: false, error: { message: 'Failed to list complaints' } });
  }
}

export async function resolvePartnerComplaint(req: AuthRequest, res: Response): Promise<void> {
  try {
    const complaint = await resolveSavingsBenefitPartnerComplaint(
      req.params.complaintId,
      req.body.status,
      req.body.resolution,
      req.user!.userId,
      req,
    );
    res.json({ success: true, data: { complaint } });
  } catch (err: any) {
    logger.error({ err }, '[SAVINGS-BENEFITS-ADMIN] Failed to resolve complaint');
    res.status(409).json({ success: false, error: { message: err.message ?? 'Failed to resolve complaint' } });
  }
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
