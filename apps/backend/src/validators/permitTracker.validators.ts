import { z } from 'zod';

const permitRecordCategory = z.enum([
  'BUILDING', 'ELECTRICAL', 'PLUMBING', 'MECHANICAL', 'STRUCTURAL',
  'ROOFING', 'ZONING', 'DEMOLITION', 'GRADING', 'FIRE', 'OTHER',
]);

const permitWorkType = z.enum([
  'HVAC_NEW', 'HVAC_REPLACEMENT', 'ELECTRICAL_PANEL', 'ELECTRICAL_WIRING',
  'PLUMBING_NEW', 'PLUMBING_REPAIR', 'ROOF_REPLACEMENT', 'ROOF_REPAIR',
  'ROOM_ADDITION', 'GARAGE_CONVERSION', 'ADU', 'BASEMENT_FINISH', 'DECK_PATIO',
  'FENCE', 'SWIMMING_POOL', 'SOLAR', 'WINDOWS_DOORS', 'FIREPLACE',
  'SEWER_WATER_LINE', 'STRUCTURAL_REPAIR', 'INTERIOR_REMODEL', 'EXTERIOR_REMODEL',
  'DEMOLITION', 'GRADING_DRAINAGE', 'OTHER',
]);

const permitRecordStatus = z.enum([
  'APPLIED', 'ISSUED', 'INSPECTION_PENDING', 'INSPECTION_FAILED',
  'FINALED', 'EXPIRED', 'VOIDED', 'UNKNOWN',
]);

const permitInspectionStatus = z.enum([
  'NOT_SCHEDULED', 'SCHEDULED', 'PASSED', 'FAILED', 'PARTIAL', 'CANCELLED',
]);

const permitDisclosureRisk = z.enum(['LOW', 'MEDIUM', 'HIGH']);

const inspectionStageType = z.enum([
  'PLAN_REVIEW', 'PRE_CONSTRUCTION', 'FOUNDATION', 'FRAMING',
  'ROUGH_IN', 'ELECTRICAL', 'PLUMBING', 'MECHANICAL', 'INSULATION', 'FINAL', 'OTHER',
]);

const strArr = z.union([z.string(), z.array(z.string())]).optional();
const lineageId = z.string().trim().min(1).max(160).optional();

export const TriggerFetchSchema = z.object({});

export const ListPermitsSchema = z.object({
  category: strArr,
  status: strArr,
  source: strArr,
  workType: strArr,
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});

export const CreateManualPermitSchema = z.object({
  permitNumber: z.string().optional(),
  category: permitRecordCategory,
  workTypes: z.array(permitWorkType).min(1),
  description: z.string().optional(),
  status: permitRecordStatus,
  applicantName: z.string().optional(),
  contractorName: z.string().optional(),
  contractorLicense: z.string().optional(),
  workLocation: z.string().optional(),
  applicationDate: z.string().datetime().optional(),
  issueDate: z.string().datetime().optional(),
  expirationDate: z.string().datetime().optional(),
  finaledDate: z.string().datetime().optional(),
  estimatedCostCents: z.number().int().min(0).optional(),
  finalCostCents: z.number().int().min(0).optional(),
  documentIds: z.array(z.string()).default([]),
  notes: z.string().optional(),
  renovationAdvisorSessionId: z.string().optional(),
  sourceActionId: lineageId,
  sourceEntityType: lineageId,
  sourceEntityId: lineageId,
  sourceJourneyId: lineageId,
});

export const UpdatePermitSchema = z.object({
  permitNumber: z.string().optional(),
  category: permitRecordCategory.optional(),
  workTypes: z.array(permitWorkType).min(1).optional(),
  description: z.string().optional(),
  status: permitRecordStatus.optional(),
  applicantName: z.string().optional(),
  contractorName: z.string().optional(),
  contractorLicense: z.string().optional(),
  workLocation: z.string().optional(),
  applicationDate: z.string().datetime().optional(),
  issueDate: z.string().datetime().optional(),
  expirationDate: z.string().datetime().optional(),
  finaledDate: z.string().datetime().optional(),
  estimatedCostCents: z.number().int().min(0).optional(),
  finalCostCents: z.number().int().min(0).optional(),
  documentIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
  isVerified: z.boolean().optional(),
});

export const AddInspectionMilestoneSchema = z.object({
  stageName: z.string().min(1).max(100),
  stageType: inspectionStageType,
  status: permitInspectionStatus.default('NOT_SCHEDULED'),
  scheduledDate: z.string().datetime().optional(),
  inspectedDate: z.string().datetime().optional(),
  inspectorNotes: z.string().optional(),
  isRequired: z.boolean().default(true),
});

export const UpdateInspectionMilestoneSchema = z.object({
  status: permitInspectionStatus.optional(),
  scheduledDate: z.string().datetime().optional(),
  inspectedDate: z.string().datetime().optional(),
  inspectorNotes: z.string().optional(),
  stageName: z.string().min(1).max(100).optional(),
  isRequired: z.boolean().optional(),
});

export const ListFlagsSchema = z.object({
  status: strArr,
  risk: strArr,
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});

export const UpdateFlagSchema = z.object({
  status: z.enum([
    'FLAGGED', 'INVESTIGATING', 'CONFIRMED_PERMITTED', 'CONFIRMED_UNPERMITTED',
    'WILL_REMEDIATE', 'REMEDIATED', 'DISMISSED',
  ]).optional(),
  disclosureRisk: permitDisclosureRisk.optional(),
  resolvedByPermitId: z.string().optional(),
  resolutionNotes: z.string().optional(),
});

export const CreateManualFlagSchema = z.object({
  workType: permitWorkType,
  flagReason: z.string().min(1).max(500),
  disclosureRisk: permitDisclosureRisk,
  inventoryItemId: z.string().optional(),
  resolutionNotes: z.string().optional(),
});

export const AdminCreateDataSourceSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ERROR', 'RATE_LIMITED']),
  adapterType: z.enum(['SOCRATA', 'ACCELA', 'CUSTOM']),
  baseUrl: z.string().url(),
  datasetId: z.string().optional(),
  apiKeyEnvVar: z.string().optional(),
  coverageType: z.enum(['CITY', 'COUNTY', 'STATE']),
  normalizedCoverageKey: z.string().min(1),
  fieldMappingJson: z.record(z.string(), z.string()),
  queryFilterJson: z.record(z.string(), z.unknown()).optional(),
});

export const AdminUpdateDataSourceSchema = AdminCreateDataSourceSchema.partial();

export const AdminPatchDataSourceStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'ERROR', 'RATE_LIMITED']),
});
