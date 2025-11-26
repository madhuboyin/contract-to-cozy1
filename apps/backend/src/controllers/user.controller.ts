import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../types/auth.types';

const prisma = new PrismaClient();

const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),  // Frontend sends "address"
  city: z.string().optional(),
  state: z.string().length(2).optional(),
  zipCode: z.string().length(5).optional(),
});

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { address: true },
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
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
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
        // FIX: Create new address record even if fields are partially provided.
        // Missing fields are explicitly set to '' to match frontend read logic (|| '').
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
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};