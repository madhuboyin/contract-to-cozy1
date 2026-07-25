import { z } from 'zod';

const reportType = z.enum([
  'GENERAL','ROOF','HVAC','SEWER','ELECTRICAL','FOUNDATION',
  'PRE_PURCHASE','PRE_LISTING','ANNUAL','OTHER',
]);

const homeSystem = z.enum([
  'ROOF','EXTERIOR','FOUNDATION','BASEMENT_CRAWLSPACE','STRUCTURAL',
  'ELECTRICAL','PLUMBING','HVAC','INTERIOR','ATTIC_INSULATION',
  'APPLIANCES','GARAGE','SITE_GRADING',
]);

const conditionRating = z.enum(['GOOD','FAIR','POOR','SAFETY_CONCERN']);
const severity = z.enum(['SAFETY','MAJOR','MINOR','MONITOR','INFORMATIONAL']);
const resolutionMethod = z.enum([
  'CONTRACTOR_WORK','DIY','SELLER_REPAIR','CREDITED_AT_CLOSING','DISMISSED',
]);

const strArr = z.union([z.string(), z.array(z.string())]).optional();

// Upload is multipart; body fields come in as strings from multer
export const UploadReportBodySchema = z.object({
  reportType,
  inspectionDate: z.string().datetime(),
  inspectorName: z.string().optional(),
  inspectorLicense: z.string().optional(),
  inspectorCompany: z.string().optional(),
  sourceActionId: z.string().trim().min(1).max(160).optional(),
  sourceEntityType: z.string().trim().min(1).max(160).optional(),
  sourceEntityId: z.string().trim().min(1).max(160).optional(),
  sourceJourneyId: z.string().trim().min(1).max(160).optional(),
});

export const UpdateFindingSchema = z.object({
  homeSystem: homeSystem.optional(),
  subsystem: z.string().optional(),
  location: z.string().optional(),
  conditionRating: conditionRating.optional(),
  severity: severity.optional(),
  aiInterpretation: z.string().optional(),
  estimatedCostCentsLow: z.number().int().min(0).optional(),
  estimatedCostCentsHigh: z.number().int().min(0).optional(),
});

export const DismissFindingSchema = z.object({
  reason: z.string().optional(),
});

export const ResolveFindingSchema = z.object({
  resolutionMethod,
  resolutionNotes: z.string().optional(),
  resolutionCostCents: z.number().int().min(0).optional(),
  warrantyExpiresAt: z.string().datetime().optional(),
});

export const ListOpenItemsSchema = z.object({
  severity: strArr,
  homeSystem: strArr,
  reportId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const NegotiationPackageSchema = z.object({
  findingIds: z.array(z.string()).min(1),
  decisions: z.record(
    z.string(),
    z.enum(['negotiate_credit', 'request_repair', 'accept_as_is']),
  ),
});

export const FixDisclosureDecisionsSchema = z.object({
  decisions: z.array(
    z.object({
      findingId: z.string(),
      decision: z.enum(['FIX', 'DISCLOSE_PRICE_ADJUST', 'DISCLOSE_CREDIT']),
      estimatedFixCostCents: z.number().int().min(0).optional(),
      sellerNote: z.string().optional(),
    }),
  ),
});
