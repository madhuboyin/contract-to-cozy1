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
  'APPLIED', 'UNDER_REVIEW', 'CORRECTION_REQUESTED', 'RESUBMITTED',
  'ISSUED', 'INSPECTION_PENDING', 'INSPECTION_FAILED',
  'FINALED', 'EXPIRED', 'VOIDED', 'UNKNOWN',
]);
const permitReportedStatus = z.enum([
  'DRAFT', 'PREPARING_APPLICATION', 'SUBMITTED', 'UNDER_REVIEW',
  'CORRECTION_REQUESTED', 'RESUBMITTED', 'ISSUED_REPORTED',
  'INSPECTIONS_IN_PROGRESS', 'CLOSEOUT_REQUESTED', 'COMPLETED_REPORTED',
  'EXPIRED_REPORTED', 'WITHDRAWN',
]);
const permitOfficialTruthLayer = z.enum(['SOURCE_OBSERVED', 'AUTHORITY_CONFIRMED']);
const permitOfficialSourceType = z.enum([
  'AUTHORITY_OPEN_DATA', 'AUTHORITY_PORTAL', 'AUTHORITY_DOCUMENT',
  'AUTHORITY_EMAIL', 'AUTHORITY_REPRESENTATIVE', 'OTHER',
]);

const permitInspectionStatus = z.enum([
  'NOT_SCHEDULED', 'SCHEDULED', 'PASSED', 'FAILED', 'PARTIAL', 'CANCELLED',
]);

const permitDisclosureRisk = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const historicalWorkOrigin = z.enum(['CURRENT_OWNER', 'PRIOR_OWNER', 'UNKNOWN']);
const historicalWorkStage = z.enum(['ALREADY_STARTED', 'COMPLETED', 'UNKNOWN']);
const recordSearchOutcome = z.enum([
  'NOT_SEARCHED',
  'MATCH_FOUND',
  'NOT_FOUND_IN_AVAILABLE_RECORDS',
  'RECORDS_UNAVAILABLE',
  'INCONCLUSIVE',
]);
const researchChannel = z.enum([
  'NONE',
  'OPEN_DATA',
  'DOCUMENT_REVIEW',
  'LICENSED_PROFESSIONAL',
  'MUNICIPAL_AUTHORITY',
  'REAL_ESTATE_ATTORNEY',
  'OTHER',
]);

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
  reportedStatus: permitReportedStatus.default('DRAFT'),
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
  reportedStatus: permitReportedStatus.optional(),
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
});

export const RecordOfficialPermitStatusSchema = z.object({
  status: permitRecordStatus,
  truthLayer: permitOfficialTruthLayer,
  sourceType: permitOfficialSourceType,
  sourceReference: z.string().trim().min(1).max(1000),
  evidenceDocumentId: z.string().trim().min(1).optional(),
  observedAt: z.string().datetime(),
  authorityReferenceNumber: z.string().trim().min(1).max(240).optional(),
  issueDate: z.string().datetime().optional(),
  expirationDate: z.string().datetime().optional(),
  finaledDate: z.string().datetime().optional(),
}).superRefine((value, ctx) => {
  if (value.status === 'FINALED' && !value.finaledDate) {
    ctx.addIssue({ code: 'custom', path: ['finaledDate'], message: 'Official finalization requires the authority finaled date.' });
  }
  if (value.status === 'ISSUED' && !value.issueDate) {
    ctx.addIssue({ code: 'custom', path: ['issueDate'], message: 'Official issuance requires the authority issue date.' });
  }
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
    'UNKNOWN', 'FLAGGED', 'INVESTIGATING', 'CONFIRMED_PERMITTED', 'CONFIRMED_UNPERMITTED',
    'WILL_REMEDIATE', 'REMEDIATED', 'DISMISSED',
  ]).optional(),
  disclosureRisk: permitDisclosureRisk.optional(),
  resolvedByPermitId: z.string().optional(),
  resolutionNotes: z.string().max(4000).optional(),
  workOrigin: historicalWorkOrigin.optional(),
  workStage: historicalWorkStage.optional(),
  workStartedAt: z.string().date().optional(),
  workCompletedAt: z.string().date().optional(),
  recordSearchOutcome: recordSearchOutcome.optional(),
  recordsCoverageDescription: z.string().min(1).max(2000).optional(),
  evidenceDocumentIds: z.array(z.string().min(1)).max(50).optional(),
  researchChannel: researchChannel.optional(),
  researchSourceReference: z.string().max(1000).optional(),
  authorityOutcome: z.enum(['CONFIRMED_PERMITTED', 'CONFIRMED_UNPERMITTED']).optional(),
  authorityObservedAt: z.string().date().optional(),
});

export const CreateManualFlagSchema = z.object({
  workType: permitWorkType,
  flagReason: z.string().min(1).max(2000).optional(),
  disclosureRisk: permitDisclosureRisk,
  inventoryItemId: z.string().optional(),
  resolutionNotes: z.string().max(4000).optional(),
  workOrigin: historicalWorkOrigin,
  workStage: historicalWorkStage,
  workStartedAt: z.string().date().optional(),
  workCompletedAt: z.string().date().optional(),
  recordSearchOutcome: recordSearchOutcome.default('NOT_SEARCHED'),
  recordsCoverageDescription: z.string().max(2000).optional(),
  evidenceDocumentIds: z.array(z.string().min(1)).max(50).default([]),
  researchChannel: researchChannel.default('NONE'),
  researchSourceReference: z.string().max(1000).optional(),
}).superRefine((value, ctx) => {
  if (
    value.recordSearchOutcome !== 'NOT_SEARCHED'
    && !value.recordsCoverageDescription?.trim()
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['recordsCoverageDescription'],
      message: 'Describe which records or documents were searched.',
    });
  }
});

export const CreateRemediationCaseSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  objective: z.string().min(1).max(2000).optional(),
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
