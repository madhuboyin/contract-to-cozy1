// apps/backend/src/sellerPrep/sellerPrep.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { SellerPrepService } from './sellerPrep.service';

export class SellerPrepController {
  static async getOverview(req: AuthRequest, res: Response) {
    const { propertyId } = req.params;
    const userId = req.user!.userId;

    const data = await SellerPrepService.getOverview(userId, propertyId);
    res.json(data);
  }

  static async updateItem(req: AuthRequest, res: Response) {
    const { itemId } = req.params;
    const { status } = req.body;

    await SellerPrepService.updateItemStatus(
      req.user!.userId,
      itemId,
      status
    );

    res.sendStatus(204);
  }
  /* ✅ Phase 2 – Comparables */
  static async getComparables(req: AuthRequest, res: Response) {
    const { propertyId } = req.params;
    const userId = req.user!.userId;

    const data = await SellerPrepService.getComparables(userId, propertyId);
    res.json(data);
  }
  static async getReadinessReport(req: AuthRequest, res: Response) {
    const { propertyId } = req.params;
    const userId = req.user!.userId;

    const data = await SellerPrepService.getSellerReadinessReport(
      userId,
      propertyId
    );
    res.json(data);
  }  

}
