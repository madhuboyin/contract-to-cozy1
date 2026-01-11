// apps/backend/src/controllers/inventoryImport.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { InventoryImportService } from '../services/inventoryImport.service';

const svc = new InventoryImportService();

/**
 * GET /properties/:propertyId/inventory/import/template
 */
export async function downloadInventoryImportTemplate(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { propertyId } = req.params;
    const buf = await svc.buildTemplateXlsx(propertyId);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="inventory-template-${propertyId}.xlsx"`
    );
    return res.send(buf);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /properties/:propertyId/inventory/import
 * multipart/form-data: file=<xlsx>
 * query:
 *  - dryRun=true|false (optional)
 *  - createRooms=true|false (optional; default true)
 */
export async function importInventoryFromXlsx(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { propertyId } = req.params;

    const dryRun = String(req.query.dryRun || 'false') === 'true';
    const createRooms = String(req.query.createRooms || 'true') === 'true';

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file?.buffer) {
      return res.status(400).json({ message: 'Missing XLSX file (field name: file)' });
    }

    const result = await svc.importFromXlsx({
      propertyId,
      xlsxBuffer: file.buffer,
      originalFileName: file.originalname || null,
      dryRun,
      createRooms,
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
}
