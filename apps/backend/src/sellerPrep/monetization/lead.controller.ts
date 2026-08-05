import { Response } from 'express';
import { AuthRequest } from '../../types/auth.types';
import { SellerPrepLeadService } from '../sellerPrep.service';

const VALID_CONTACT_METHODS = new Set(['email', 'phone', 'either']);

export class SellerPrepLeadController {
  static async create(req: AuthRequest, res: Response) {
    const propertyId = req.params.propertyId;
    const { leadType, context, fullName, email, phone, contactMethod, consentGiven } = req.body ?? {};

    if (typeof leadType !== 'string' || !leadType.trim()) {
      return res.status(400).json({ success: false, message: 'leadType is required.' });
    }
    if (consentGiven !== true) {
      return res.status(400).json({
        success: false,
        message: 'Explicit consent to share your contact details is required.',
      });
    }
    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: 'An email or phone number is required so this request can actually be followed up on.',
      });
    }
    if (contactMethod !== undefined && !VALID_CONTACT_METHODS.has(contactMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid contactMethod.' });
    }

    const lead = await SellerPrepLeadService.createLead({
      userId: req.user!.userId,
      propertyId,
      leadType,
      context: typeof context === 'string' ? context : JSON.stringify(context ?? {}),
      fullName: typeof fullName === 'string' ? fullName : undefined,
      email: typeof email === 'string' ? email : undefined,
      phone: typeof phone === 'string' ? phone : undefined,
      contactMethod: typeof contactMethod === 'string' ? contactMethod : undefined,
      consentGiven: true,
    });

    return res.status(201).json({ success: true, data: { id: lead.id } });
  }
}
