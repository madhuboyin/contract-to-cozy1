import type { InventoryItem, InsurancePolicy, PropertyResponsibility, Warranty } from '@prisma/client';
import { RISK_ASSET_CONFIG } from '../config/risk-constants';
import { getHomeAssetDisplayLabel } from '../productFramework/homeAssetDisplay';

export type InventoryRecordGroup = 'SYSTEMS_STRUCTURE' | 'APPLIANCES_BELONGINGS';
export type InventoryCoverageState =
  | 'CONFIRMED'
  | 'MISSING'
  | 'MANAGED_ELSEWHERE'
  | 'INCOMPLETE'
  | 'NOT_REQUIRED';

type CoverageItem = Pick<InventoryItem,
  | 'assetType'
  | 'category'
  | 'condition'
  | 'coverageEvidenceStatus'
  | 'coverageNotRequired'
  | 'installedOn'
  | 'purchasedOn'
  | 'isVerified'
  | 'verificationSource'
  | 'sourceHash'
  | 'sourceType'
  | 'tags'
  | 'replacementCostCents'
  | 'roomId'
  | 'name'
> & {
  warranty?: Pick<Warranty, 'startDate' | 'expiryDate'> | null;
  insurancePolicy?: Pick<InsurancePolicy, 'startDate' | 'expiryDate'> | null;
};

export interface InventoryCoveragePresentation {
  displayName: string;
  recordGroup: InventoryRecordGroup;
  locationLabel: string;
  provenanceLabel: string | null;
  isInferred: boolean;
  responsibilityScope: string | null;
  responsibleParty: string | null;
  coverageState: InventoryCoverageState;
  coverageStateLabel: string;
  coverageStateDetail: string;
  coverageActionable: boolean;
  missingContext: string[];
  effectiveReplacementCostCents: number | null;
  replacementValueSource: 'RECORDED' | 'ESTIMATED' | null;
}

const SYSTEM_CATEGORIES = new Set([
  'HVAC', 'PLUMBING', 'ELECTRICAL', 'ROOF_EXTERIOR', 'SAFETY', 'SMART_HOME',
  'STRUCTURAL', 'EXTERIOR', 'SITE',
]);

function normalizedAsset(item: CoverageItem): string {
  return String(item.assetType || item.name || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

export function getInventoryRecordGroup(item: CoverageItem): InventoryRecordGroup {
  return item.tags.includes('PROPERTY_LEVEL_SYSTEM') || SYSTEM_CATEGORIES.has(String(item.category))
    ? 'SYSTEMS_STRUCTURE'
    : 'APPLIANCES_BELONGINGS';
}

export function getInventoryResponsibilityScope(item: CoverageItem): string | null {
  const asset = normalizedAsset(item);
  const category = String(item.category);
  if (asset.includes('HVAC') || asset.includes('FURNACE') || asset.includes('HEAT_PUMP') || category === 'HVAC') return 'HVAC';
  if (asset.includes('WATER_HEATER') || category === 'PLUMBING') return 'PLUMBING';
  if (asset.includes('ROOF') || category === 'ROOF_EXTERIOR') return 'ROOF';
  if (asset.includes('SAFETY') || category === 'SAFETY') return 'COMMON_SAFETY';
  if (category === 'EXTERIOR') return 'BUILDING_EXTERIOR';
  if (category === 'ELECTRICAL' || category === 'STRUCTURAL' || category === 'SITE') return 'SHARED_SYSTEMS';
  return null;
}

export function isInferredInventoryItem(item: CoverageItem): boolean {
  return item.verificationSource === 'PROPERTY_DETAILS'
    || item.sourceHash?.startsWith('RISK_REPORT_SYSTEM:') === true
    || item.tags.includes('RISK_REPORT_INFERRED');
}

function isActive(record: { startDate?: Date | null; expiryDate?: Date | null } | null | undefined, now: Date): boolean {
  if (!record) return false;
  const start = record.startDate ? new Date(record.startDate) : null;
  const expiry = record.expiryDate ? new Date(record.expiryDate) : null;
  return Boolean(start && expiry && start <= now && expiry >= now);
}

function responsiblePartyFor(
  scope: string | null,
  responsibilities: Array<Pick<PropertyResponsibility, 'scope' | 'party'>>,
): string | null {
  if (!scope) return null;
  return responsibilities.find((entry) => String(entry.scope) === scope)?.party ?? 'UNKNOWN';
}

function estimatedReplacementCostCents(item: CoverageItem): number | null {
  if (item.replacementCostCents != null && item.replacementCostCents > 0) return item.replacementCostCents;
  const asset = normalizedAsset(item);
  const config = RISK_ASSET_CONFIG.find((entry) => entry.systemType === asset);
  return config ? Math.round(config.replacementCost * 100) : null;
}

function managedLabel(party: string): string {
  if (party === 'ASSOCIATION') return 'Managed by your HOA';
  if (party === 'LANDLORD') return 'Managed by your landlord';
  return 'Shared responsibility';
}

export function buildInventoryCoveragePresentation(
  item: CoverageItem,
  responsibilities: Array<Pick<PropertyResponsibility, 'scope' | 'party'>>,
  now = new Date(),
): InventoryCoveragePresentation {
  const recordGroup = getInventoryRecordGroup(item);
  const inferred = isInferredInventoryItem(item);
  const responsibilityScope = getInventoryResponsibilityScope(item);
  const responsibleParty = responsiblePartyFor(responsibilityScope, responsibilities);
  const effectiveReplacementCostCents = estimatedReplacementCostCents(item);
  const replacementValueSource = item.replacementCostCents != null && item.replacementCostCents > 0
    ? 'RECORDED' as const
    : effectiveReplacementCostCents != null
      ? 'ESTIMATED' as const
      : null;
  const activeWarranty = isActive(item.warranty, now);
  const activeInsurance = isActive(item.insurancePolicy, now);
  const hasCoverageRecord = Boolean(item.warranty || item.insurancePolicy);
  const hasActiveCoverage = activeWarranty || activeInsurance;
  const hasLifecycleDate = Boolean(item.installedOn || item.purchasedOn);
  const hasCondition = item.condition !== 'UNKNOWN';
  const missingContext: string[] = [];

  if (inferred && !item.isVerified) missingContext.push('ITEM_CONFIRMATION');
  if (responsibilityScope && (!responsibleParty || responsibleParty === 'UNKNOWN')) missingContext.push('RESPONSIBILITY');
  if (!hasCoverageRecord && !hasLifecycleDate) missingContext.push('INSTALLATION_YEAR');
  if (!hasCoverageRecord && !hasCondition) missingContext.push('CONDITION');
  if (!hasCoverageRecord && effectiveReplacementCostCents == null) missingContext.push('REPLACEMENT_VALUE');
  if (!hasCoverageRecord && item.coverageEvidenceStatus !== 'NONE') missingContext.push('COVERAGE_EVIDENCE');

  const common = {
    displayName: getHomeAssetDisplayLabel(item),
    recordGroup,
    locationLabel: item.roomId ? '' : recordGroup === 'SYSTEMS_STRUCTURE' ? 'Whole home' : 'Room needed',
    provenanceLabel: inferred ? (item.isVerified ? 'Confirmed from property details' : 'Based on property details · Needs confirmation') : null,
    isInferred: inferred,
    responsibilityScope,
    responsibleParty,
    missingContext,
    effectiveReplacementCostCents,
    replacementValueSource,
  };

  if (item.tags.includes('INFERRED_NOT_PRESENT')) return {
    ...common,
    coverageState: 'NOT_REQUIRED',
    coverageStateLabel: 'System not present',
    coverageStateDetail: 'You confirmed this inferred system is not part of the home, so it is hidden from the Home Record.',
    coverageActionable: false,
  };

  if (item.coverageNotRequired) return {
    ...common,
    coverageState: 'NOT_REQUIRED',
    coverageStateLabel: 'Coverage not required',
    coverageStateDetail: 'You chose not to track coverage for this item.',
    coverageActionable: false,
  };

  if (responsibleParty === 'ASSOCIATION' || responsibleParty === 'LANDLORD' || responsibleParty === 'SHARED') return {
    ...common,
    coverageState: 'MANAGED_ELSEWHERE',
    coverageStateLabel: managedLabel(responsibleParty),
    coverageStateDetail: responsibleParty === 'SHARED'
      ? 'Review the shared responsibility before arranging coverage or replacement.'
      : `Your ${responsibleParty === 'ASSOCIATION' ? 'HOA' : 'landlord'} is recorded as responsible for this system.`,
    coverageActionable: false,
  };

  if (hasActiveCoverage) return {
    ...common,
    coverageState: 'CONFIRMED',
    coverageStateLabel: 'Coverage confirmed',
    coverageStateDetail: activeWarranty && activeInsurance
      ? 'Active warranty and insurance are linked.'
      : activeWarranty ? 'An active warranty is linked.' : 'An active insurance policy is linked.',
    coverageActionable: false,
  };

  if (missingContext.length > 0) return {
    ...common,
    coverageState: 'INCOMPLETE',
    coverageStateLabel: 'Coverage status incomplete',
    coverageStateDetail: missingContext.includes('INSTALLATION_YEAR')
      ? 'No warranty or insurance is linked yet. Add the approximate installation year to understand whether coverage may be useful.'
      : missingContext.includes('RESPONSIBILITY')
        ? 'No warranty or insurance is linked yet. Confirm who is responsible before reviewing homeowner coverage.'
        : missingContext.includes('REPLACEMENT_VALUE')
          ? 'No warranty or insurance is linked yet. Add a replacement value or review the estimate before comparing coverage.'
          : missingContext.includes('ITEM_CONFIRMATION')
            ? 'No warranty or insurance is linked yet. Confirm this system exists before reviewing coverage.'
            : 'No warranty or insurance is linked yet. Confirm whether you have coverage or are not sure.',
    coverageActionable: false,
  };

  if (hasCoverageRecord) return {
    ...common,
    coverageState: 'MISSING',
    coverageStateLabel: 'Coverage missing',
    coverageStateDetail: 'Linked coverage is no longer active. Review your options.',
    coverageActionable: true,
  };

  return {
    ...common,
    coverageState: 'MISSING',
    coverageStateLabel: 'Coverage missing',
    coverageStateDetail: 'You confirmed that no warranty or insurance is linked.',
    coverageActionable: true,
  };
}
