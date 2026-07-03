import { Response, NextFunction } from 'express';
import { CustomRequest as Request } from '../types';
import { hoaComplianceService } from '../services/hoaCompliance.service';

export async function getAssociation(req: Request, res: Response, next: NextFunction) {
  try {
    const association = await hoaComplianceService.getAssociation(req.params.propertyId);
    res.json({ success: true, data: { association } });
  } catch (err) { next(err); }
}

export async function upsertAssociation(req: Request, res: Response, next: NextFunction) {
  try {
    const association = await hoaComplianceService.upsertAssociation(req.params.propertyId, req.body);
    res.json({ success: true, data: { association } });
  } catch (err) { next(err); }
}

export async function listApprovalRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const records = await hoaComplianceService.listApprovalRecords(req.params.propertyId);
    res.json({ success: true, data: { records } });
  } catch (err) { next(err); }
}

export async function createApprovalRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await hoaComplianceService.createApprovalRecord(req.params.propertyId, req.body);
    res.status(201).json({ success: true, data: { record } });
  } catch (err) { next(err); }
}

export async function updateApprovalRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await hoaComplianceService.updateApprovalRecord(
      req.params.id,
      req.params.propertyId,
      req.body,
    );
    res.json({ success: true, data: { record } });
  } catch (err) { next(err); }
}

export async function deleteApprovalRecord(req: Request, res: Response, next: NextFunction) {
  try {
    await hoaComplianceService.deleteApprovalRecord(req.params.id, req.params.propertyId);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function reportViolation(req: Request, res: Response, next: NextFunction) {
  try {
    const incident = await hoaComplianceService.reportViolation(
      req.params.propertyId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data: { incident } });
  } catch (err) { next(err); }
}
