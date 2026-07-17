import { Response, NextFunction } from 'express';
import { CustomRequest as Request } from '../types';
import { permitTrackerService } from '../services/permitTracker.service';
import { permitFetchService } from '../services/permitFetch.service';
import { permitDetectionService } from '../services/permitDetection.service';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getProjectComplianceEnvelope } from '../services/projectCompliance/context';

// ── Open Data Fetch ────────────────────────────────────────────────────────────

export async function triggerPermitFetch(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await permitFetchService.triggerFetch(req.params.propertyId, 'USER_REQUEST');

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PERMIT_TRACKER,
      metadataJson: { actionType: 'trigger_fetch' },
    });

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getPermitFetchStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const status = await permitFetchService.getLatestFetchStatus(req.params.propertyId);
    res.json({ success: true, data: { fetchJob: status } });
  } catch (err) { next(err); }
}

// ── Permit Records ─────────────────────────────────────────────────────────────

export async function listPermits(req: Request, res: Response, next: NextFunction) {
  try {
    const [result, propertyContext] = await Promise.all([
      permitTrackerService.listPermits(req.params.propertyId, req.query as any),
      getProjectComplianceEnvelope(req.params.propertyId, req.user!.userId, 'PERMIT_TRACKER'),
    ]);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PERMIT_TRACKER,
      metadataJson: { count: Array.isArray((result as any)?.permits) ? (result as any).permits.length : undefined },
    });

    res.json({ success: true, data: { ...result, propertyContext } });
  } catch (err) { next(err); }
}

export async function createManualPermit(req: Request, res: Response, next: NextFunction) {
  try {
    const permit = await permitTrackerService.createManualPermit(req.params.propertyId, req.body);
    const propertyContext = await getProjectComplianceEnvelope(req.params.propertyId, req.user!.userId, 'PERMIT_TRACKER');

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PERMIT_TRACKER,
      metadataJson: { actionType: 'create_manual_permit', permitId: (permit as any)?.id },
    });

    res.status(201).json({ success: true, data: { permit, propertyContext } });
  } catch (err) { next(err); }
}

export async function getPermitDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const permit = await permitTrackerService.getPermitDetail(
      req.params.permitId,
      req.params.propertyId,
    );
    res.json({ success: true, data: { permit } });
  } catch (err) { next(err); }
}

export async function updatePermit(req: Request, res: Response, next: NextFunction) {
  try {
    const permit = await permitTrackerService.updatePermit(
      req.params.permitId,
      req.params.propertyId,
      req.body,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PERMIT_TRACKER,
      metadataJson: { actionType: 'update_permit', permitId: req.params.permitId },
    });

    res.json({ success: true, data: { permit } });
  } catch (err) { next(err); }
}

export async function deletePermit(req: Request, res: Response, next: NextFunction) {
  try {
    await permitTrackerService.softDeletePermit(req.params.permitId, req.params.propertyId);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PERMIT_TRACKER,
      metadataJson: { actionType: 'delete_permit', permitId: req.params.permitId },
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

export async function getPermitSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await permitTrackerService.getPermitSummary(req.params.propertyId);
    res.json({ success: true, data: { summary } });
  } catch (err) { next(err); }
}

// ── Inspection Milestones ──────────────────────────────────────────────────────

export async function listInspectionMilestones(req: Request, res: Response, next: NextFunction) {
  try {
    const milestones = await prisma.permitInspectionMilestone.findMany({
      where: { permitRecordId: req.params.permitId, propertyId: req.params.propertyId },
      orderBy: { sortOrder: 'asc' },
    });
    const now = new Date();
    res.json({
      success: true,
      data: {
        milestones: milestones.map((m) => ({
          ...m,
          scheduledDate: m.scheduledDate?.toISOString(),
          inspectedDate: m.inspectedDate?.toISOString(),
          isOverdue:
            m.scheduledDate != null &&
            m.scheduledDate < now &&
            m.status !== 'PASSED' &&
            m.status !== 'CANCELLED',
        })),
      },
    });
  } catch (err) { next(err); }
}

export async function addInspectionMilestone(req: Request, res: Response, next: NextFunction) {
  try {
    const milestone = await permitTrackerService.addInspectionMilestone(
      req.params.permitId,
      req.params.propertyId,
      req.body,
    );
    res.status(201).json({ success: true, data: { milestone } });
  } catch (err) { next(err); }
}

export async function updateInspectionMilestone(req: Request, res: Response, next: NextFunction) {
  try {
    const milestone = await permitTrackerService.updateInspectionMilestone(
      req.params.milestoneId,
      req.params.permitId,
      req.params.propertyId,
      req.body,
    );
    res.json({ success: true, data: { milestone } });
  } catch (err) { next(err); }
}

export async function deleteInspectionMilestone(req: Request, res: Response, next: NextFunction) {
  try {
    await permitTrackerService.deleteInspectionMilestone(
      req.params.milestoneId,
      req.params.permitId,
      req.params.propertyId,
    );
    res.status(204).send();
  } catch (err) { next(err); }
}

// ── Unpermitted Flags ──────────────────────────────────────────────────────────

export async function listPermitFlags(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await permitTrackerService.listFlags(req.params.propertyId, req.query as any);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getPermitFlag(req: Request, res: Response, next: NextFunction) {
  try {
    const flag = await permitTrackerService.getFlagDetail(
      req.params.flagId,
      req.params.propertyId,
    );
    res.json({ success: true, data: { flag } });
  } catch (err) { next(err); }
}

export async function updatePermitFlag(req: Request, res: Response, next: NextFunction) {
  try {
    const flag = await permitTrackerService.updateFlag(
      req.params.flagId,
      req.params.propertyId,
      req.body,
    );
    res.json({ success: true, data: { flag } });
  } catch (err) { next(err); }
}

export async function createManualFlag(req: Request, res: Response, next: NextFunction) {
  try {
    const flag = await permitTrackerService.createManualFlag(req.params.propertyId, req.body);
    res.status(201).json({ success: true, data: { flag } });
  } catch (err) { next(err); }
}

export async function runDetectionScan(req: Request, res: Response, next: NextFunction) {
  try {
    const flagsCreated = await permitDetectionService.detectUnpermittedWork(req.params.propertyId);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PERMIT_TRACKER,
      metadataJson: { actionType: 'run_detection_scan', flagsCreated },
    });

    res.json({ success: true, data: { flagsCreated } });
  } catch (err) { next(err); }
}

// ── Disclosure Export ──────────────────────────────────────────────────────────

export async function requestDisclosureExport(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await permitTrackerService.requestDisclosureExport(
      req.params.propertyId,
      req.user!.userId,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PERMIT_TRACKER,
      metadataJson: { actionType: 'request_disclosure_export' },
    });

    res.status(202).json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getDisclosureExport(req: Request, res: Response, next: NextFunction) {
  try {
    const exportRecord = await permitTrackerService.getDisclosureExport(
      req.params.exportId,
      req.params.propertyId,
    );
    res.json({ success: true, data: { export: exportRecord } });
  } catch (err) { next(err); }
}

export async function listDisclosureExports(req: Request, res: Response, next: NextFunction) {
  try {
    const exports = await permitTrackerService.listDisclosureExports(req.params.propertyId);
    res.json({ success: true, data: { exports } });
  } catch (err) { next(err); }
}

// ── Admin — Data Sources ───────────────────────────────────────────────────────

export async function adminListDataSources(req: Request, res: Response, next: NextFunction) {
  try {
    const sources = await prisma.permitDataSource.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: { sources } });
  } catch (err) { next(err); }
}

export async function adminCreateDataSource(req: Request, res: Response, next: NextFunction) {
  try {
    const source = await prisma.permitDataSource.create({ data: req.body });
    res.status(201).json({ success: true, data: { source } });
  } catch (err) { next(err); }
}

export async function adminUpdateDataSource(req: Request, res: Response, next: NextFunction) {
  try {
    const source = await prisma.permitDataSource.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ success: true, data: { source } });
  } catch (err) { next(err); }
}

export async function adminPatchDataSourceStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const source = await prisma.permitDataSource.update({
      where: { id: req.params.id },
      data: { status: req.body.status },
    });
    res.json({ success: true, data: { source } });
  } catch (err) { next(err); }
}

export async function adminTestDataSource(req: Request, res: Response, next: NextFunction) {
  try {
    const source = await prisma.permitDataSource.findUnique({ where: { id: req.params.id } });
    if (!source) throw new APIError('Data source not found', 404, 'NOT_FOUND');

    const { street, city, state } = req.body ?? {};
    if (!street || !city || !state) {
      throw new APIError('street, city, and state are required for test fetch', 400, 'VALIDATION_ERROR');
    }

    let results: any[];
    const { socrataAdapter: s } = await import('../services/permitAdapters/socrata.adapter');
    const { accelaAdapter: a } = await import('../services/permitAdapters/accela.adapter');

    if (source.adapterType === 'SOCRATA') {
      results = await s.fetchPermits(source, { street, city, state });
    } else if (source.adapterType === 'ACCELA') {
      results = await a.fetchPermits(source, { street, city, state });
    } else {
      throw new APIError('Adapter type not supported for test', 400, 'UNSUPPORTED_ADAPTER');
    }

    res.json({ success: true, data: { recordsFound: results.length, sample: results.slice(0, 3) } });
  } catch (err) { next(err); }
}
