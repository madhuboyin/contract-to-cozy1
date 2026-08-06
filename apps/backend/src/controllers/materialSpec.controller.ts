import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { MaterialSpecService } from '../services/materialSpec.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import {
  assertProjectComplianceApplicable,
  getProjectComplianceEnvelope,
} from '../services/projectCompliance/context';
import { recordToolLifecycleEvents } from '../services/analytics/toolLifecycle';
import { materialSpecCompletionEvent } from '../services/analytics/materialSpecLifecycle';

const service = new MaterialSpecService();

export async function listSpecs(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const [result, propertyContext] = await Promise.all([
      service.listSpecs(propertyId, {
        category: req.query.category as any,
        scopeLevel: req.query.scopeLevel as any,
        roomId: req.query.roomId ? String(req.query.roomId) : undefined,
        projectId: req.query.projectId ? String(req.query.projectId) : undefined,
        lifecycleStatus: req.query.lifecycleStatus as any,
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        cursor: req.query.cursor ? String(req.query.cursor) : undefined,
      }),
      getProjectComplianceEnvelope(propertyId, req.user!.userId, 'MATERIAL_SPECS'),
    ]);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.MATERIAL_SPEC,
      metadataJson: { count: Array.isArray((result as any)?.specs) ? (result as any).specs.length : undefined },
    });
    res.json({ success: true, data: { ...result, propertyContext } });
  } catch (err) {
    next(err);
  }
}

export async function searchSpecs(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const specs = await service.searchSpecs(propertyId, String(req.query.q));
    res.json({ success: true, data: { specs } });
  } catch (err) {
    next(err);
  }
}

export async function getSpec(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, specId } = req.params;
    const spec = await service.getSpec(propertyId, specId);
    res.json({ success: true, data: { spec } });
  } catch (err) {
    next(err);
  }
}

export async function createSpec(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    await assertProjectComplianceApplicable(
      propertyId,
      req.user!.userId,
      'MATERIAL_SPECS',
      {},
      'materialSpecifications',
    );
    const { spec, possibleDuplicates } = await service.createSpec(propertyId, req.body, req.user!.userId);
    const propertyContext = await getProjectComplianceEnvelope(propertyId, req.user!.userId, 'MATERIAL_SPECS');

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.MATERIAL_SPEC,
      metadataJson: { actionType: 'create_spec', specId: (spec as any)?.id, category: (spec as any)?.category },
    });
    void recordToolLifecycleEvents({
      userId: req.user!.userId,
      propertyId,
      events: [materialSpecCompletionEvent(spec, 'create')],
    }).catch(() => undefined);

    res.status(201).json({ success: true, data: { spec, propertyContext, possibleDuplicates } });
  } catch (err) {
    next(err);
  }
}

export async function updateSpec(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, specId } = req.params;
    const spec = await service.updateSpec(propertyId, specId, req.body);
    void recordToolLifecycleEvents({
      userId: req.user!.userId,
      propertyId,
      events: [materialSpecCompletionEvent(spec, 'update')],
    }).catch(() => undefined);
    res.json({ success: true, data: { spec } });
  } catch (err) {
    next(err);
  }
}

export async function transitionMaterialLifecycle(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const spec = await service.transitionLifecycle(
      req.params.propertyId,
      req.params.specId,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data: { spec } });
  } catch (err) { next(err); }
}

export async function substituteMaterial(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const spec = await service.substituteSpec(
      req.params.propertyId,
      req.params.specId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data: { spec } });
  } catch (err) { next(err); }
}

export async function createMaterialExtraction(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const review = await service.createExtractionReview(
      req.params.propertyId,
      req.params.specId,
      req.body,
    );
    res.status(201).json({ success: true, data: { review } });
  } catch (err) { next(err); }
}

export async function reviewMaterialExtraction(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const review = await service.reviewExtraction(
      req.params.propertyId,
      req.params.specId,
      req.params.reviewId,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data: { review } });
  } catch (err) { next(err); }
}

export async function getMaterialRepairReorder(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const record = await service.getRepairReorderRecord(req.params.propertyId, req.params.specId);
    res.json({ success: true, data: { record } });
  } catch (err) { next(err); }
}

export async function deleteSpec(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, specId } = req.params;
    await service.deleteSpec(propertyId, specId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function addPhoto(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, specId } = req.params;
    const photo = await service.addPhoto(propertyId, specId, req.body);
    res.status(201).json({ success: true, data: { photo } });
  } catch (err) {
    next(err);
  }
}

export async function uploadPhoto(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, specId } = req.params;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ success: false, message: 'Photo file is required.' });
    const photo = await service.uploadPhoto(propertyId, specId, req.user!.userId, file, {
      caption: typeof req.body?.caption === 'string' ? req.body.caption : null,
    });
    res.status(201).json({ success: true, data: { photo } });
  } catch (err) {
    next(err);
  }
}

export async function deletePhoto(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, specId, photoId } = req.params;
    await service.deletePhoto(propertyId, specId, photoId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function reorderPhotos(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, specId } = req.params;
    const photos = await service.reorderPhotos(propertyId, specId, req.body.orderedIds);
    res.json({ success: true, data: { photos } });
  } catch (err) {
    next(err);
  }
}

export async function requestExport(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const userId = req.user!.userId;
    const specExport = await service.requestExport(propertyId, userId, req.body);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.MATERIAL_SPEC,
      metadataJson: { actionType: 'request_export' },
    });

    res.status(201).json({ success: true, data: { export: specExport } });
  } catch (err) {
    next(err);
  }
}

export async function listExports(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const exports = await service.listExports(propertyId);
    res.json({ success: true, data: { exports } });
  } catch (err) {
    next(err);
  }
}

export async function getExport(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, exportId } = req.params;
    const specExport = await service.getExport(propertyId, exportId);
    res.json({ success: true, data: { export: specExport } });
  } catch (err) {
    next(err);
  }
}
