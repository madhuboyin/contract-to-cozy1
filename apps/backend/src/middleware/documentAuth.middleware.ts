// apps/backend/src/middleware/documentAuth.middleware.ts
//
// Verifies that the authenticated user may access the document identified by
// :id. Must be placed after authenticate in the middleware chain.
//
// A property-scoped document is accessible to any household member with at
// least CONTRIBUTOR role, not just whoever happened to upload it — a
// document is property evidence, not the uploader's personal file, once it
// is linked to a property. Documents with no propertyId (booking-scoped,
// or uploaded before a property link existed) fall back to the original
// uploader-only check since there is no property to resolve household
// access against.
//
// On success, attaches to req:
//   (req as any).ownedDocument      — full Prisma document row
//   (req as any).homeownerProfileId — the homeowner profile id used for the check

import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { prisma } from '../lib/prisma';
import { resolvePropertyAccess, ROLE_RANK } from '../services/propertyAccess.service';

export const requireDocumentOwnership = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const documentId = req.params.id;

    const homeownerProfile = await prisma.homeownerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!homeownerProfile) {
      res.status(404).json({ success: false, message: 'Homeowner profile not found' });
      return;
    }

    const document = await prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });

    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    const isUploader = document.uploadedBy === homeownerProfile.id;

    if (!isUploader) {
      if (!document.propertyId) {
        res.status(404).json({ success: false, message: 'Document not found' });
        return;
      }

      const access = await resolvePropertyAccess(userId, document.propertyId);
      if (!access || ROLE_RANK[access.role] < ROLE_RANK.CONTRIBUTOR) {
        res.status(404).json({ success: false, message: 'Document not found' });
        return;
      }
    }

    (req as any).ownedDocument = document;
    (req as any).homeownerProfileId = homeownerProfile.id;
    next();
  } catch (error) {
    next(error);
  }
};
