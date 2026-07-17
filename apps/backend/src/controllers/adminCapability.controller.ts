// apps/backend/src/controllers/adminCapability.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import {
  ADMIN_CAPABILITIES,
  ADMIN_CAPABILITY_RISK,
  ADMIN_PERSONA_BUNDLES,
} from '../config/adminCapabilities';
import {
  AdminCapabilityError,
  grantBundle,
  grantCapability,
  listGrants,
  revokeCapability,
} from '../services/adminCapability.service';

export function getCapabilityCatalogHandler(_req: AuthRequest, res: Response): void {
  res.json({
    success: true,
    data: {
      capabilities: ADMIN_CAPABILITIES.map((capability) => ({
        capability,
        riskLevel: ADMIN_CAPABILITY_RISK[capability],
      })),
      bundles: ADMIN_PERSONA_BUNDLES,
    },
  });
}

export async function listUserGrantsHandler(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  try {
    const grants = await listGrants(userId);
    res.json({ success: true, data: grants });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-CAPABILITY] Failed to list grants');
    res.status(500).json({ success: false, error: { message: 'Failed to load capability grants' } });
  }
}

function isAdminCapabilityError(err: unknown): err is AdminCapabilityError {
  return err instanceof AdminCapabilityError;
}

const CLIENT_ERROR_CODES = new Set([
  'SELF_GRANT_FORBIDDEN',
  'UNKNOWN_CAPABILITY',
  'UNKNOWN_BUNDLE',
  'GRANT_NOT_FOUND',
]);

export async function grantUserCapabilityHandler(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  const { capability, bundleName, reason, resourceScope } = req.body;
  const grantedBy = req.user!.userId;

  try {
    const result = bundleName
      ? await grantBundle({ userId, bundleName, grantedBy, reason }, { req })
      : await grantCapability({ userId, capability, grantedBy, reason, resourceScope }, { req });
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (isAdminCapabilityError(err) && CLIENT_ERROR_CODES.has(err.code)) {
      res.status(409).json({ success: false, error: { message: err.message, code: err.code } });
      return;
    }
    logger.error({ err }, '[ADMIN-CAPABILITY] Failed to grant capability');
    res.status(500).json({ success: false, error: { message: 'Failed to grant capability' } });
  }
}

export async function revokeUserCapabilityHandler(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  const { capability, reason } = req.body;
  const revokedBy = req.user!.userId;

  try {
    const result = await revokeCapability({ userId, capability, revokedBy, reason }, { req });
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (isAdminCapabilityError(err) && CLIENT_ERROR_CODES.has(err.code)) {
      res.status(409).json({ success: false, error: { message: err.message, code: err.code } });
      return;
    }
    logger.error({ err }, '[ADMIN-CAPABILITY] Failed to revoke capability');
    res.status(500).json({ success: false, error: { message: 'Failed to revoke capability' } });
  }
}
