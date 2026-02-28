export type PropertyPriorityTier = "P0" | "P1" | "P2" | "P3";
export type PropertySectionId = "basics" | "systems" | "safety" | "occupancy" | "appliances";

export interface PropertyPriorityField {
  key: string;
  label: string;
  tier: PropertyPriorityTier;
  impactWeight: number;
  sectionId: PropertySectionId;
  fieldRefId?: string;
  isFilled: (values: Record<string, unknown>) => boolean;
}

export interface PropertyEditPriorityState {
  completionCount: number;
  completionTotal: number;
  completionPct: number;
  nextBestStep: PropertyPriorityField | null;
  missingFields: PropertyPriorityField[];
  recommendedFields: PropertyPriorityField[];
}

const tierRank: Record<PropertyPriorityTier, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

export const PROPERTY_SECTION_ORDER: PropertySectionId[] = [
  "basics",
  "systems",
  "safety",
  "occupancy",
  "appliances",
];

const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const hasNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
const hasNonNullNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const hasBooleanTrue = (value: unknown) => value === true;
const hasArrayItems = (value: unknown) => Array.isArray(value) && value.length > 0;

export const PROPERTY_PRIORITY_FIELDS: PropertyPriorityField[] = [
  { key: "name", label: "property nickname", tier: "P0", impactWeight: 70, sectionId: "basics", fieldRefId: "field-name", isFilled: (v) => hasText(v.name) },
  { key: "address", label: "street address", tier: "P0", impactWeight: 95, sectionId: "basics", fieldRefId: "field-address", isFilled: (v) => hasText(v.address) },
  { key: "city", label: "city", tier: "P0", impactWeight: 90, sectionId: "basics", fieldRefId: "field-city", isFilled: (v) => hasText(v.city) },
  { key: "state", label: "state", tier: "P0", impactWeight: 90, sectionId: "basics", fieldRefId: "field-state", isFilled: (v) => hasText(v.state) },
  { key: "zipCode", label: "zip code", tier: "P0", impactWeight: 90, sectionId: "basics", fieldRefId: "field-zipCode", isFilled: (v) => hasText(v.zipCode) },
  { key: "propertyType", label: "property type", tier: "P0", impactWeight: 84, sectionId: "basics", fieldRefId: "field-propertyType", isFilled: (v) => hasText(v.propertyType) },
  { key: "propertySize", label: "approximate size", tier: "P0", impactWeight: 83, sectionId: "basics", fieldRefId: "field-propertySize", isFilled: (v) => hasNumber(v.propertySize) },
  { key: "yearBuilt", label: "year built", tier: "P0", impactWeight: 82, sectionId: "basics", fieldRefId: "field-yearBuilt", isFilled: (v) => hasNonNullNumber(v.yearBuilt) },

  { key: "hvacInstallYear", label: "HVAC install year", tier: "P1", impactWeight: 100, sectionId: "systems", fieldRefId: "field-hvacInstallYear", isFilled: (v) => hasNonNullNumber(v.hvacInstallYear) },
  { key: "waterHeaterInstallYear", label: "water heater install year", tier: "P1", impactWeight: 95, sectionId: "systems", fieldRefId: "field-waterHeaterInstallYear", isFilled: (v) => hasNonNullNumber(v.waterHeaterInstallYear) },
  { key: "roofReplacementYear", label: "roof replacement year", tier: "P1", impactWeight: 90, sectionId: "systems", fieldRefId: "field-roofReplacementYear", isFilled: (v) => hasNonNullNumber(v.roofReplacementYear) },
  { key: "heatingType", label: "heating type", tier: "P1", impactWeight: 88, sectionId: "systems", fieldRefId: "field-heatingType", isFilled: (v) => hasText(v.heatingType) },
  { key: "coolingType", label: "cooling type", tier: "P1", impactWeight: 87, sectionId: "systems", fieldRefId: "field-coolingType", isFilled: (v) => hasText(v.coolingType) },
  { key: "waterHeaterType", label: "water heater type", tier: "P1", impactWeight: 86, sectionId: "systems", fieldRefId: "field-waterHeaterType", isFilled: (v) => hasText(v.waterHeaterType) },
  { key: "roofType", label: "roof type", tier: "P1", impactWeight: 85, sectionId: "systems", fieldRefId: "field-roofType", isFilled: (v) => hasText(v.roofType) },

  { key: "hasSmokeDetectors", label: "smoke detectors", tier: "P2", impactWeight: 70, sectionId: "safety", isFilled: (v) => hasBooleanTrue(v.hasSmokeDetectors) },
  { key: "hasCoDetectors", label: "CO detectors", tier: "P2", impactWeight: 69, sectionId: "safety", isFilled: (v) => hasBooleanTrue(v.hasCoDetectors) },
  { key: "hasFireExtinguisher", label: "fire extinguisher", tier: "P2", impactWeight: 68, sectionId: "safety", isFilled: (v) => hasBooleanTrue(v.hasFireExtinguisher) },
  { key: "hasSecuritySystem", label: "security system", tier: "P2", impactWeight: 67, sectionId: "safety", isFilled: (v) => hasBooleanTrue(v.hasSecuritySystem) },
  { key: "hasDrainageIssues", label: "drainage detail", tier: "P2", impactWeight: 66, sectionId: "safety", isFilled: (v) => hasBooleanTrue(v.hasDrainageIssues) },
  { key: "hasIrrigation", label: "irrigation detail", tier: "P2", impactWeight: 65, sectionId: "safety", isFilled: (v) => hasBooleanTrue(v.hasIrrigation) },
  { key: "bedrooms", label: "bedrooms", tier: "P2", impactWeight: 55, sectionId: "occupancy", fieldRefId: "field-bedrooms", isFilled: (v) => hasNonNullNumber(v.bedrooms) },
  { key: "bathrooms", label: "bathrooms", tier: "P2", impactWeight: 54, sectionId: "occupancy", fieldRefId: "field-bathrooms", isFilled: (v) => hasNonNullNumber(v.bathrooms) },
  { key: "occupantsCount", label: "people living here", tier: "P2", impactWeight: 53, sectionId: "occupancy", fieldRefId: "field-occupantsCount", isFilled: (v) => hasNonNullNumber(v.occupantsCount) },
  { key: "ownershipType", label: "property use", tier: "P2", impactWeight: 52, sectionId: "occupancy", fieldRefId: "field-ownershipType", isFilled: (v) => hasText(v.ownershipType) },

  { key: "appliances", label: "appliances", tier: "P3", impactWeight: 20, sectionId: "appliances", isFilled: (v) => hasArrayItems(v.appliances) },
];

function sectionDistance(from: PropertySectionId | null, to: PropertySectionId): number {
  if (!from) return 0;
  const fromIndex = PROPERTY_SECTION_ORDER.indexOf(from);
  const toIndex = PROPERTY_SECTION_ORDER.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) return 0;
  return Math.abs(fromIndex - toIndex);
}

export function getPropertyEditPriorityState(
  values: Record<string, unknown>,
  activeSectionId: PropertySectionId | null,
): PropertyEditPriorityState {
  const missingFields = PROPERTY_PRIORITY_FIELDS
    .filter((field) => !field.isFilled(values))
    .sort((a, b) => {
      const tierDiff = tierRank[a.tier] - tierRank[b.tier];
      if (tierDiff !== 0) return tierDiff;

      const weightDiff = b.impactWeight - a.impactWeight;
      if (weightDiff !== 0) return weightDiff;

      return sectionDistance(activeSectionId, a.sectionId) - sectionDistance(activeSectionId, b.sectionId);
    });

  const completionTotal = PROPERTY_PRIORITY_FIELDS.length;
  const completionCount = completionTotal - missingFields.length;
  const completionPct = Math.round((completionCount / completionTotal) * 100);

  return {
    completionCount,
    completionTotal,
    completionPct,
    nextBestStep: missingFields[0] ?? null,
    missingFields,
    recommendedFields: missingFields.slice(1, 4),
  };
}
