// apps/backend/src/controllers/homeEvents.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { HomeEventsService } from '../services/homeEvents.service';

const service = new HomeEventsService();

export async function listHomeEvents(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;

    const events = await service.listHomeEvents(propertyId, {
      type: req.query.type ? String(req.query.type) : undefined,
      importance: req.query.importance ? String(req.query.importance) : undefined,
      roomId: req.query.roomId ? String(req.query.roomId) : undefined,
      inventoryItemId: req.query.inventoryItemId ? String(req.query.inventoryItemId) : undefined,
      claimId: req.query.claimId ? String(req.query.claimId) : undefined,
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });

    res.json({ success: true, data: { events } });
  } catch (err) {
    next(err);
  }
}

export async function getHomeEvent(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const eventId = req.params.eventId;
    const event = await service.getHomeEvent(propertyId, eventId);
    res.json({ success: true, data: { event } });
  } catch (err) {
    next(err);
  }
}

export async function createHomeEvent(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId ?? null;

    const event = await service.createHomeEvent({
      propertyId,
      userId,
      body: req.body,
    });

    res.status(201).json({ success: true, data: { event } });
  } catch (err) {
    next(err);
  }
}

export async function updateHomeEvent(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const eventId = req.params.eventId;

    const event = await service.updateHomeEvent(propertyId, eventId, req.body);
    res.json({ success: true, data: { event } });
  } catch (err) {
    next(err);
  }
}

export async function deleteHomeEvent(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const eventId = req.params.eventId;

    await service.deleteHomeEvent(propertyId, eventId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function attachHomeEventDocument(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const eventId = req.params.eventId;

    const homeownerProfileId = req.user?.homeownerProfile?.id ?? null;

    const link = await service.attachDocument({
      propertyId,
      eventId,
      documentId: String(req.body.documentId),
      kind: req.body.kind,
      caption: req.body.caption ?? null,
      sortOrder: req.body.sortOrder,
      homeownerProfileId,
    });

    res.status(201).json({ success: true, data: { link } });
  } catch (err) {
    next(err);
  }
}

export async function detachHomeEventDocument(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const eventId = req.params.eventId;
    const documentId = req.params.documentId;

    await service.detachDocument(propertyId, eventId, documentId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
