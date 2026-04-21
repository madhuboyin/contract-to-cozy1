import { Response } from 'express';
import { UserRole, Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../types/auth.types';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),  // Frontend sends "address"
  city: z.string().optional(),
  state: z.string().length(2).optional(),
  zipCode: z.string().length(5).optional(),
});

async function deactivateProviderFootprint(tx: Prisma.TransactionClient, userId: string) {
  await tx.providerProfile.updateMany({
    where: { userId },
    data: { status: 'INACTIVE' },
  });

  await tx.service.updateMany({
    where: { providerProfile: { userId } },
    data: { isActive: false },
  });
}

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { 
        address: true,
        homeownerProfile: {
          select: {
            id: true,
            segment: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      success: true, 
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        address: user.address?.street1 || '',
        city: user.address?.city || '',
        state: user.address?.state || '',
        zipCode: user.address?.zipCode || '',
        role: user.role,
        createdAt: user.createdAt,
        homeownerProfile: user.homeownerProfile,
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Get profile error');
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validation = updateProfileSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: validation.error.issues 
      });
    }

    const { firstName, lastName, phone, address, city, state, zipCode } = validation.data;

    // Update user fields
    await prisma.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        phone,
      },
    });

    // Handle address separately
    const addressFieldsProvided = address !== undefined || city !== undefined || state !== undefined || zipCode !== undefined;
    
    if (addressFieldsProvided) {
      const existingAddress = await prisma.address.findUnique({
        where: { userId },
      });

      const addressData: any = {};
      if (address !== undefined) addressData.street1 = address;
      if (city !== undefined) addressData.city = city;
      if (state !== undefined) addressData.state = state;
      if (zipCode !== undefined) addressData.zipCode = zipCode;
      
      const hasAnyAddressData = Object.keys(addressData).length > 0;

      if (existingAddress) {
        // Update existing address with any provided fields
        if (hasAnyAddressData) {
          await prisma.address.update({
            where: { userId },
            data: addressData, // This correctly handles partial updates
          });
        }
      } else if (hasAnyAddressData) {
        // Create new address record even if fields are partially provided.
        await prisma.address.create({
          data: {
            userId,
            street1: addressData.street1 ?? '',
            city: addressData.city ?? '',
            state: addressData.state ?? '',
            zipCode: addressData.zipCode ?? '',
          },
        });
      }
    }

    // Fetch updated user
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { address: true },
    });

    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      data: {
        id: updatedUser!.id,
        email: updatedUser!.email,
        firstName: updatedUser!.firstName,
        lastName: updatedUser!.lastName,
        phone: updatedUser!.phone,
        address: updatedUser!.address?.street1 || '',
        city: updatedUser!.address?.city || '',
        state: updatedUser!.address?.state || '',
        zipCode: updatedUser!.address?.zipCode || '',
        role: updatedUser!.role,
        createdAt: updatedUser!.createdAt,
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Update profile error');
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

/**
 * Deactivate the authenticated account.
 * This is reversible by support/admin, unlike delete.
 */
export const deactivateAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'INACTIVE',
          tokenVersion: { increment: 1 },
        },
      });

      await deactivateProviderFootprint(tx, userId);
    });

    res.json({
      success: true,
      message: 'Account deactivated successfully.',
      data: {
        status: 'INACTIVE',
        deactivatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Deactivate account error');
    res.status(500).json({ error: 'Failed to deactivate account' });
  }
};

/**
 * Permanently delete account access by anonymizing personal data and
 * disabling provider visibility. This action is intentionally irreversible.
 */
export const deleteAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = Date.now();
    const shortId = userId.slice(0, 8);
    const anonymizedEmail = `deleted+${shortId}-${now}@deleted.contracttocozy.local`;

    await prisma.$transaction(async (tx) => {
      await deactivateProviderFootprint(tx, userId);

      await tx.address.deleteMany({
        where: { userId },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmail,
          firstName: 'Deleted',
          lastName: 'Account',
          phone: null,
          avatar: null,
          bio: null,
          status: 'INACTIVE',
          emailVerified: false,
          phoneVerified: false,
          mfaEnabled: false,
          mfaSecret: null,
          tokenVersion: { increment: 1 },
        },
      });
    });

    res.json({
      success: true,
      message: 'Account deleted successfully.',
      data: {
        status: 'DELETED',
        deletedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Delete account error');
    res.status(500).json({ error: 'Failed to delete account' });
  }
};


// ====================================================================
// NEW: FAVORITE PROVIDER ENDPOINTS
// ====================================================================

/**
 * Lists the authenticated homeowner's favorite providers.
 */
export const listFavorites = async (req: AuthRequest, res: Response) => {
  // FIX: Check req.user and req.user.role
  if (!req.user || req.user.role !== UserRole.HOMEOWNER) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const userId = req.user.userId;

  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId },
      include: {
        providerProfile: {
          include: {
            user: { 
              select: { 
                id: true, 
                firstName: true, 
                lastName: true, 
                email: true, 
                // FIX: Include phone number to match frontend type definition
                phone: true, 
              } 
            },
            services: true,
          },
        },
      },
    });

    // Extract and clean up the provider profile data
    const favoriteProviders = favorites
      .map(f => f.providerProfile)
      .filter(p => p !== null);

    res.json({
      success: true,
      data: { favorites: favoriteProviders },
    });
  } catch (error) {
    logger.error({ err: error }, 'List favorites error');
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
};

/**
 * Adds a provider to the homeowner's favorites.
 */
export const addFavorite = async (req: AuthRequest, res: Response) => {
  // FIX: Check req.user and req.user.role
  if (!req.user || req.user.role !== UserRole.HOMEOWNER) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const userId = req.user.userId;
  const { providerProfileId } = req.body;

  if (!providerProfileId) {
    return res.status(400).json({ error: 'Provider Profile ID is required.' });
  }

  try {
    // 1. Create the favorite record
    await prisma.favorite.create({
      data: {
        userId,
        providerProfileId,
      },
    });

    // FIX: 2. Fetch the newly favorited ProviderProfile with necessary details (e.g., businessName)
    const newFavoriteProvider = await prisma.providerProfile.findUnique({
      where: { id: providerProfileId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        services: true,
      },
    });

    if (!newFavoriteProvider) {
      // Should not happen if providerProfileId is valid
      return res.status(500).json({ error: 'Failed to retrieve provider profile after adding favorite.' });
    }
    logger.info({ newFavoriteProvider }, 'DEBUG (Backend: addFavorite): Sending complete provider profile');
    res.status(201).json({
      success: true,
      message: 'Provider added to favorites.',
      // FIX: Return the complete ProviderProfile object
      data: newFavoriteProvider,
    });
  } catch (error) {
    // FIX: Use Prisma.PrismaClientKnownRequestError
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Provider is already in favorites.' });
    }
    logger.error({ err: error }, 'Add favorite error');
    res.status(500).json({ error: 'Failed to add favorite' });
  }
};

/**
 * Removes a provider from the homeowner's favorites.
 */
export const removeFavorite = async (req: AuthRequest, res: Response) => {
  // FIX: Check req.user and req.user.role
  if (!req.user || req.user.role !== UserRole.HOMEOWNER) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const userId = req.user.userId;
  const { providerProfileId } = req.params;

  try {
    await prisma.favorite.delete({
      where: {
        userId_providerProfileId: {
          userId,
          providerProfileId,
        },
      },
    });

    res.status(204).json({
      success: true,
      message: 'Provider removed from favorites.',
    });
  } catch (error) {
    // FIX: Use Prisma.PrismaClientKnownRequestError
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Favorite not found.' });
    }
    logger.error({ err: error }, 'Remove favorite error');
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
};
