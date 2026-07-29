import { z } from 'zod';

const sourceType = z.enum([
  'ADVISOR_RULE', 'AUTHORITY_WEBSITE', 'AUTHORITY_RECORD', 'ASSOCIATION_DOCUMENT',
  'PROFESSIONAL_STATEMENT', 'USER_DOCUMENT', 'OTHER', 'UNKNOWN',
]);

export const GenerateRenovationRequirementsSchema = z.object({
  advisorSessionId: z.string().trim().min(1).optional(),
  ownerUserId: z.string().trim().min(1).optional(),
  dueAt: z.string().datetime().optional(),
});

export const UpsertRenovationAuthorityProfileSchema = z.object({
  countryCode: z.string().trim().length(2).default('US'),
  state: z.string().trim().min(2).max(80).optional(),
  county: z.string().trim().min(1).max(160).optional(),
  municipality: z.string().trim().min(1).max(160).optional(),
  postalCode: z.string().trim().min(3).max(20).optional(),
  authorityName: z.string().trim().min(1).max(240).optional(),
  authorityType: z.string().trim().min(1).max(160).optional(),
  authorityWebsite: z.string().url().optional(),
  sourceType: sourceType.default('UNKNOWN'),
  sourceReference: z.string().trim().min(1).max(1000).optional(),
  sourceDocumentId: z.string().trim().min(1).optional(),
  confirmedByName: z.string().trim().min(1).max(240).optional(),
  confirmedByOrg: z.string().trim().min(1).max(240).optional(),
  confirmed: z.boolean().default(false),
  effectiveAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().trim().min(1).max(5000).optional(),
}).superRefine((value, ctx) => {
  if (!value.confirmed) return;
  if (!value.authorityName) {
    ctx.addIssue({ code: 'custom', path: ['authorityName'], message: 'Confirmed jurisdiction requires an authority name.' });
  }
  if (!value.confirmedByName && !value.confirmedByOrg) {
    ctx.addIssue({ code: 'custom', path: ['confirmedByName'], message: 'Record who confirmed the jurisdiction.' });
  }
  if (
    value.sourceType === 'UNKNOWN'
    || value.sourceType === 'ADVISOR_RULE'
    || (!value.sourceReference && !value.sourceDocumentId && !value.authorityWebsite)
  ) {
    ctx.addIssue({ code: 'custom', path: ['sourceReference'], message: 'Confirmed jurisdiction requires a non-advisory source.' });
  }
});

export const DetermineRenovationRequirementSchema = z.object({
  applicability: z.enum(['UNKNOWN', 'APPLICABLE', 'NOT_APPLICABLE']),
  determination: z.enum(['UNDETERMINED', 'APPLIES', 'DOES_NOT_APPLY', 'CONDITIONAL']),
  truthLayer: z.enum([
    'ADVISORY', 'REPORTED', 'DOCUMENTED', 'SOURCE_OBSERVED',
    'AUTHORITY_CONFIRMED', 'PROFESSIONAL_CONFIRMED',
  ]),
  exactNextAction: z.string().trim().min(1).max(2000),
  ownerUserId: z.string().trim().min(1).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  isBlocking: z.boolean(),
  authorityName: z.string().trim().min(1).max(240).optional(),
  authorityType: z.string().trim().min(1).max(160).optional(),
  confirmedByName: z.string().trim().min(1).max(240).optional(),
  confirmedByOrg: z.string().trim().min(1).max(240).optional(),
  sourceType,
  sourceUrl: z.string().url().optional(),
  sourceSection: z.string().trim().min(1).max(1000).optional(),
  sourceDocumentId: z.string().trim().min(1).optional(),
  sourceObservedAt: z.string().datetime().optional(),
  sourceFreshUntil: z.string().datetime().optional(),
  evidenceNotes: z.string().trim().min(1).max(5000).optional(),
  expiresAt: z.string().datetime().optional(),
  relatedPermitId: z.string().trim().min(1).optional(),
  relatedHoaApprovalId: z.string().trim().min(1).optional(),
}).superRefine((value, ctx) => {
  const determined = value.determination !== 'UNDETERMINED';
  const authoritative = ['SOURCE_OBSERVED', 'AUTHORITY_CONFIRMED', 'PROFESSIONAL_CONFIRMED'].includes(value.truthLayer);
  if (determined && !authoritative) {
    ctx.addIssue({
      code: 'custom',
      path: ['truthLayer'],
      message: 'A requirement determination needs source-observed, authority-confirmed, or professional-confirmed evidence.',
    });
  }
  if (
    (value.determination === 'DOES_NOT_APPLY' && value.applicability !== 'NOT_APPLICABLE')
    || (['APPLIES', 'CONDITIONAL'].includes(value.determination) && value.applicability !== 'APPLICABLE')
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['applicability'],
      message: 'Applicability must agree with the recorded determination.',
    });
  }
  if (determined && (!value.confirmedByName && !value.confirmedByOrg)) {
    ctx.addIssue({ code: 'custom', path: ['confirmedByName'], message: 'Record who made the determination.' });
  }
  if (determined && (
    value.sourceType === 'UNKNOWN'
    || value.sourceType === 'ADVISOR_RULE'
    || (!value.sourceUrl && !value.sourceDocumentId && !value.sourceSection)
  )) {
    ctx.addIssue({ code: 'custom', path: ['sourceUrl'], message: 'A determination requires a non-advisory source reference.' });
  }
  if (determined && !value.sourceObservedAt) {
    ctx.addIssue({ code: 'custom', path: ['sourceObservedAt'], message: 'Record when the source was observed.' });
  }
  if (value.applicability === 'UNKNOWN' && (!value.ownerUserId || !value.dueAt)) {
    ctx.addIssue({
      code: 'custom',
      path: ['ownerUserId'],
      message: 'Unknown requirements need an accountable owner and due date.',
    });
  }
});
