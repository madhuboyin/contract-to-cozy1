import { Response } from 'express';
import { AuthRequest } from '../../types/auth.types';
import { SellerPrepLeadService } from './lead.service';

export class SellerPrepLeadController {
  static async create(req: AuthRequest, res: Response) {
    const { propertyId, leadType, context } = req.body;

    await SellerPrepLeadService.createLead({
      userId: req.user!.userId,
      propertyId,
      leadType,
      context,
    });

    res.sendStatus(201);
  }
}
