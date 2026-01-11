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

function isNotFoundError(err: any) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('not found');
}

export async function listRecalls(req: Request, res: Response) {
  const { propertyId } = req.params as any;

  const rows = await listPropertyRecallMatches(propertyId);

  return res.json({
    propertyId,
    matches: rows,
  });
}

export async function confirmMatch(req: Request, res: Response) {
  const { propertyId, matchId } = req.params as any;

  try {
    const row = await confirmRecallMatch(propertyId, matchId);
    return res.json(row);
  } catch (err: any) {
    if (isNotFoundError(err)) return res.status(404).json({ message: 'Recall match not found' });
    console.error('confirmMatch error:', err);
    return res.status(500).json({ message: 'Failed to confirm recall match' });
  }
}

export async function dismissMatch(req: Request, res: Response) {
  const { propertyId, matchId } = req.params as any;

  try {
    const row = await dismissRecallMatch(propertyId, matchId);
    return res.json(row);
  } catch (err: any) {
    if (isNotFoundError(err)) return res.status(404).json({ message: 'Recall match not found' });
    console.error('dismissMatch error:', err);
    return res.status(500).json({ message: 'Failed to dismiss recall match' });
  }
}

export async function resolveMatch(req: Request, res: Response) {
  const { propertyId, matchId } = req.params as any;

  const { resolutionType, resolutionNotes } = req.body as {
    resolutionType: RecallResolutionType;
    resolutionNotes?: string;
  };

  if (!resolutionType) {
    return res.status(400).json({ message: 'resolutionType is required' });
  }

  try {
    const row = await resolveRecallMatch({
      propertyId,
      matchId,
      resolutionType,
      resolutionNotes: resolutionNotes || null,
    });

    return res.json(row);
  } catch (err: any) {
    if (isNotFoundError(err)) return res.status(404).json({ message: 'Recall match not found' });
    console.error('resolveMatch error:', err);
    return res.status(500).json({ message: 'Failed to resolve recall match' });
  }
}

export async function listInventoryItemRecalls(req: Request, res: Response) {
  const { propertyId } = req.params;

  // supports both routes:
  // /inventory/:inventoryItemId/recalls
  // /inventory/:itemId/recalls
  const itemId = (req.params as any).inventoryItemId ?? (req.params as any).itemId;

  if (!itemId) {
    return res.status(400).json({ message: 'inventoryItemId is required' });
  }

  const matches = await listInventoryItemRecallMatches(propertyId, itemId);

  return res.json({
    propertyId,
    inventoryItemId: itemId,
    matches,
  });
}
