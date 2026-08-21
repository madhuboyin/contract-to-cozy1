// apps/backend/src/services/provider-management.service.ts

import { PrismaClient, ProviderPortfolio } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { uploadDocumentBuffer } from './storage/reportStorage';
import { presignGetObject } from './storage/presign';

/**
 * ProviderPortfolio.imageUrl stores the S3 object key (not a public URL) —
 * same convention as ProviderCredential.fileUrl. Presign on every read so
 * the private bucket stays private while portfolio photos remain viewable.
 */
export async function presignPortfolioImageUrl<T extends { imageUrl: string }>(
  item: T
): Promise<T> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return item;
  try {
    const signedUrl = await presignGetObject({
      bucket,
      key: item.imageUrl,
      expiresInSeconds: 3600,
    });
    return { ...item, imageUrl: signedUrl };
  } catch {
    return item;
  }
}

export class ProviderManagementService {
  /**
   * Get services for a provider
   */
  static async getProviderServices(userId: string) {
    // Get provider profile
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new Error('Provider profile not found');
    }

    // Get services
    const services = await prisma.service.findMany({
      where: { providerProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
    });

    // Convert Decimal to string
    return services.map(s => ({
      ...s,
      basePrice: s.basePrice.toString(),
      minimumCharge: s.minimumCharge?.toString() || null,
    }));
  }

  /**
   * Create a service
   */
  static async createService(userId: string, data: any) {
    // Get provider profile
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new Error('Provider profile not found');
    }

    // Create service
    const service = await prisma.service.create({
      data: {
        ...data,
        providerProfileId: profile.id,
      },
    });

    // Convert Decimal to string
    return {
      ...service,
      basePrice: service.basePrice.toString(),
      minimumCharge: service.minimumCharge?.toString() || null,
    };
  }

  /**
   * Update a service
   */
  static async updateService(serviceId: string, userId: string, data: any) {
    // Get provider profile
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new Error('Provider profile not found');
    }

    // Verify ownership
    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        providerProfileId: profile.id,
      },
    });

    if (!service) {
      throw new Error('Service not found or access denied');
    }

    // Update
    const updated = await prisma.service.update({
      where: { id: serviceId },
      data,
    });

    // Convert Decimal to string
    return {
      ...updated,
      basePrice: updated.basePrice.toString(),
      minimumCharge: updated.minimumCharge?.toString() || null,
    };
  }

  /**
   * Delete a service
   */
  static async deleteService(serviceId: string, userId: string) {
    // Get provider profile
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new Error('Provider profile not found');
    }

    // Verify ownership
    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        providerProfileId: profile.id,
      },
    });

    if (!service) {
      throw new Error('Service not found or access denied');
    }

    // Delete
    await prisma.service.delete({
      where: { id: serviceId },
    });
  }

  // ===========================================================================
  // Portfolio
  // ===========================================================================

  static async listPortfolio(userId: string): Promise<ProviderPortfolio[]> {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new Error('Provider profile not found');
    }

    const items = await prisma.providerPortfolio.findMany({
      where: { providerProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(items.map(presignPortfolioImageUrl));
  }

  static async createPortfolioItem(
    userId: string,
    data: { title: string; description?: string; category: string },
    file: { buffer: Buffer; originalname: string; mimetype: string }
  ): Promise<ProviderPortfolio> {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new Error('Provider profile not found');
    }

    const { key } = await uploadDocumentBuffer({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      userId,
    });

    const item = await prisma.providerPortfolio.create({
      data: {
        ...data,
        imageUrl: key,
        providerProfileId: profile.id,
      } as any,
    });

    return presignPortfolioImageUrl(item);
  }

  static async updatePortfolioItem(
    itemId: string,
    userId: string,
    data: any
  ): Promise<ProviderPortfolio> {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new Error('Provider profile not found');
    }

    const item = await prisma.providerPortfolio.findFirst({
      where: { id: itemId, providerProfileId: profile.id },
    });

    if (!item) {
      throw new Error('Portfolio item not found or access denied');
    }

    const updated = await prisma.providerPortfolio.update({
      where: { id: itemId },
      data,
    });

    return presignPortfolioImageUrl(updated);
  }

  static async deletePortfolioItem(itemId: string, userId: string): Promise<void> {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new Error('Provider profile not found');
    }

    const item = await prisma.providerPortfolio.findFirst({
      where: { id: itemId, providerProfileId: profile.id },
    });

    if (!item) {
      throw new Error('Portfolio item not found or access denied');
    }

    await prisma.providerPortfolio.delete({ where: { id: itemId } });
  }

  // ===========================================================================
  // Availability
  // ===========================================================================

  static async listAvailability(userId: string) {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new Error('Provider profile not found');
    }

    return prisma.providerAvailability.findMany({
      where: { providerProfileId: profile.id },
      orderBy: { startDate: 'asc' },
    });
  }

  static async createAvailabilityWindow(userId: string, data: any) {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new Error('Provider profile not found');
    }

    return prisma.providerAvailability.create({
      data: {
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        providerProfileId: profile.id,
      },
    });
  }

  static async updateAvailabilityWindow(windowId: string, userId: string, data: any) {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new Error('Provider profile not found');
    }

    const window = await prisma.providerAvailability.findFirst({
      where: { id: windowId, providerProfileId: profile.id },
    });

    if (!window) {
      throw new Error('Availability window not found or access denied');
    }

    const updateData: any = { ...data };
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);

    return prisma.providerAvailability.update({
      where: { id: windowId },
      data: updateData,
    });
  }

  static async deleteAvailabilityWindow(windowId: string, userId: string): Promise<void> {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new Error('Provider profile not found');
    }

    const window = await prisma.providerAvailability.findFirst({
      where: { id: windowId, providerProfileId: profile.id },
    });

    if (!window) {
      throw new Error('Availability window not found or access denied');
    }

    await prisma.providerAvailability.delete({ where: { id: windowId } });
  }
}
