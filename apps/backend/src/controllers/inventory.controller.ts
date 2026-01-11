// apps/backend/src/controllers/inventory.controller.ts
import { Response, NextFunction } from 'express';
import { InventoryItemCategory } from '@prisma/client';
import { CustomRequest } from '../types';
import { InventoryService } from '../services/inventory.service';

const service = new InventoryService();

function parseBool(v: any): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'boolean') return v;
  return String(v) === 'true';
}

export async function listRooms(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const rooms = await service.listRooms(propertyId);
    res.json({ success: true, data: { rooms } });
  } catch (err) {
    next(err);
  }
}

export async function createRoom(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const room = await service.createRoom(propertyId, req.body);
    res.status(201).json({ success: true, data: { room } });
  } catch (err) {
    next(err);
  }
}

export async function updateRoom(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const roomId = req.params.roomId;
    const room = await service.updateRoom(propertyId, roomId, req.body);
    res.json({ success: true, data: { room } });
  } catch (err) {
    next(err);
  }
}

export async function deleteRoom(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const roomId = req.params.roomId;
    await service.deleteRoom(propertyId, roomId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listItems(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;

    const q = req.query.q ? String(req.query.q) : undefined;
    const roomId = req.query.roomId ? String(req.query.roomId) : undefined;

    const category =
      req.query.category && Object.values(InventoryItemCategory).includes(String(req.query.category) as any)
        ? (String(req.query.category) as InventoryItemCategory)
        : undefined;

    const hasDocuments = parseBool(req.query.hasDocuments);

    const items = await service.listItems(propertyId, { q, roomId, category, hasDocuments });
    res.json({ success: true, data: { items } });
  } catch (err) {
    next(err);
  }
}

export async function createItem(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const item = await service.createItem(propertyId, req.body);
    res.status(201).json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function getItem(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const itemId = req.params.itemId;
    const item = await service.getItem(propertyId, itemId);
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function updateItem(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const itemId = req.params.itemId;
    const item = await service.updateItem(propertyId, itemId, req.body);
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function deleteItem(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const itemId = req.params.itemId;
    await service.deleteItem(propertyId, itemId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function linkDocumentToItem(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const itemId = req.params.itemId;
    const documentId = String(req.body.documentId);

    const document = await service.linkDocument(propertyId, itemId, documentId);
    res.json({ success: true, data: { document } });
  } catch (err) {
    next(err);
  }
}

export async function unlinkDocumentFromItem(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const itemId = req.params.itemId;
    const documentId = req.params.documentId;

    await service.unlinkDocument(propertyId, itemId, documentId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listImportBatches(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const batches = await service.listImportBatches(propertyId);
    res.json({ success: true, data: { batches } });
  } catch (err) {
    next(err);
  }
}

export async function rollbackImportBatch(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const batchId = req.params.batchId;

    const result = await service.rollbackImportBatch(propertyId, batchId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
