import { Router, type NextFunction, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { apiRateLimiter, uploadRateLimiter } from '../middleware/rateLimiter.middleware';
import { validateDocumentUpload, validateDocumentArrayUpload } from '../utils/documentValidator.util';
import type { CustomRequest } from '../types';
import { homeRecordsService } from '../services/homeRecords.service';
import { homeRecordsExtractionService } from '../services/homeRecordsExtraction.service';

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
  'CONTRACT', 'PERMIT', 'INSURANCE_POLICY', 'CLAIM', 'PHOTO',
  'DEED', 'TAX_DOCUMENT', 'UTILITY', 'DISCLOSURE', 'SURVEY', 'CLOSING_DOCUMENT',
  'OTHER',
]);
const sensitivitySchema = z.enum([
  'STANDARD', 'PERSONAL', 'FINANCIAL', 'INSURANCE', 'CLAIM', 'SECURITY', 'LEGAL',
]);
const visibilitySchema = z.enum(['HOUSEHOLD', 'OWNER_ONLY', 'RECIPIENT_SELECTED']);
const linkEntityTypeSchema = z.enum([
  'HOME_EVENT', 'INVENTORY_ITEM', 'MATERIAL_SPEC', 'PROJECT', 'WARRANTY',
  'INSURANCE_POLICY', 'CLAIM', 'PERMIT', 'PROPERTY_BRIEF', 'EXPENSE', 'OTHER',
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
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
});

const savedSearchViewSchema = z.enum(['ALL', 'NEEDS_REVIEW', 'EXPIRING']);
const createSavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  search: z.string().trim().max(200).optional(),
  recordType: recordTypeSchema.optional(),
  view: savedSearchViewSchema.default('ALL'),
});

const createBatchSchema = z.object({
  title: z.string().trim().min(1).max(240),
  recordType: recordTypeSchema,
  sensitivity: sensitivitySchema.default('STANDARD'),
  visibility: visibilitySchema.default('HOUSEHOLD'),
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

const effectivePeriodSchema = z.object({
  effectiveFrom: z.string().datetime().nullable().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
}).refine(
  (value) => value.effectiveFrom !== undefined || value.effectiveTo !== undefined,
  'At least one effective-period field is required.',
);

const reviewCandidateSchema = z.object({
  action: z.enum(['CONFIRM', 'CORRECT', 'REJECT']),
  reviewedValue: z.string().trim().max(2000).optional(),
});

const promoteFromVersionSchema = z.object({
  versionId: z.string().uuid(),
});

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
    const recordTypeRaw = typeof req.query.recordType === 'string' ? req.query.recordType : undefined;
    const recordTypeResult = recordTypeRaw ? recordTypeSchema.safeParse(recordTypeRaw) : undefined;
    if (recordTypeRaw && !recordTypeResult?.success) {
      return res.status(400).json({ success: false, code: 'PROPERTY_RECORD_TYPE_INVALID' });
    }
    const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 200) : undefined;

    const records = await homeRecordsService.list(
      req.params.propertyId,
      req.householdRole!,
      { lifecycleStatus, search, recordType: recordTypeResult?.data },
    );
    return res.json({ success: true, data: { records } });
  } catch (error) {
    return next(error);
  }
});

router.get('/properties/:propertyId/records/possible-version', async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    const title = typeof req.query.title === 'string' ? req.query.title.trim().slice(0, 240) : '';
    const recordTypeRaw = typeof req.query.recordType === 'string' ? req.query.recordType : undefined;
    const recordTypeResult = recordTypeRaw ? recordTypeSchema.safeParse(recordTypeRaw) : undefined;
    if (!title || !recordTypeResult?.success) {
      return res.status(400).json({ success: false, code: 'PROPERTY_RECORD_POSSIBLE_VERSION_INPUT_INVALID' });
    }
    const match = await homeRecordsService.checkPossibleVersion(req.params.propertyId, title, recordTypeResult.data);
    return res.json({ success: true, data: { match } });
  } catch (error) {
    return next(error);
  }
});

router.get(
  '/properties/:propertyId/records/saved-searches',
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const savedSearches = await homeRecordsService.listSavedSearches(req.params.propertyId);
      return res.json({ success: true, data: { savedSearches } });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/properties/:propertyId/records/storage-health',
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const storageHealth = await homeRecordsService.getStorageHealth(req.params.propertyId);
      return res.json({ success: true, data: { storageHealth } });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/records/saved-searches',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(createSavedSearchSchema, req.body ?? {});
      const savedSearch = await homeRecordsService.createSavedSearch({
        propertyId: req.params.propertyId,
        userId: req.user!.userId,
        name: input.name,
        search: input.search,
        recordType: input.recordType,
        view: input.view,
      });
      return res.status(201).json({ success: true, data: { savedSearch } });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  '/properties/:propertyId/records/saved-searches/:savedSearchId',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      await homeRecordsService.deleteSavedSearch(req.params.propertyId, req.params.savedSearchId);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/records',
  requireHouseholdRole('CONTRIBUTOR'),
  uploadRateLimiter,
  upload.single('file'),
  validateDocumentUpload,
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
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      });
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/records/batch',
  requireHouseholdRole('CONTRIBUTOR'),
  uploadRateLimiter,
  upload.array('files', 10),
  validateDocumentArrayUpload,
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one file is required.' });
      }
      const input = parseOrThrow(createBatchSchema, req.body);
      const result = await homeRecordsService.createBatch({
        propertyId: req.params.propertyId,
        userId: req.user!.userId,
        files,
        title: input.title,
        recordType: input.recordType,
        sensitivity: input.sensitivity,
        visibility: input.visibility,
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
  validateDocumentUpload,
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
  '/properties/:propertyId/records/:recordId/versions/:versionId/register-download',
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      await homeRecordsService.registerDownload({
        propertyId: req.params.propertyId,
        recordId: req.params.recordId,
        versionId: req.params.versionId,
        userId: req.user!.userId,
        role: req.householdRole!,
      });
      return res.status(201).json({ success: true });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/properties/:propertyId/records/:recordId/download-history',
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const downloadHistory = await homeRecordsService.listDownloadHistory(req.params.propertyId, req.params.recordId, req.householdRole!);
      return res.json({ success: true, data: { downloadHistory } });
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

router.patch(
  '/properties/:propertyId/records/:recordId/effective-period',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(effectivePeriodSchema, req.body ?? {});
      await homeRecordsService.setEffectivePeriod({
        propertyId: req.params.propertyId,
        recordId: req.params.recordId,
        effectiveFrom: input.effectiveFrom === undefined
          ? undefined
          : input.effectiveFrom === null ? null : new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo === undefined
          ? undefined
          : input.effectiveTo === null ? null : new Date(input.effectiveTo),
      });
      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/records/:recordId/versions/:versionId/extract',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const candidates = await homeRecordsExtractionService.runExtraction({
        propertyId: req.params.propertyId,
        recordId: req.params.recordId,
        versionId: req.params.versionId,
      });
      return res.status(201).json({ success: true, data: { candidates } });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/records/:recordId/extractions/:candidateId/review',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(reviewCandidateSchema, req.body ?? {});
      const candidate = await homeRecordsExtractionService.reviewCandidate({
        propertyId: req.params.propertyId,
        recordId: req.params.recordId,
        candidateId: req.params.candidateId,
        userId: req.user!.userId,
        action: input.action,
        reviewedValue: input.reviewedValue,
      });
      return res.json({ success: true, data: { candidate } });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/records/:recordId/extractions/promote-warranty',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(promoteFromVersionSchema, req.body ?? {});
      const warranty = await homeRecordsExtractionService.promoteWarranty({
        propertyId: req.params.propertyId,
        recordId: req.params.recordId,
        versionId: input.versionId,
        userId: req.user!.userId,
      });
      return res.status(201).json({ success: true, data: { warranty } });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/records/:recordId/extractions/promote-expense',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(promoteFromVersionSchema, req.body ?? {});
      const expense = await homeRecordsExtractionService.promoteExpense({
        propertyId: req.params.propertyId,
        recordId: req.params.recordId,
        versionId: input.versionId,
        userId: req.user!.userId,
      });
      return res.status(201).json({ success: true, data: { expense } });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/properties/:propertyId/records/:recordId/extractions/promote-insurance-policy',
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseOrThrow(promoteFromVersionSchema, req.body ?? {});
      const insurancePolicy = await homeRecordsExtractionService.promoteInsurancePolicy({
        propertyId: req.params.propertyId,
        recordId: req.params.recordId,
        versionId: input.versionId,
        userId: req.user!.userId,
      });
      return res.status(201).json({ success: true, data: { insurancePolicy } });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
