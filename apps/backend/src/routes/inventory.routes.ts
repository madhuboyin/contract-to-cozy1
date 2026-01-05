// apps/backend/src/routes/inventory.routes.ts

import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { CustomRequest } from '../types';
import { prisma } from '../lib/prisma';

import {
  listRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  listItems,
  createItem,
  getItem,
  updateItem,
  deleteItem,
  linkDocumentToItem,
  unlinkDocumentFromItem,
} from '../controllers/inventory.controller';

import {
  createRoomBodySchema,
  updateRoomBodySchema,
  createItemBodySchema,
  updateItemBodySchema,
  linkDocumentBodySchema,
} from '../validators/inventory.validators';

const router = Router();

// Apply common middleware
router.use(apiRateLimiter);
router.use(authenticate);

// Rooms
router.get('/properties/:propertyId/inventory/rooms', propertyAuthMiddleware, listRooms);
router.post(
  '/properties/:propertyId/inventory/rooms',
  propertyAuthMiddleware,
  validateBody(createRoomBodySchema),
  createRoom
);
router.patch(
  '/properties/:propertyId/inventory/rooms/:roomId',
  propertyAuthMiddleware,
  validateBody(updateRoomBodySchema),
  updateRoom
);
router.delete('/properties/:propertyId/inventory/rooms/:roomId', propertyAuthMiddleware, deleteRoom);

// Items
router.get('/properties/:propertyId/inventory/items', propertyAuthMiddleware, listItems);
router.post(
  '/properties/:propertyId/inventory/items',
  propertyAuthMiddleware,
  validateBody(createItemBodySchema),
  createItem
);
router.get('/properties/:propertyId/inventory/items/:itemId', propertyAuthMiddleware, getItem);
router.patch(
  '/properties/:propertyId/inventory/items/:itemId',
  propertyAuthMiddleware,
  validateBody(updateItemBodySchema),
  updateItem
);
router.delete('/properties/:propertyId/inventory/items/:itemId', propertyAuthMiddleware, deleteItem);

// Documents linking
router.post(
  '/properties/:propertyId/inventory/items/:itemId/documents',
  propertyAuthMiddleware,
  validateBody(linkDocumentBodySchema),
  linkDocumentToItem
);
router.delete(
  '/properties/:propertyId/inventory/items/:itemId/documents/:documentId',
  propertyAuthMiddleware,
  unlinkDocumentFromItem
);

router.get(
  '/properties/:propertyId/inventory/export',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response) => {
    try {
      const { propertyId } = req.params;
      const format = String(req.query.format || 'csv');

      const items = await prisma.inventoryItem.findMany({
        where: { propertyId },
        include: {
          room: { select: { name: true } },
          documents: { select: { id: true, name: true, type: true, createdAt: true } },
          warranty: { select: { providerName: true, policyNumber: true, expiryDate: true } },
          insurancePolicy: { select: { carrierName: true, policyNumber: true, expiryDate: true } },
        },
        orderBy: [{ roomId: 'asc' }, { name: 'asc' }],
      });

      if (format !== 'csv') {
        return res.status(400).json({ success: false, message: 'Unsupported format. Use format=csv' });
      }

      const headers = [
        'Room',
        'Item Name',
        'Category',
        'Condition',
        'Brand',
        'Model',
        'Serial No',
        'Installed On',
        'Purchased On',
        'Last Serviced On',
        'Purchase Cost (cents)',
        'Replacement Cost (cents)',
        'Currency',
        'Warranty Provider',
        'Warranty Policy #',
        'Warranty Expiry',
        'Insurance Carrier',
        'Insurance Policy #',
        'Insurance Expiry',
        'Tags',
        'Notes',
        'Documents',
      ];

      const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const date = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

      const rows = items.map((it) => {
        const docs = (it.documents || []).map((d) => d.name || d.id).join('; ');
        const tags = (it.tags || []).join('; ');

        return [
          it.room?.name || '',
          it.name,
          it.category,
          it.condition,
          it.brand || '',
          it.model || '',
          it.serialNo || '',
          date(it.installedOn),
          date(it.purchasedOn),
          date(it.lastServicedOn),
          it.purchaseCostCents ?? '',
          it.replacementCostCents ?? '',
          it.currency || 'USD',
          it.warranty?.providerName || '',
          it.warranty?.policyNumber || '',
          date(it.warranty?.expiryDate),
          it.insurancePolicy?.carrierName || '',
          it.insurancePolicy?.policyNumber || '',
          date(it.insurancePolicy?.expiryDate),
          tags,
          it.notes || '',
          docs,
        ].map(escape).join(',');
      });

      const csv = [headers.map(escape).join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="home-inventory-${propertyId}-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      return res.send(csv);
    } catch (err: any) {
      console.error('[INVENTORY] export failed:', err);
      return res.status(500).json({ success: false, message: err.message || 'Export failed' });
    }
  }
);

router.get(
  '/properties/:propertyId/inventory/items/:itemId/coverage-summary',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response) => {
    try {
      const { propertyId, itemId } = req.params;

      const item = await prisma.inventoryItem.findFirst({
        where: { id: itemId, propertyId },
        include: {
          warranty: {
            select: {
              id: true,
              providerName: true,
              policyNumber: true,
              coverageDetails: true,
              startDate: true,
              expiryDate: true,
            },
          },
          insurancePolicy: {
            select: {
              id: true,
              carrierName: true,
              policyNumber: true,
              coverageType: true,
              premiumAmount: true,
              startDate: true,
              expiryDate: true,
            },
          },
        },
      });

      if (!item) return res.status(404).json({ success: false, message: 'Inventory item not found' });

      const today = new Date();
      const warrantyActive = !!item.warranty && item.warranty.expiryDate > today;
      const insuranceActive = !!item.insurancePolicy && item.insurancePolicy.expiryDate > today;

      return res.json({
        success: true,
        data: {
          item: {
            id: item.id,
            name: item.name,
            category: item.category,
            replacementCostCents: item.replacementCostCents,
            currency: item.currency,
          },
          warranty: item.warranty
            ? { ...item.warranty, active: warrantyActive }
            : null,
          insurancePolicy: item.insurancePolicy
            ? { ...item.insurancePolicy, active: insuranceActive }
            : null,
        },
      });
    } catch (err: any) {
      console.error('[INVENTORY] coverage-summary failed', err);
      return res.status(500).json({ success: false, message: err.message || 'Failed to load coverage summary' });
    }
  }
);

export default router;
