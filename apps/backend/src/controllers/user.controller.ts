// apps/backend/src/controllers/user.controller.ts
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../types/auth.types';

const prisma = new PrismaClient();

const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  phone: z.string().optional(),
  street1: z.string().optional(),
  street2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().length(2, 'State must be 2 characters').optional(),
  zipCode: z.string().length(5, 'ZIP code must be 5 digits').optional(),
});

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        address: {
          select: {
            street1: true,
            street2: true,
            city: true,
            state: true,
            zipCode: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      street1: user.address?.street1 || null,
      street2: user.address?.street2 || null,
      city: user.address?.city || null,
      state: user.address?.state || null,
      zipCode: user.address?.zipCode || null,
    };

    res.json({ success: true, data: profile });
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

    const data = validation.data;

    const userFields: any = {};
    const addressFields: any = {};

    if (data.firstName !== undefined) userFields.firstName = data.firstName;
    if (data.lastName !== undefined) userFields.lastName = data.lastName;
    if (data.phone !== undefined) userFields.phone = data.phone;

    if (data.street1 !== undefined) addressFields.street1 = data.street1;
    if (data.street2 !== undefined) addressFields.street2 = data.street2;
    if (data.city !== undefined) addressFields.city = data.city;
    if (data.state !== undefined) addressFields.state = data.state;
    if (data.zipCode !== undefined) addressFields.zipCode = data.zipCode;

    const updateData: any = {
      ...userFields,
      updatedAt: new Date(),
    };

    if (Object.keys(addressFields).length > 0) {
      const existingAddress = await prisma.address.findUnique({
        where: { userId },
      });

      if (existingAddress) {
        updateData.address = {
          update: addressFields,
        };
      } else {
        if (addressFields.street1 && addressFields.city && addressFields.state && addressFields.zipCode) {
          updateData.address = {
            create: addressFields,
          };
        }
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        address: {
          select: {
            street1: true,
            street2: true,
            city: true,
            state: true,
            zipCode: true,
          },
        },
      },
    });

    const profile = {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      phone: updatedUser.phone,
      role: updatedUser.role,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
      street1: updatedUser.address?.street1 || null,
      street2: updatedUser.address?.street2 || null,
      city: updatedUser.address?.city || null,
      state: updatedUser.address?.state || null,
      zipCode: updatedUser.address?.zipCode || null,
    };

    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      data: profile 
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};