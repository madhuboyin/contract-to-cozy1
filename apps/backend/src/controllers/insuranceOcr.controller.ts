// apps/backend/src/controllers/insuranceOcr.controller.ts
import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { extractInsuranceFieldsFromImage } from '../services/insuranceOcr.service';

function pickUploadedFile(req: CustomRequest): Express.Multer.File | undefined {
  const direct = (req as any).file as Express.Multer.File | undefined;
  if (direct?.buffer?.length) return direct;

  const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
  const fromImage = files?.image?.[0];
  if (fromImage?.buffer?.length) return fromImage;

  const fromFile = files?.file?.[0];
  if (fromFile?.buffer?.length) return fromFile;

  return undefined;
}

export async function extractInsuranceOcr(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.userId;
    const { propertyId, policyId } = req.params;

    if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

    const policy = await prisma.insurancePolicy.findFirst({
      where: {
        id: policyId,
        propertyId,
        homeownerProfile: { userId },
      },
      select: { id: true, propertyId: true },
    });

    if (!policy) throw new APIError('Insurance policy not found', 404, 'POLICY_NOT_FOUND');

    const file = pickUploadedFile(req);
    if (!file?.buffer?.length) throw new APIError('image file is required', 400, 'OCR_IMAGE_REQUIRED');

    const extracted = await extractInsuranceFieldsFromImage(file.buffer);

    return res.json({
      success: true,
      data: {
        policyId,
        provider: extracted.provider,
        extracted: {
          personalPropertyLimitCents: extracted.personalPropertyLimitCents,
          deductibleCents: extracted.deductibleCents,
        },
        signals: extracted.signals,
        rawText: extracted.rawText,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function confirmInsuranceOcr(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.userId;
    const { propertyId, policyId } = req.params;
    const {
      personalPropertyLimitCents,
      deductibleCents,
    } = (req.body || {}) as {
      personalPropertyLimitCents?: number | null;
      deductibleCents?: number | null;
    };

    if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

    const existing = await prisma.insurancePolicy.findFirst({
      where: {
        id: policyId,
        propertyId,
        homeownerProfile: { userId },
      },
      select: { id: true },
    });

    if (!existing) throw new APIError('Insurance policy not found', 404, 'POLICY_NOT_FOUND');

    const updateData: {
      personalPropertyLimitCents?: number | null;
      deductibleCents?: number | null;
      isVerified: boolean;
      lastVerifiedAt: Date;
    } = {
      isVerified: true,
      lastVerifiedAt: new Date(),
    };

    if (personalPropertyLimitCents !== undefined) {
      updateData.personalPropertyLimitCents = personalPropertyLimitCents;
    }
    if (deductibleCents !== undefined) {
      updateData.deductibleCents = deductibleCents;
    }

    const policy = await prisma.insurancePolicy.update({
      where: { id: policyId },
      data: updateData,
      select: {
        id: true,
        propertyId: true,
        personalPropertyLimitCents: true,
        deductibleCents: true,
        isVerified: true,
        lastVerifiedAt: true,
      },
    });

    return res.json({ success: true, data: policy });
  } catch (err) {
    next(err);
  }
}
