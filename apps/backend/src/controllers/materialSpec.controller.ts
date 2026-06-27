import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { MaterialSpecService } from '../services/materialSpec.service';

const service = new MaterialSpecService();

export async function listSpecs(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const result = await service.listSpecs(propertyId, {
      category: req.query.category as any,
      scopeLevel: req.query.scopeLevel as any,
      roomId: req.query.roomId ? String(req.query.roomId) : undefined,
      isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor ? String(req.query.cursor) : undefined,
    });
    res.json({ success: true, data: result });
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
    const spec = await service.createSpec(propertyId, req.body);
    res.status(201).json({ success: true, data: { spec } });
  } catch (err) {
    next(err);
  }
}

export async function updateSpec(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, specId } = req.params;
    const spec = await service.updateSpec(propertyId, specId, req.body);
    res.json({ success: true, data: { spec } });
  } catch (err) {
    next(err);
  }
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
