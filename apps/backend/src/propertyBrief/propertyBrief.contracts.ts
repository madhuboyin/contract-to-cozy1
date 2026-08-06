import { z } from 'zod';

export const PROPERTY_BRIEF_PURPOSES = [
  'HOMEOWNER_REFERENCE',
  'CONTRACTOR_SERVICE_PROFESSIONAL',
  'HOUSEHOLD_TRUSTED_CONTACT',
  'INSURER_CLAIM_SUPPORT',
  'PROSPECTIVE_BUYER',
  'LISTING_AGENT',
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
  // Slice 7's "fold Home Digital Will's authored content into a Property
  // Brief template" — emergency contacts + isEmergency-flagged Digital
  // Will entries, the same content emergencyPacket.service.ts's PDF
  // already surfaces. Only HOMEOWNER_REFERENCE/HOUSEHOLD_TRUSTED_CONTACT
  // allow it below (both use the full PROPERTY_BRIEF_SECTIONS spread) —
  // every buyer/agent/contractor/insurer purpose uses an explicit list
  // that deliberately omits it.
  'EMERGENCY_INFO',
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
    sensitiveSections: ['DOCUMENTS', 'CLAIMS', 'INSURANCE', 'EMERGENCY_INFO'],
  },
  CONTRACTOR_SERVICE_PROFESSIONAL: {
    label: 'Contractor or service professional',
    // Governed Material Specs handoff (Slice 5 of the continuity plan,
    // unblocked once Slice 7's share/access-log/revoke foundation
    // existed): a new contractor doing follow-up work needs to know the
    // exact paint code/tile/flooring already installed, and whether
    // related permits already exist, not just "verified history." Same
    // successor-value MATERIAL_SPECS assembly PROSPECTIVE_BUYER/
    // LISTING_AGENT already use (AS_BUILT + isActive only) — no new
    // service-layer code, purely widening this purpose's allowed sections.
    defaultSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'OPEN_UNKNOWNS', 'WARRANTIES', 'MATERIAL_SPECS', 'PERMITS'],
    allowedSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'DOCUMENTS', 'OPEN_UNKNOWNS', 'WARRANTIES', 'MATERIAL_SPECS', 'PERMITS'],
    sensitiveSections: ['DOCUMENTS'],
  },
  HOUSEHOLD_TRUSTED_CONTACT: {
    label: 'Household or trusted contact',
    // EMERGENCY_INFO defaults on for this purpose specifically — a trusted
    // contact (house-sitter, nearby family) is exactly who needs emergency
    // contacts and critical Digital Will entries, unlike every other
    // purpose. Still gated as sensitive below (real personal contact
    // info), so it still requires explicit acknowledgement before sharing.
    defaultSections: ['PROPERTY_FACTS', 'VERIFIED_HISTORY', 'OPEN_UNKNOWNS', 'EMERGENCY_INFO'],
    allowedSections: [...PROPERTY_BRIEF_SECTIONS],
    sensitiveSections: ['DOCUMENTS', 'CLAIMS', 'INSURANCE', 'EMERGENCY_INFO'],
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
  LISTING_AGENT: {
    label: 'Listing agent',
    // Slice 8's "agent/listing package composition" — same successor-value
    // section set as PROSPECTIVE_BUYER (a real-estate professional working
    // the listing needs the same disclosure-safe facts a buyer eventually
    // sees, not the seller's private claim/policy history), reusing the
    // common handoff infrastructure rather than duplicating it. The
    // distinct purpose value exists so recipient-facing copy, analytics,
    // and any future agent-specific section can diverge later without
    // affecting PROSPECTIVE_BUYER shares already sent.
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
