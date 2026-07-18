// apps/backend/src/controllers/adminAccessCertification.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import {
  AdminAccessCertificationError,
  attestDecision,
  cancelCampaign,
  completeCampaign,
  getCampaignDetail,
  listCampaigns,
  openCampaign,
} from '../services/adminAccessCertification.service';

const CLIENT_ERROR_CODES = new Set([
  'CAMPAIGN_NOT_FOUND',
  'CAMPAIGN_ALREADY_OPEN',
  'CAMPAIGN_NOT_OPEN',
  'NO_ACTIVE_GRANTS',
  'DECISION_NOT_FOUND',
  'ALREADY_ATTESTED',
  'SELF_ATTESTATION_FORBIDDEN',
  'DECISIONS_PENDING',
]);

function handleClientError(err: unknown, res: Response): boolean {
  if (err instanceof AdminAccessCertificationError && CLIENT_ERROR_CODES.has(err.code)) {
    const status = err.code.endsWith('NOT_FOUND') ? 404 : 409;
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
    return true;
  }
  return false;
}

export async function listCampaignsHandler(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const campaigns = await listCampaigns();
    res.json({ success: true, data: campaigns });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-ACCESS-CERT] Failed to list campaigns');
    res.status(500).json({ success: false, error: { message: 'Failed to list campaigns' } });
  }
}

export async function getCampaignDetailHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const detail = await getCampaignDetail(req.params.campaignId);
    res.json({ success: true, data: detail });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-ACCESS-CERT] Failed to load campaign');
    res.status(500).json({ success: false, error: { message: 'Failed to load campaign' } });
  }
}

export async function openCampaignHandler(req: AuthRequest, res: Response): Promise<void> {
  const { name, dueAt } = req.body;
  try {
    const campaign = await openCampaign(
      { actorId: req.user!.userId, name, dueAt: dueAt ? new Date(dueAt) : undefined },
      { req }
    );
    res.status(201).json({ success: true, data: campaign });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-ACCESS-CERT] Failed to open campaign');
    res.status(500).json({ success: false, error: { message: 'Failed to open campaign' } });
  }
}

export async function attestDecisionHandler(req: AuthRequest, res: Response): Promise<void> {
  const { decision, reason } = req.body;
  try {
    const result = await attestDecision(
      { decisionId: req.params.decisionId, actorId: req.user!.userId, decision, reason },
      { req }
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-ACCESS-CERT] Failed to attest decision');
    res.status(500).json({ success: false, error: { message: 'Failed to attest decision' } });
  }
}

export async function completeCampaignHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await completeCampaign(
      { campaignId: req.params.campaignId, actorId: req.user!.userId, reason: req.body.reason },
      { req }
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-ACCESS-CERT] Failed to complete campaign');
    res.status(500).json({ success: false, error: { message: 'Failed to complete campaign' } });
  }
}

export async function cancelCampaignHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await cancelCampaign(
      { campaignId: req.params.campaignId, actorId: req.user!.userId, reason: req.body.reason },
      { req }
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-ACCESS-CERT] Failed to cancel campaign');
    res.status(500).json({ success: false, error: { message: 'Failed to cancel campaign' } });
  }
}
