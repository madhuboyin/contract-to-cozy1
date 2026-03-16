// apps/backend/src/homeRenovationAdvisor/engine/permit/permitRules.data.ts
//
// Static v1 permit heuristics by renovation type.
// These are conservative, nationally-applicable defaults.
// They can be replaced by a real provider (e.g. Symbium, PermitFlow) later.
//
// Sources: general US building code guidance; actual requirements vary by jurisdiction.

import {
  HomeRenovationType,
  PermitRequirementStatus,
  RenovationInspectionStageType,
  RenovationPermitType,
} from '@prisma/client';

export interface PermitTypeConfig {
  permitType: RenovationPermitType;
  isRequired: boolean;
  note: string | null;
}

export interface InspectionStageConfig {
  inspectionStageType: RenovationInspectionStageType;
  isLikelyRequired: boolean;
  note: string | null;
}

export interface PermitRuleConfig {
  requirementStatus: PermitRequirementStatus;
  permitCostMin: number;     // USD
  permitCostMax: number;     // USD
  timelineMinDays: number;
  timelineMaxDays: number;
  permitTypes: PermitTypeConfig[];
  inspectionStages: InspectionStageConfig[];
  summary: string;
  notes: string | null;
}

export const PERMIT_RULES_BY_RENOVATION_TYPE: Record<HomeRenovationType, PermitRuleConfig> = {
  [HomeRenovationType.ROOM_ADDITION]: {
    requirementStatus: PermitRequirementStatus.REQUIRED,
    permitCostMin: 500,
    permitCostMax: 3500,
    timelineMinDays: 14,
    timelineMaxDays: 90,
    permitTypes: [
      { permitType: RenovationPermitType.BUILDING, isRequired: true, note: 'Required for structural work' },
      { permitType: RenovationPermitType.ELECTRICAL, isRequired: true, note: 'Required if new circuits added' },
      { permitType: RenovationPermitType.PLUMBING, isRequired: false, note: 'Required only if plumbing extended' },
    ],
    inspectionStages: [
      { inspectionStageType: RenovationInspectionStageType.PLAN_REVIEW, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.FOUNDATION, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.FRAMING, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.ROUGH_IN, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.INSULATION, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.FINAL, isLikelyRequired: true, note: null },
    ],
    summary: 'Room additions almost universally require a building permit. Expect plan review, framing, and final inspections.',
    notes: 'Permit cost varies significantly by square footage and jurisdiction.',
  },

  [HomeRenovationType.BATHROOM_ADDITION]: {
    requirementStatus: PermitRequirementStatus.REQUIRED,
    permitCostMin: 300,
    permitCostMax: 2000,
    timelineMinDays: 10,
    timelineMaxDays: 60,
    permitTypes: [
      { permitType: RenovationPermitType.BUILDING, isRequired: true, note: null },
      { permitType: RenovationPermitType.PLUMBING, isRequired: true, note: 'Required for new drain/supply lines' },
      { permitType: RenovationPermitType.ELECTRICAL, isRequired: true, note: 'GFCI outlets required in bathrooms' },
      { permitType: RenovationPermitType.MECHANICAL, isRequired: false, note: 'If exhaust fan added' },
    ],
    inspectionStages: [
      { inspectionStageType: RenovationInspectionStageType.PLAN_REVIEW, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.ROUGH_IN, isLikelyRequired: true, note: 'Plumbing rough-in' },
      { inspectionStageType: RenovationInspectionStageType.FINAL, isLikelyRequired: true, note: null },
    ],
    summary: 'Adding a new bathroom requires building, plumbing, and electrical permits in most jurisdictions.',
    notes: null,
  },

  [HomeRenovationType.BATHROOM_FULL_REMODEL]: {
    requirementStatus: PermitRequirementStatus.LIKELY_REQUIRED,
    permitCostMin: 150,
    permitCostMax: 1200,
    timelineMinDays: 5,
    timelineMaxDays: 30,
    permitTypes: [
      { permitType: RenovationPermitType.PLUMBING, isRequired: false, note: 'If moving or replacing drain/supply lines' },
      { permitType: RenovationPermitType.ELECTRICAL, isRequired: false, note: 'If adding/moving circuits or outlets' },
    ],
    inspectionStages: [
      { inspectionStageType: RenovationInspectionStageType.ROUGH_IN, isLikelyRequired: false, note: 'Only if plumbing relocated' },
      { inspectionStageType: RenovationInspectionStageType.FINAL, isLikelyRequired: false, note: null },
    ],
    summary: 'A full remodel may or may not require permits depending on whether plumbing or electrical systems are moved or replaced. Cosmetic work typically does not require permits.',
    notes: 'Consult local building department if structural or system changes are planned.',
  },

  [HomeRenovationType.GARAGE_CONVERSION]: {
    requirementStatus: PermitRequirementStatus.REQUIRED,
    permitCostMin: 400,
    permitCostMax: 3000,
    timelineMinDays: 14,
    timelineMaxDays: 60,
    permitTypes: [
      { permitType: RenovationPermitType.BUILDING, isRequired: true, note: null },
      { permitType: RenovationPermitType.ELECTRICAL, isRequired: true, note: null },
      { permitType: RenovationPermitType.PLUMBING, isRequired: false, note: 'If converting to ADU/living space with bathroom' },
      { permitType: RenovationPermitType.MECHANICAL, isRequired: false, note: 'If HVAC extended' },
    ],
    inspectionStages: [
      { inspectionStageType: RenovationInspectionStageType.PLAN_REVIEW, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.FRAMING, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.INSULATION, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.FINAL, isLikelyRequired: true, note: null },
    ],
    summary: 'Garage conversions to habitable space require a building permit and must meet local zoning and building codes.',
    notes: 'Check local zoning for ADU eligibility before starting.',
  },

  [HomeRenovationType.BASEMENT_FINISHING]: {
    requirementStatus: PermitRequirementStatus.LIKELY_REQUIRED,
    permitCostMin: 300,
    permitCostMax: 2500,
    timelineMinDays: 10,
    timelineMaxDays: 45,
    permitTypes: [
      { permitType: RenovationPermitType.BUILDING, isRequired: false, note: 'Required if framing or structural work' },
      { permitType: RenovationPermitType.ELECTRICAL, isRequired: true, note: 'Required for any new circuits' },
      { permitType: RenovationPermitType.PLUMBING, isRequired: false, note: 'If adding bathroom or wet bar' },
      { permitType: RenovationPermitType.MECHANICAL, isRequired: false, note: 'If HVAC extended' },
    ],
    inspectionStages: [
      { inspectionStageType: RenovationInspectionStageType.FRAMING, isLikelyRequired: false, note: null },
      { inspectionStageType: RenovationInspectionStageType.INSULATION, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.ELECTRICAL, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.FINAL, isLikelyRequired: true, note: null },
    ],
    summary: 'Basement finishing typically requires permits when adding electrical, framing, or plumbing systems. Scope determines exact requirements.',
    notes: null,
  },

  [HomeRenovationType.ADU_CONSTRUCTION]: {
    requirementStatus: PermitRequirementStatus.REQUIRED,
    permitCostMin: 800,
    permitCostMax: 6000,
    timelineMinDays: 30,
    timelineMaxDays: 180,
    permitTypes: [
      { permitType: RenovationPermitType.BUILDING, isRequired: true, note: null },
      { permitType: RenovationPermitType.ELECTRICAL, isRequired: true, note: null },
      { permitType: RenovationPermitType.PLUMBING, isRequired: true, note: null },
      { permitType: RenovationPermitType.MECHANICAL, isRequired: true, note: null },
      { permitType: RenovationPermitType.ZONING, isRequired: false, note: 'Conditional use approval may be required' },
    ],
    inspectionStages: [
      { inspectionStageType: RenovationInspectionStageType.PLAN_REVIEW, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.FOUNDATION, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.FRAMING, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.ROUGH_IN, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.INSULATION, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.FINAL, isLikelyRequired: true, note: null },
    ],
    summary: 'ADU construction requires full building, electrical, plumbing, and mechanical permits. Plan review is required and timelines can be lengthy in high-demand areas.',
    notes: 'California and several other states have streamlined ADU permitting. Check local rules carefully.',
  },

  [HomeRenovationType.DECK_ADDITION]: {
    requirementStatus: PermitRequirementStatus.LIKELY_REQUIRED,
    permitCostMin: 150,
    permitCostMax: 1500,
    timelineMinDays: 7,
    timelineMaxDays: 30,
    permitTypes: [
      { permitType: RenovationPermitType.BUILDING, isRequired: false, note: 'Required if deck is attached or above 30 inches' },
      { permitType: RenovationPermitType.STRUCTURAL, isRequired: false, note: 'If attached to home' },
      { permitType: RenovationPermitType.ELECTRICAL, isRequired: false, note: 'If lighting or outlets added' },
    ],
    inspectionStages: [
      { inspectionStageType: RenovationInspectionStageType.FOUNDATION, isLikelyRequired: false, note: 'For footings if required' },
      { inspectionStageType: RenovationInspectionStageType.FRAMING, isLikelyRequired: false, note: null },
      { inspectionStageType: RenovationInspectionStageType.FINAL, isLikelyRequired: true, note: null },
    ],
    summary: 'Deck permits are typically required for attached decks or those over 30 inches above grade. Requirements vary significantly by municipality.',
    notes: 'Detached freestanding decks under 200 sq ft may be exempt in some jurisdictions.',
  },

  [HomeRenovationType.PATIO_MAJOR_ADDITION]: {
    requirementStatus: PermitRequirementStatus.LIKELY_REQUIRED,
    permitCostMin: 100,
    permitCostMax: 1200,
    timelineMinDays: 5,
    timelineMaxDays: 21,
    permitTypes: [
      { permitType: RenovationPermitType.BUILDING, isRequired: false, note: 'Varies by scope and attachment' },
      { permitType: RenovationPermitType.ELECTRICAL, isRequired: false, note: 'If electrical fixtures added' },
    ],
    inspectionStages: [
      { inspectionStageType: RenovationInspectionStageType.FINAL, isLikelyRequired: false, note: null },
    ],
    summary: 'Major patio additions may require a permit depending on size, attachment, and whether utilities are involved.',
    notes: 'Purely hardscaping work (concrete, pavers) often does not require a permit but check local rules.',
  },

  [HomeRenovationType.STRUCTURAL_WALL_REMOVAL]: {
    requirementStatus: PermitRequirementStatus.REQUIRED,
    permitCostMin: 200,
    permitCostMax: 1500,
    timelineMinDays: 5,
    timelineMaxDays: 30,
    permitTypes: [
      { permitType: RenovationPermitType.BUILDING, isRequired: true, note: null },
      { permitType: RenovationPermitType.STRUCTURAL, isRequired: true, note: 'Engineering review required for load-bearing walls' },
    ],
    inspectionStages: [
      { inspectionStageType: RenovationInspectionStageType.PLAN_REVIEW, isLikelyRequired: true, note: 'Structural engineer stamp often required' },
      { inspectionStageType: RenovationInspectionStageType.FRAMING, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.FINAL, isLikelyRequired: true, note: null },
    ],
    summary: 'Removing a structural (load-bearing) wall requires a building permit and structural engineering review in virtually all jurisdictions.',
    notes: 'Non-load-bearing partition removal may not require a permit — confirm with local building dept.',
  },

  [HomeRenovationType.STRUCTURAL_WALL_ADDITION]: {
    requirementStatus: PermitRequirementStatus.REQUIRED,
    permitCostMin: 200,
    permitCostMax: 1500,
    timelineMinDays: 5,
    timelineMaxDays: 30,
    permitTypes: [
      { permitType: RenovationPermitType.BUILDING, isRequired: true, note: null },
      { permitType: RenovationPermitType.STRUCTURAL, isRequired: true, note: null },
    ],
    inspectionStages: [
      { inspectionStageType: RenovationInspectionStageType.FRAMING, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.FINAL, isLikelyRequired: true, note: null },
    ],
    summary: 'Adding structural walls requires a building permit and may require structural engineering review.',
    notes: null,
  },

  [HomeRenovationType.ROOF_REPLACEMENT]: {
    requirementStatus: PermitRequirementStatus.LIKELY_REQUIRED,
    permitCostMin: 100,
    permitCostMax: 600,
    timelineMinDays: 3,
    timelineMaxDays: 14,
    permitTypes: [
      { permitType: RenovationPermitType.BUILDING, isRequired: false, note: 'Required in many jurisdictions for full replacement' },
    ],
    inspectionStages: [
      { inspectionStageType: RenovationInspectionStageType.FINAL, isLikelyRequired: false, note: null },
    ],
    summary: 'Roof replacement permit requirements vary by jurisdiction. Many localities require permits for full replacement but not for minor repairs.',
    notes: 'Some jurisdictions exempt like-for-like roof replacement from permits. Verify locally.',
  },

  [HomeRenovationType.STRUCTURAL_REPAIR_MAJOR]: {
    requirementStatus: PermitRequirementStatus.REQUIRED,
    permitCostMin: 300,
    permitCostMax: 2000,
    timelineMinDays: 7,
    timelineMaxDays: 45,
    permitTypes: [
      { permitType: RenovationPermitType.BUILDING, isRequired: true, note: null },
      { permitType: RenovationPermitType.STRUCTURAL, isRequired: true, note: 'Engineering documentation often required' },
    ],
    inspectionStages: [
      { inspectionStageType: RenovationInspectionStageType.PLAN_REVIEW, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.FRAMING, isLikelyRequired: true, note: null },
      { inspectionStageType: RenovationInspectionStageType.FINAL, isLikelyRequired: true, note: null },
    ],
    summary: 'Major structural repairs require permits and structural engineering documentation in most jurisdictions.',
    notes: null,
  },
};

// Application portal fallback note
export const PERMIT_APPLICATION_PORTAL_NOTE =
  'Contact your local building or planning department for permit applications. Many jurisdictions offer online portals.';

// Version tag for audit/reproducibility
export const PERMIT_RULES_VERSION = 'v1.0.0-internal';
