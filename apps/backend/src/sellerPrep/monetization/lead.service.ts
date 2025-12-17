// apps/backend/src/sellerPrep/monetization/lead.service.ts
import { prisma } from '../../lib/prisma';

export class SellerPrepLeadService {
  static async createLead(input: {
    userId: string;
    propertyId: string;
    leadType: string;
    context: string;
  }) {
    return prisma.sellerPrepLead.create({
      data: input,
    });
  }
}
