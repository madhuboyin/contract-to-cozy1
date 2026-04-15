// apps/backend/src/middleware/documentAuth.middleware.ts
//
// Verifies that the authenticated user owns the document identified by :id.
// Must be placed after authenticate in the middleware chain.
//
// On success, attaches to req:
//   (req as any).ownedDocument      — full Prisma document row
//   (req as any).homeownerProfileId — the homeowner profile id used for the check

import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { prisma } from '../lib/prisma';

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
      where: { id: documentId, uploadedBy: homeownerProfile.id },
    });

    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    (req as any).ownedDocument = document;
    (req as any).homeownerProfileId = homeownerProfile.id;
    next();
  } catch (error) {
    next(error);
  }
};
