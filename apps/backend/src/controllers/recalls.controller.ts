// apps/backend/src/controllers/recalls.controller.ts
import { Request, Response } from 'express';
import {
  confirmRecallMatch,
  dismissRecallMatch,
  listInventoryItemRecallMatches,
  listPropertyRecallMatches,
  resolveRecallMatch,
} from '../services/recalls.service';
import { RecallResolutionType } from '@prisma/client';

export async function listRecalls(req: Request, res: Response) {
  const { propertyId } = req.params as any;
  const rows = await listPropertyRecallMatches(propertyId);
  res.json({ propertyId, recallMatches: rows });
}

export async function confirmMatch(req: Request, res: Response) {
  const { matchId } = req.params as any;
  const row = await confirmRecallMatch(matchId);
  res.json(row);
}

export async function dismissMatch(req: Request, res: Response) {
  const { matchId } = req.params as any;
  const row = await dismissRecallMatch(matchId);
  res.json(row);
}

export async function resolveMatch(req: Request, res: Response) {
  const { matchId } = req.params as any;
  const { resolutionType, resolutionNotes } = req.body as {
    resolutionType: RecallResolutionType;
    resolutionNotes?: string;
  };

  const row = await resolveRecallMatch({
    matchId,
    resolutionType,
    resolutionNotes: resolutionNotes || null,
  });

  res.json(row);
}

export async function listInventoryItemRecalls(req: Request, res: Response) {
  const { propertyId, itemId } = req.params as any;
  const rows = await listInventoryItemRecallMatches(propertyId, itemId);
  res.json({ propertyId, itemId, recallMatches: rows });
}
