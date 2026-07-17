// ---------------------------------------------------------------------------
// Pure display / formatting helpers — no React
// ---------------------------------------------------------------------------

import { type GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import { type GuidanceStepDTO } from '@/lib/api/guidanceApi';
import { formatIssueDomain } from '@/features/guidance/utils/guidanceDisplay';
import { getProviderCategoryForSystemType } from '@/lib/config/serviceCategoryMapping';
import { formatEnumLabel } from '@/lib/utils/formatters';
import {
  type AssetScopeOption,
  DOMAIN_FOCUS_LABELS,
  SIGNAL_SUBTITLE_LABELS,
  FRESHNESS_COPY,
  SUGGESTED_ISSUE_TYPES_ITEM,
  SUGGESTED_ISSUE_TYPES_BY_CATEGORY,
  SUGGESTED_ISSUE_TYPES_BY_SERVICE,
  SUGGESTED_ISSUE_TYPES_SERVICE_DEFAULT,
  resolveApplianceIssues,
} from './constants';

export function appendScopeParams(
  baseHref: string,
  option: Pick<AssetScopeOption, 'inventoryItemId' | 'assetName'>
): string {
  const params = new URLSearchParams();
  if (option.inventoryItemId) {
    params.set('itemId', option.inventoryItemId);
  }
  params.set('assetName', option.assetName);
  const query = params.toString();
  return query ? `${baseHref}${baseHref.includes('?') ? '&' : '?'}${query}` : baseHref;
}

export function buildProvidersHref(propertyId: string, option: AssetScopeOption): string {
  const params = new URLSearchParams();
  params.set('propertyId', propertyId);
  params.set('category', getProviderCategoryForSystemType(option.systemType));
  params.set('insightFactor', option.systemType || option.assetName);
  if (option.inventoryItemId) params.set('itemId', option.inventoryItemId);
  params.set('assetName', option.assetName);
  return `/dashboard/providers?${params.toString()}`;
}

export function resolveAssetLabel(action: GuidanceActionModel): string {
  const itemName = action.journey.inventoryItem?.name?.trim();
  if (itemName) return itemName;
  return DOMAIN_FOCUS_LABELS[action.issueDomain] ?? formatIssueDomain(action.issueDomain);
}

export function resolvePrimarySubtitle(action: GuidanceActionModel): string {
  const family = action.journey.primarySignal?.signalIntentFamily ?? '';
  if (SIGNAL_SUBTITLE_LABELS[family]) return SIGNAL_SUBTITLE_LABELS[family];
  if (action.explanation?.why) return action.explanation.why;
  if (action.subtitle) return action.subtitle;
  return 'This is the highest-priority issue to resolve now.';
}

export function resolveNextStepLabel(action: GuidanceActionModel): string {
  const stepLabel = action.nextStep?.label?.trim();
  if (stepLabel) return stepLabel;
  const journeyLabel = action.journey.nextStepLabel?.trim();
  if (journeyLabel) return journeyLabel;
  const explanationLabel = action.explanation?.nextStep?.trim();
  if (explanationLabel) return explanationLabel;
  return 'Review next step';
}

export function resolvePriorityTone(action: GuidanceActionModel): 'danger' | 'elevated' | 'info' {
  if (action.priorityGroup === 'IMMEDIATE') return 'danger';
  if (action.priorityGroup === 'UPCOMING') return 'elevated';
  return 'info';
}

export function stepTone(
  step: GuidanceStepDTO
): 'danger' | 'elevated' | 'good' | 'info' {
  if (step.status === 'BLOCKED') return 'danger';
  if (step.status === 'IN_PROGRESS') return 'elevated';
  if (step.status === 'COMPLETED') return 'good';
  return 'info';
}

export function formatFreshnessLabel(timestamp: string | null | undefined): string {
  if (!timestamp) return 'Updated recently';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'Updated recently';
  const diffMs = Date.now() - parsed.getTime();
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
  if (diffHours < 24) return `Updated ${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.round(diffHours / 24);
  return `Updated ${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export function getFreshnessCopy(category: string | null | undefined, issueDomain?: string | null): string {
  if (category && FRESHNESS_COPY[category]) return FRESHNESS_COPY[category];
  if (issueDomain && FRESHNESS_COPY[issueDomain]) return FRESHNESS_COPY[issueDomain];
  return 'Verify pricing before committing to a quote.';
}

export function resolveConfidenceDots(label: GuidanceActionModel['confidenceLabel']): number {
  if (label === 'HIGH') return 5;
  if (label === 'MEDIUM') return 3;
  if (label === 'LOW') return 2;
  return 3;
}

export function normalizeIssueTypeKey(issueType: string): string {
  return issueType.trim().toLowerCase().replace(/\s+/g, '_');
}

export function getIssueTypesForScope(
  scopeCategory: 'ITEM' | 'SERVICE',
  category?: string | null,
  serviceKey?: string | null,
  assetName?: string | null
): { key: string; label: string }[] {
  if (scopeCategory === 'SERVICE') {
    return serviceKey
      ? (SUGGESTED_ISSUE_TYPES_BY_SERVICE[serviceKey] ?? SUGGESTED_ISSUE_TYPES_SERVICE_DEFAULT)
      : SUGGESTED_ISSUE_TYPES_SERVICE_DEFAULT;
  }
  if (category === 'APPLIANCE' && assetName) {
    const named = resolveApplianceIssues(assetName);
    if (named) return named;
  }
  return category
    ? (SUGGESTED_ISSUE_TYPES_BY_CATEGORY[category] ?? SUGGESTED_ISSUE_TYPES_ITEM)
    : SUGGESTED_ISSUE_TYPES_ITEM;
}
