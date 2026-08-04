import { Router, type NextFunction, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter, uploadRateLimiter } from '../middleware/rateLimiter.middleware';
import type { CustomRequest } from '../types';
import { homeRecordsService } from '../services/homeRecords.service';

const router = Router();

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (allowedMimeTypes.has(file.mimetype)) return callback(null, true);
    callback(new Error('Only PDF, JPEG, PNG, and WEBP records are supported.'));
  },
});

const recordTypeSchema = z.enum([
  'WARRANTY', 'RECEIPT', 'MANUAL', 'INSPECTION_REPORT', 'INVOICE',
  'CONTRACT', 'PERMIT', 'INSURANCE_POLICY', 'CLAIM', 'PHOTO', 'OTHER',
]);
const sensitivitySchema = z.enum([
  'STANDARD', 'PERSONAL', 'FINANCIAL', 'INSURANCE', 'CLAIM', 'SECURITY', 'LEGAL',
]);
const visibilitySchema = z.enum(['HOUSEHOLD', 'OWNER_ONLY', 'RECIPIENT_SELECTED']);
const linkEntityTypeSchema = z.enum([
  'HOME_EVENT', 'INVENTORY_ITEM', 'MATERIAL_SPEC', 'PROJECT', 'WARRANTY',
  'INSURANCE_POLICY', 'CLAIM', 'PERMIT', 'PROPERTY_BRIEF', 'OTHER',
]);
const linkPurposeSchema = z.enum([
  'EVIDENCE', 'SOURCE', 'ATTACHMENT', 'APPROVAL', 'RECEIPT', 'WARRANTY', 'MANUAL',
]);

const createRecordSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(2000).optional(),
  recordType: recordTypeSchema,
  sensitivity: sensitivitySchema.default('STANDARD'),
  visibility: visibilitySchema.default('HOUSEHOLD'),
  retainUntil: z.string().datetime().optional(),
});

const createLinkSchema = z.object({
  entityType: linkEntityTypeSchema,
  entityId: z.string().uuid(),
  purpose: linkPurposeSchema.default('EVIDENCE'),
  versionId: z.string().uuid().nullable().optional(),
  label: z.string().trim().max(240).nullable().optional(),
});

const trashSchema = z.object({
  impactDecision: z.enum(['KEEP_LINKS', 'REMOVE_LINKS']).optional(),
});

const retentionSchema = z.object({
  retainUntil: z.string().datetime().nullable().optional(),
  legalHoldReason: z.string().trim().min(1).max(500).nullable().optional(),
}).refine(
  (value) => value.retainUntil !== undefined || value.legalHoldReason !== undefined,
  'At least one retention field is required.',
);

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new Error(result.error.issues.map((issue) => issue.message).join('; ')) as Error & {
      statusCode?: number;
      code?: string;
    };
    error.statusCode = 400;
    error.code = 'PROPERTY_RECORD_INPUT_INVALID';
    throw error;
  }
  return result.data;
}

router.use(apiRateLimiter);
router.use(authenticate);
router.use('/properties/:propertyId/records', propertyAuthMiddleware);

router.get('/properties/:propertyId/records', async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    const lifecycleStatus = typeof req.query.lifecycleStatus === 'string'
      ? req.query.lifecycleStatus
      : undefined;
    if (lifecycleStatus && !['ACTIVE', 'ARCHIVED', 'TRASHED'].includes(lifecycleStatus)) {
      return res.status(400).json({ success: false, code: 'PROPERTY_RECORD_LIFECYCLE_INVALID' });
    }
    const records = await homeRecordsService.list(
      req.params.propertyId,
      req.householdRole!,
      lifecycleStatus,
    );
    return res.json({ success: true, data: { records } });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/properties/:propertyId/records',
  requireHouseholdRole('CONTRIBUTOR'),
  uploadRateLimiter,
  upload.single('file'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'File is required.' });
      const input = parseOrThrow(createRecordSchema, req.body);
      const result = await homeRecordsService.create({
        propertyId: req.params.propertyId,
        userId: req.user!.userId,
        file: req.file,
        title: input.title,
        description: input.description,
        recordType: input.recordType,
        sensitivity: input.sensitivity,
        visibility: input.visibility,
        retainUntil: input.retainUntil ? new Date(input.retainUntil) : null,
      });
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  },
);

router.get('/properties/:propertyId/records/:recordId', async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    const record = await homeRecordsService.get(
      req.params.propertyId,
      req.params.recordId,
      req.householdRole!,
    );
    return res.json({ success: true, data: { record } });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/properties/:propertyId/records/:recordId/versions',
  requireHouseholdRole('CONTRIBUTOR'),
  uploadRateLimiter,
  upload.single('file'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'File is required.' });
      const version = await homeRecordsService.addVersion({
        propertyId: req.params.propertyId,
        recordId: req.params.recordId,
        userId: req.user!.userId,
        file: req.file,
      });
      return res.status(201).json({ success: true, data: { version: { ...version, storageKey: undefined } } });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/records/:recordId/links',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(createLinkSchema, req.body);
      const link = await homeRecordsService.addLink({
        propertyId: req.params.propertyId,
        recordId: req.params.recordId,
        userId: req.user!.userId,
        ...input,
      });
      return res.status(201).json({ success: true, data: { link } });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  '/properties/:propertyId/records/:recordId/links/:linkId',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      await homeRecordsService.removeLink(req.params.propertyId, req.params.recordId, req.params.linkId);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/records/:recordId/archive',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      await homeRecordsService.archive(req.params.propertyId, req.params.recordId);
      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/records/:recordId/trash',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(trashSchema, req.body ?? {});
      await homeRecordsService.trash({
        propertyId: req.params.propertyId,
        recordId: req.params.recordId,
        userId: req.user!.userId,
        impactDecision: input.impactDecision,
      });
      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/records/:recordId/restore',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      await homeRecordsService.restore(req.params.propertyId, req.params.recordId);
      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/properties/:propertyId/records/:recordId/retention',
  requireHouseholdRole('OWNER'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(retentionSchema, req.body ?? {});
      await homeRecordsService.setRetention({
        propertyId: req.params.propertyId,
        recordId: req.params.recordId,
        retainUntil: input.retainUntil === undefined
          ? undefined
          : input.retainUntil === null
            ? null
            : new Date(input.retainUntil),
        legalHoldReason: input.legalHoldReason,
      });
      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
