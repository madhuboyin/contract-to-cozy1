// apps/backend/src/homeRenovationAdvisor/engine/licensing/licensingRules.data.ts
//
// Static v1 contractor licensing heuristics.
// Conservative national-level defaults. State contractor licensing databases
// can replace these via a real adapter later.

import {
  ContractorLicenseRequirementStatus,
  HomeRenovationType,
  RenovationLicenseCategoryType,
} from '@prisma/client';

export interface LicenseCategoryConfig {
  licenseCategoryType: RenovationLicenseCategoryType;
  isApplicable: boolean;
  note: string | null;
}

export interface LicensingRuleConfig {
  requirementStatus: ContractorLicenseRequirementStatus;
  consequenceSummary: string;
  plainLanguageSummary: string;
  categories: LicenseCategoryConfig[];
  notes: string | null;
}

export const LICENSING_RULES_BY_RENOVATION_TYPE: Record<HomeRenovationType, LicensingRuleConfig> = {
  [HomeRenovationType.ROOM_ADDITION]: {
    requirementStatus: ContractorLicenseRequirementStatus.REQUIRED,
    consequenceSummary:
      'Using an unlicensed contractor for a room addition can result in failed inspections, voided homeowners insurance, legal liability, and inability to sell the home with unpermitted work.',
    plainLanguageSummary:
      'A licensed general contractor is required in most states for this scope of work. Electrical and plumbing subcontractors must also hold state licenses.',
    categories: [
      { licenseCategoryType: RenovationLicenseCategoryType.GENERAL_CONTRACTOR, isApplicable: true, note: 'Primary license required in nearly all states' },
      { licenseCategoryType: RenovationLicenseCategoryType.ELECTRICAL, isApplicable: true, note: 'Licensed electrician required for new circuits' },
      { licenseCategoryType: RenovationLicenseCategoryType.PLUMBING, isApplicable: false, note: 'Only if plumbing extended to new room' },
    ],
    notes: null,
  },

  [HomeRenovationType.BATHROOM_ADDITION]: {
    requirementStatus: ContractorLicenseRequirementStatus.REQUIRED,
    consequenceSummary:
      'Unlicensed plumbing or electrical work in a bathroom is a code violation and poses water damage and safety risks.',
    plainLanguageSummary:
      'A licensed plumber and electrician are required for bathroom additions. A GC license is also typically required for the overall project.',
    categories: [
      { licenseCategoryType: RenovationLicenseCategoryType.GENERAL_CONTRACTOR, isApplicable: true, note: null },
      { licenseCategoryType: RenovationLicenseCategoryType.PLUMBING, isApplicable: true, note: 'Required for new drain/supply lines' },
      { licenseCategoryType: RenovationLicenseCategoryType.ELECTRICAL, isApplicable: true, note: 'Required for GFCI and circuits' },
    ],
    notes: null,
  },

  [HomeRenovationType.BATHROOM_FULL_REMODEL]: {
    requirementStatus: ContractorLicenseRequirementStatus.MAY_BE_REQUIRED,
    consequenceSummary:
      'If plumbing or electrical systems are moved or replaced, licensed tradespeople are required.',
    plainLanguageSummary:
      'Cosmetic remodels may not require licensed contractors in all states. However, if plumbing or electrical work is involved, licensed tradespeople are typically required.',
    categories: [
      { licenseCategoryType: RenovationLicenseCategoryType.PLUMBING, isApplicable: false, note: 'If drain/supply lines relocated' },
      { licenseCategoryType: RenovationLicenseCategoryType.ELECTRICAL, isApplicable: false, note: 'If circuits or outlets changed' },
    ],
    notes: 'Purely cosmetic work (tile, fixtures, vanity) typically does not require licensed contractors.',
  },

  [HomeRenovationType.GARAGE_CONVERSION]: {
    requirementStatus: ContractorLicenseRequirementStatus.REQUIRED,
    consequenceSummary:
      'Converting a garage to habitable space without a licensed contractor can result in safety code violations, failed inspections, and insurance issues.',
    plainLanguageSummary:
      'A licensed general contractor is typically required for garage-to-living-space conversions. Electrical and HVAC licenses may also be needed.',
    categories: [
      { licenseCategoryType: RenovationLicenseCategoryType.GENERAL_CONTRACTOR, isApplicable: true, note: null },
      { licenseCategoryType: RenovationLicenseCategoryType.ELECTRICAL, isApplicable: true, note: null },
      { licenseCategoryType: RenovationLicenseCategoryType.HVAC, isApplicable: false, note: 'If HVAC extended' },
    ],
    notes: null,
  },

  [HomeRenovationType.BASEMENT_FINISHING]: {
    requirementStatus: ContractorLicenseRequirementStatus.MAY_BE_REQUIRED,
    consequenceSummary:
      'Electrical work in a finished basement requires a licensed electrician. Additional trades may be required based on scope.',
    plainLanguageSummary:
      'Basement finishing typically requires a licensed electrician. If plumbing or HVAC is extended, those trade licenses are also needed.',
    categories: [
      { licenseCategoryType: RenovationLicenseCategoryType.ELECTRICAL, isApplicable: true, note: 'Required for any new circuits' },
      { licenseCategoryType: RenovationLicenseCategoryType.PLUMBING, isApplicable: false, note: 'If adding bathroom or wet bar' },
      { licenseCategoryType: RenovationLicenseCategoryType.HVAC, isApplicable: false, note: 'If HVAC extended to basement' },
    ],
    notes: null,
  },

  [HomeRenovationType.ADU_CONSTRUCTION]: {
    requirementStatus: ContractorLicenseRequirementStatus.REQUIRED,
    consequenceSummary:
      'ADU construction is highly regulated. Unlicensed work can result in demolition orders, failed occupancy permits, and significant fines.',
    plainLanguageSummary:
      'ADU construction requires licensed contractors for all major trades: general contracting, electrical, plumbing, and HVAC.',
    categories: [
      { licenseCategoryType: RenovationLicenseCategoryType.GENERAL_CONTRACTOR, isApplicable: true, note: null },
      { licenseCategoryType: RenovationLicenseCategoryType.ELECTRICAL, isApplicable: true, note: null },
      { licenseCategoryType: RenovationLicenseCategoryType.PLUMBING, isApplicable: true, note: null },
      { licenseCategoryType: RenovationLicenseCategoryType.HVAC, isApplicable: true, note: null },
    ],
    notes: 'Some states allow owner-builder ADU construction under limited conditions — verify locally.',
  },

  [HomeRenovationType.DECK_ADDITION]: {
    requirementStatus: ContractorLicenseRequirementStatus.MAY_BE_REQUIRED,
    consequenceSummary:
      'Unlicensed deck construction can result in structural failures. Many states require contractor licenses for elevated or attached decks.',
    plainLanguageSummary:
      'Deck contractor licensing requirements vary by state. For elevated or structurally complex decks, a licensed contractor is strongly recommended.',
    categories: [
      { licenseCategoryType: RenovationLicenseCategoryType.GENERAL_CONTRACTOR, isApplicable: false, note: 'Required for larger/attached decks in many states' },
      { licenseCategoryType: RenovationLicenseCategoryType.STRUCTURAL, isApplicable: false, note: 'If deck is attached to structural members' },
      { licenseCategoryType: RenovationLicenseCategoryType.ELECTRICAL, isApplicable: false, note: 'If outdoor outlets or lighting added' },
    ],
    notes: null,
  },

  [HomeRenovationType.PATIO_MAJOR_ADDITION]: {
    requirementStatus: ContractorLicenseRequirementStatus.MAY_BE_REQUIRED,
    consequenceSummary:
      'Contractor license requirements for patios vary widely. Electrical work always requires a licensed electrician.',
    plainLanguageSummary:
      'Most hardscape patio work does not require a licensed contractor in many states. If electrical work is involved, a licensed electrician is required.',
    categories: [
      { licenseCategoryType: RenovationLicenseCategoryType.ELECTRICAL, isApplicable: false, note: 'If outdoor electrical added' },
    ],
    notes: 'Purely hardscape (concrete, pavers) is typically unregulated for contractor licensing.',
  },

  [HomeRenovationType.STRUCTURAL_WALL_REMOVAL]: {
    requirementStatus: ContractorLicenseRequirementStatus.REQUIRED,
    consequenceSummary:
      'Removing a load-bearing wall without a licensed structural contractor can cause catastrophic structural failure.',
    plainLanguageSummary:
      'A licensed general contractor and structural engineer are required for load-bearing wall removal in virtually all jurisdictions.',
    categories: [
      { licenseCategoryType: RenovationLicenseCategoryType.GENERAL_CONTRACTOR, isApplicable: true, note: null },
      { licenseCategoryType: RenovationLicenseCategoryType.STRUCTURAL, isApplicable: true, note: 'Structural engineer review required' },
    ],
    notes: null,
  },

  [HomeRenovationType.STRUCTURAL_WALL_ADDITION]: {
    requirementStatus: ContractorLicenseRequirementStatus.REQUIRED,
    consequenceSummary:
      'Structural wall additions require licensed contractors and potentially structural engineering oversight.',
    plainLanguageSummary:
      'A licensed general contractor is typically required for structural wall additions.',
    categories: [
      { licenseCategoryType: RenovationLicenseCategoryType.GENERAL_CONTRACTOR, isApplicable: true, note: null },
      { licenseCategoryType: RenovationLicenseCategoryType.STRUCTURAL, isApplicable: false, note: 'Depending on complexity' },
    ],
    notes: null,
  },

  [HomeRenovationType.ROOF_REPLACEMENT]: {
    requirementStatus: ContractorLicenseRequirementStatus.REQUIRED,
    consequenceSummary:
      'Using an unlicensed roofer can void material warranties and homeowners insurance coverage. Many states require roofing licenses.',
    plainLanguageSummary:
      'A licensed roofing contractor is required in most states for full roof replacement.',
    categories: [
      { licenseCategoryType: RenovationLicenseCategoryType.ROOFING, isApplicable: true, note: 'Required in most states' },
    ],
    notes: 'Verify local requirements — some states require a general contractor license instead of a specialty roofing license.',
  },

  [HomeRenovationType.STRUCTURAL_REPAIR_MAJOR]: {
    requirementStatus: ContractorLicenseRequirementStatus.REQUIRED,
    consequenceSummary:
      'Major structural repairs require licensed contractors and structural engineering documentation.',
    plainLanguageSummary:
      'A licensed general contractor and structural engineer are required for major structural repairs.',
    categories: [
      { licenseCategoryType: RenovationLicenseCategoryType.GENERAL_CONTRACTOR, isApplicable: true, note: null },
      { licenseCategoryType: RenovationLicenseCategoryType.STRUCTURAL, isApplicable: true, note: 'Engineering oversight required' },
    ],
    notes: null,
  },
};

// Generic verification portal note
export const CONTRACTOR_VERIFICATION_NOTE =
  'Verify contractor license status at your state licensing board website before hiring.';

export const LICENSING_RULES_VERSION = 'v1.0.0-internal';
