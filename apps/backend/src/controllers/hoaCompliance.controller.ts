import { Response, NextFunction } from 'express';
import { CustomRequest as Request } from '../types';
import { hoaComplianceService } from '../services/hoaCompliance.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getProjectComplianceEnvelope } from '../services/projectCompliance/context';

export async function getAssociation(req: Request, res: Response, next: NextFunction) {
  try {
    const [association, propertyContext] = await Promise.all([
      hoaComplianceService.getAssociation(req.params.propertyId),
      getProjectComplianceEnvelope(req.params.propertyId, req.user!.userId, 'HOA_COMPLIANCE'),
    ]);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.COMMUNITY,
      featureKey: AnalyticsFeature.HOA_COMPLIANCE,
      metadataJson: { hasAssociation: !!association },
    });

    res.json({ success: true, data: { association, propertyContext } });
  } catch (err) { next(err); }
}

export async function upsertAssociation(req: Request, res: Response, next: NextFunction) {
  try {
    const association = await hoaComplianceService.upsertAssociation(req.params.propertyId, req.body);
    const propertyContext = await getProjectComplianceEnvelope(req.params.propertyId, req.user!.userId, 'HOA_COMPLIANCE');

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.COMMUNITY,
      featureKey: AnalyticsFeature.HOA_COMPLIANCE,
      metadataJson: { actionType: 'upsert_association' },
    });

    res.json({ success: true, data: { association, propertyContext } });
  } catch (err) { next(err); }
}

export async function listApprovalRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const [records, propertyContext] = await Promise.all([
      hoaComplianceService.listApprovalRecords(req.params.propertyId),
      getProjectComplianceEnvelope(req.params.propertyId, req.user!.userId, 'HOA_COMPLIANCE'),
    ]);
    res.json({ success: true, data: { records, propertyContext } });
  } catch (err) { next(err); }
}

export async function createApprovalRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await hoaComplianceService.createApprovalRecord(req.params.propertyId, req.body);
    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      req.user!.userId,
      'HOA_COMPLIANCE',
      { hoaWorkTypes: [req.body.workType] },
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.COMMUNITY,
      featureKey: AnalyticsFeature.HOA_COMPLIANCE,
      metadataJson: { actionType: 'create_approval_record', recordId: (record as any)?.id },
    });

    res.status(201).json({ success: true, data: { record, propertyContext } });
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

export async function listViolations(req: Request, res: Response, next: NextFunction) {
  try {
    const violations = await hoaComplianceService.listViolations(req.params.propertyId);
    res.json({ success: true, data: { violations } });
  } catch (err) { next(err); }
}

export async function reportViolation(req: Request, res: Response, next: NextFunction) {
  try {
    const incident = await hoaComplianceService.reportViolation(
      req.params.propertyId,
      req.user!.userId,
      req.body,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.COMMUNITY,
      featureKey: AnalyticsFeature.HOA_COMPLIANCE,
      metadataJson: { actionType: 'report_violation', incidentId: (incident as any)?.id },
    });

    res.status(201).json({ success: true, data: { incident } });
  } catch (err) { next(err); }
}
