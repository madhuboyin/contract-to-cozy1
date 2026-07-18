// apps/backend/src/controllers/adminProviderOps.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import {
  AdminProviderOpsError,
  changeProviderStatus,
  getProviderDetail,
  GovernedProviderStatus,
  listProviders,
} from '../services/adminProviderOps.service';

function isProviderOpsError(err: unknown): err is AdminProviderOpsError {
  return err instanceof AdminProviderOpsError;
}

const CLIENT_ERROR_CODES = new Set(['PROVIDER_NOT_FOUND', 'SELF_ACTION_FORBIDDEN']);

function statusForCode(code: string): number {
  return code === 'PROVIDER_NOT_FOUND' ? 404 : 409;
}

export async function listProvidersHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { q, status, page, limit } = req.query as {
      q?: string;
      status?: string;
      page?: string;
      limit?: string;
    };
    const result = await listProviders({
      q,
      status: status as any,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-PROVIDER-OPS] Failed to list providers');
    res.status(500).json({ success: false, error: { message: 'Failed to list providers' } });
  }
}

export async function getProviderDetailHandler(req: AuthRequest, res: Response): Promise<void> {
  const { providerProfileId } = req.params;
  try {
    const detail = await getProviderDetail(providerProfileId);
    res.json({ success: true, data: detail });
  } catch (err: any) {
    if (isProviderOpsError(err) && CLIENT_ERROR_CODES.has(err.code)) {
      res.status(statusForCode(err.code)).json({ success: false, error: { message: err.message, code: err.code } });
      return;
    }
    logger.error({ err }, '[ADMIN-PROVIDER-OPS] Failed to load provider detail');
    res.status(500).json({ success: false, error: { message: 'Failed to load provider detail' } });
  }
}

export async function changeProviderStatusHandler(req: AuthRequest, res: Response): Promise<void> {
  const { providerProfileId } = req.params;
  const { status, reason } = req.body as { status: GovernedProviderStatus; reason: string };
  const actorId = req.user!.userId;

  try {
    const result = await changeProviderStatus({ providerProfileId, actorId, status, reason }, { req });
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (isProviderOpsError(err) && CLIENT_ERROR_CODES.has(err.code)) {
      res.status(statusForCode(err.code)).json({ success: false, error: { message: err.message, code: err.code } });
      return;
    }
    logger.error({ err }, '[ADMIN-PROVIDER-OPS] Failed to change provider status');
    res.status(500).json({ success: false, error: { message: 'Failed to change provider status' } });
  }
}
