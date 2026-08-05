import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { CustomRequest } from '../types';
import {
  createPropertyBriefSchema,
  createPropertyBriefShareSchema,
} from './propertyBrief.contracts';
import {
  createPropertyBrief,
  createPropertyBriefShare,
  getPropertyBriefPreview,
  getPropertyBriefTemplates,
  getSharedPropertyBrief,
  listEligiblePropertyBriefDocuments,
  listPropertyBriefs,
  revokePropertyBriefShare,
  renderPropertyBriefPdf,
  testPropertyBriefShareAccess,
} from './propertyBrief.service';

const router = Router();
const uuid = z.string().uuid();
const token = z.string().min(32).max(200);

router.use(apiRateLimiter);

router.get('/property-briefs/templates', authenticate, async (_req, res, next) => {
  try {
    return res.json({ success: true, data: await getPropertyBriefTemplates() });
  } catch (error) {
    return next(error);
  }
});

router.get('/property-briefs/shares/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.json({
      success: true,
      data: await getSharedPropertyBrief({
        token: token.parse(req.params.token),
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/property-briefs/shares/:token/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const brief = await getSharedPropertyBrief({
      token: token.parse(req.params.token),
      accessKind: 'DOWNLOAD',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    const filename = `${brief.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'property-brief'}.pdf`;
    const pdf = await renderPropertyBriefPdf(brief);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(pdf));
  } catch (error) {
    return next(error);
  }
});

router.get(
  '/properties/:propertyId/property-briefs/eligible-documents',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      return res.json({
        success: true,
        data: await listEligiblePropertyBriefDocuments(req.params.propertyId),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/properties/:propertyId/property-briefs',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.userId) return res.status(401).json({ success: false });
      return res.json({
        success: true,
        data: await listPropertyBriefs(req.params.propertyId, req.user.userId),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/property-briefs',
  authenticate,
  propertyAuthMiddleware,
  validateBody(createPropertyBriefSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.userId) return res.status(401).json({ success: false });
      return res.status(201).json({
        success: true,
        data: await createPropertyBrief({
          propertyId: req.params.propertyId,
          userId: req.user.userId,
          purpose: req.body.purpose,
          title: req.body.title,
          selectedSections: req.body.selectedSections,
          documentIds: req.body.documentIds,
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/properties/:propertyId/property-briefs/:briefId/preview',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.userId) return res.status(401).json({ success: false });
      return res.json({
        success: true,
        data: await getPropertyBriefPreview(
          req.params.propertyId,
          req.user.userId,
          uuid.parse(req.params.briefId),
        ),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/property-briefs/:briefId/share',
  authenticate,
  propertyAuthMiddleware,
  validateBody(createPropertyBriefShareSchema),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.userId) return res.status(401).json({ success: false });
      const result = await createPropertyBriefShare({
        propertyId: req.params.propertyId,
        userId: req.user.userId,
        briefId: uuid.parse(req.params.briefId),
        expiresInDays: req.body.expiresInDays,
        downloadPolicy: req.body.downloadPolicy,
        sensitiveDataAcknowledged: req.body.sensitiveDataAcknowledged,
        householdConsentAcknowledged: req.body.householdConsentAcknowledged,
        recipientName: req.body.recipientName,
        recipientEmail: req.body.recipientEmail,
      });
      const origin = req.headers.origin || process.env.FRONTEND_URL || '';
      return res.status(201).json({
        success: true,
        data: {
          ...result,
          shareUrl: `${origin}/property-brief/share/${encodeURIComponent(result.token)}`,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/property-briefs/:briefId/shares/:shareId/revoke',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.userId) return res.status(401).json({ success: false });
      return res.json({
        success: true,
        data: await revokePropertyBriefShare({
          propertyId: req.params.propertyId,
          userId: req.user.userId,
          briefId: uuid.parse(req.params.briefId),
          shareId: uuid.parse(req.params.shareId),
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/property-briefs/:briefId/shares/:shareId/test',
  authenticate,
  propertyAuthMiddleware,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.userId) return res.status(401).json({ success: false });
      return res.json({
        success: true,
        data: await testPropertyBriefShareAccess({
          propertyId: req.params.propertyId,
          userId: req.user.userId,
          briefId: uuid.parse(req.params.briefId),
          shareId: uuid.parse(req.params.shareId),
        }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
