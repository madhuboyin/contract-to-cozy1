// apps/backend/src/services/provider-management.service.ts

import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';


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
}
