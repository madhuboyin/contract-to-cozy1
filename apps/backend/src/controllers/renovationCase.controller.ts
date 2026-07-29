import type { NextFunction, Response } from 'express';
import type { CustomRequest as Request } from '../types';
import * as service from '../services/renovationCase.service';

export async function listCases(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listRenovationCases(
      req.params.propertyId,
      req.query.includeArchived === 'true',
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function createCase(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createRenovationCase(
      req.params.propertyId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function getCase(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getRenovationCase(req.params.propertyId, req.params.caseId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function updateCase(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateRenovationCase(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function transitionCase(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.transitionRenovationCase(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function archiveCase(req: Request, res: Response, next: NextFunction) {
  try {
    await service.archiveRenovationCase(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body.reason,
    );
    res.status(204).send();
  } catch (error) { next(error); }
}

export async function createScopeVersion(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createScopeVersion(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function createLink(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.linkContributor(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function deleteLink(req: Request, res: Response, next: NextFunction) {
  try {
    await service.unlinkContributor(
      req.params.propertyId,
      req.params.caseId,
      req.params.linkId,
      req.user!.userId,
    );
    res.status(204).send();
  } catch (error) { next(error); }
}

export async function addParticipant(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.addParticipant(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function removeParticipant(req: Request, res: Response, next: NextFunction) {
  try {
    await service.removeParticipant(
      req.params.propertyId,
      req.params.caseId,
      req.params.participantId,
      req.user!.userId,
    );
    res.status(204).send();
  } catch (error) { next(error); }
}

export async function listEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listRenovationCaseEvents(req.params.propertyId, req.params.caseId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}
