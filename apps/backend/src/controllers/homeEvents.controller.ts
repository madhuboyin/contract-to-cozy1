// apps/backend/src/controllers/homeEvents.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { HomeEventsService } from '../services/homeEvents.service';
import { getPlanningContextEnvelope } from '../services/planningContext/context';

const service = new HomeEventsService();

export async function listHomeEvents(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const includeSignals = req.query.includeSignals === undefined
      ? undefined
      : String(req.query.includeSignals).toLowerCase() === 'true';

    const data = await service.listHomeEvents(propertyId, {
      type: req.query.type ? String(req.query.type) : undefined,
      importance: req.query.importance ? String(req.query.importance) : undefined,
      roomId: req.query.roomId ? String(req.query.roomId) : undefined,
      inventoryItemId: req.query.inventoryItemId ? String(req.query.inventoryItemId) : undefined,
      claimId: req.query.claimId ? String(req.query.claimId) : undefined,
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      includeSignals,
    });

    const context = await getPlanningContextEnvelope(
      propertyId,
      req.user!.userId,
      'TIMELINE',
    );

    res.json({ success: true, data: { ...data, context } });
  } catch (err) {
    next(err);
  }
}

export async function getHomeEvent(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const eventId = req.params.eventId;
    const event = await service.getHomeEvent(propertyId, eventId);
    const context = await getPlanningContextEnvelope(
      propertyId,
      req.user!.userId,
      'TIMELINE',
    );
    res.json({ success: true, data: { event, context } });
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

    const event = await service.updateHomeEvent(
      propertyId,
      eventId,
      req.body,
      req.user!.userId,
    );
    res.json({ success: true, data: { event } });
  } catch (err) {
    next(err);
  }
}

export async function deleteHomeEvent(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const eventId = req.params.eventId;

    await service.deleteHomeEvent({
      propertyId,
      eventId,
      userId: req.user!.userId,
      householdRole: req.householdRole,
      reason: req.body.reason,
    });
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
      userId: req.user?.userId ?? null,
    });

    res.status(201).json({ success: true, data: { link } });
  } catch (err) {
    next(err);
  }
}

export async function confirmHomeEvent(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const event = await service.confirmHomeEvent({
      propertyId: req.params.propertyId,
      eventId: req.params.eventId,
      userId: req.user!.userId,
      status: req.body.status,
      reason: req.body.reason,
    });
    res.json({ success: true, data: { event } });
  } catch (err) {
    next(err);
  }
}

export async function setHomeEventVisibility(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await service.setVisibility({
      propertyId: req.params.propertyId,
      eventId: req.params.eventId,
      visibility: req.body.visibility,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function addHomeEventEvidence(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const evidence = await service.addEvidence({
      propertyId: req.params.propertyId,
      eventId: req.params.eventId,
      userId: req.user!.userId,
      homeownerProfileId: req.user?.homeownerProfile?.id ?? null,
      ...req.body,
    });
    res.status(201).json({ success: true, data: { evidence } });
  } catch (err) {
    next(err);
  }
}

export async function exportHomeEvents(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const data = await service.exportSelectedEvents(
      req.params.propertyId,
      req.body.eventIds,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getHomeEventAnnualRecap(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const year = Number(req.query.year ?? new Date().getUTCFullYear());
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'year must be between 1900 and 2200.' },
      });
    }
    const data = await service.getAnnualRecap(req.params.propertyId, year);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
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
