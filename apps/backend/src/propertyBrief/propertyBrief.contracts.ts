import { z } from 'zod';

export const PROPERTY_BRIEF_PURPOSES = [
  'HOMEOWNER_REFERENCE',
  'CONTRACTOR_SERVICE_PROFESSIONAL',
  'HOUSEHOLD_TRUSTED_CONTACT',
  'INSURER_CLAIM_SUPPORT',
  'PROSPECTIVE_BUYER',
] as const;

export const PROPERTY_BRIEF_SECTIONS = [
  'PROPERTY_FACTS',
  'VERIFIED_HISTORY',
  'DOCUMENTS',
  'OPEN_UNKNOWNS',
  'CLAIMS',
  'INSURANCE',
  'WARRANTIES',
  'MATERIAL_SPECS',
  'PERMITS',
] as const;

export type PropertyBriefPurposeInput = (typeof PROPERTY_BRIEF_PURPOSES)[number];
export type PropertyBriefSectionInput = (typeof PROPERTY_BRIEF_SECTIONS)[number];

export const PROPERTY_BRIEF_LIMITATION =
  'This homeowner-assembled Property Brief is not an inspection, appraisal, certification, title report, professional opinion, or comprehensive disclosure. It includes only the selected records described here, may contain unknown or incomplete information, and must not replace independent professional review.';

export const PROPERTY_BRIEF_TEMPLATES: Record<PropertyBriefPurposeInput, {
  label: string;
  defaultSections: PropertyBriefSectionInput[];
  allowedSections: PropertyBriefSectionInput[];
  sensitiveSections: PropertyBriefSectionInput[];
}> = {
  HOMEOWNER_REFERENCE: {
    label: 'Homeowner reference',
    defaultSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'OPEN_UNKNOWNS', 'WARRANTIES', 'MATERIAL_SPECS', 'PERMITS'],
    allowedSections: [...PROPERTY_BRIEF_SECTIONS],
    sensitiveSections: ['DOCUMENTS', 'CLAIMS', 'INSURANCE'],
  },
  CONTRACTOR_SERVICE_PROFESSIONAL: {
    label: 'Contractor or service professional',
    defaultSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'OPEN_UNKNOWNS'],
    allowedSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'DOCUMENTS', 'OPEN_UNKNOWNS'],
    sensitiveSections: ['DOCUMENTS'],
  },
  HOUSEHOLD_TRUSTED_CONTACT: {
    label: 'Household or trusted contact',
    defaultSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'OPEN_UNKNOWNS'],
    allowedSections: [...PROPERTY_BRIEF_SECTIONS],
    sensitiveSections: ['DOCUMENTS', 'CLAIMS', 'INSURANCE'],
  },
  INSURER_CLAIM_SUPPORT: {
    label: 'Insurer or claim support',
    defaultSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'OPEN_UNKNOWNS'],
    allowedSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'DOCUMENTS', 'OPEN_UNKNOWNS', 'CLAIMS', 'INSURANCE'],
    sensitiveSections: ['DOCUMENTS', 'CLAIMS', 'INSURANCE'],
  },
  PROSPECTIVE_BUYER: {
    label: 'Prospective buyer',
    // Successor value only — claims/insurance stay off allowedSections
    // entirely for this purpose (a buyer should not inherit the seller's
    // claim or policy history), not just excluded by default.
    defaultSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'OPEN_UNKNOWNS', 'WARRANTIES', 'MATERIAL_SPECS', 'PERMITS'],
    allowedSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'DOCUMENTS', 'OPEN_UNKNOWNS', 'WARRANTIES', 'MATERIAL_SPECS', 'PERMITS'],
    sensitiveSections: ['DOCUMENTS'],
  },
};

const purpose = z.enum(PROPERTY_BRIEF_PURPOSES);
const section = z.enum(PROPERTY_BRIEF_SECTIONS);

export const createPropertyBriefSchema = z.object({
  purpose,
  title: z.string().trim().min(3).max(160).optional(),
  selectedSections: z.array(section).min(1).max(PROPERTY_BRIEF_SECTIONS.length),
  documentIds: z.array(z.string().uuid()).max(25).default([]),
  acknowledgeSensitiveSections: z.boolean().default(false),
}).superRefine((value, ctx) => {
  const template = PROPERTY_BRIEF_TEMPLATES[value.purpose];
  const disallowed = value.selectedSections.filter((item) => !template.allowedSections.includes(item));
  if (disallowed.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `These sections are not allowed for this purpose: ${disallowed.join(', ')}`,
      path: ['selectedSections'],
    });
  }
  const sensitive = value.selectedSections.filter((item) => template.sensitiveSections.includes(item));
  if (sensitive.length > 0 && !value.acknowledgeSensitiveSections) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Sensitive sections require explicit acknowledgement.',
      path: ['acknowledgeSensitiveSections'],
    });
  }
  if (value.documentIds.length > 0 && !value.selectedSections.includes('DOCUMENTS')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Document selections require the Documents section.',
      path: ['documentIds'],
    });
  }
});

export const createPropertyBriefShareSchema = z.object({
  expiresInDays: z.coerce.number().int().min(1).max(90),
  downloadPolicy: z.enum(['VIEW_ONLY', 'ALLOW_DOWNLOAD']).default('VIEW_ONLY'),
  previewAcknowledged: z.literal(true),
  limitationAcknowledged: z.literal(true),
  sensitiveDataAcknowledged: z.literal(true),
  // Sharing selected home information externally is a decision that affects
  // every household member with access to this property, not just the
  // person creating the share — require an explicit acknowledgment rather
  // than letting one member unilaterally share without any record that they
  // considered the others. Required only when another household member
  // actually exists (see createPropertyBriefShare) — enforced there, not
  // here, since that check needs a DB lookup Zod can't do.
  householdConsentAcknowledged: z.boolean().optional(),
  recipientName: z.string().trim().min(1).max(120).optional(),
  recipientEmail: z.string().trim().email().max(200).optional(),
});
