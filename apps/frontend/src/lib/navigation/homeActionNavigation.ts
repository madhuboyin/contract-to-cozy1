import type { RankedHomeActionDTO } from '@/types';
import { getProviderCategoryForSystemType } from '@/lib/config/serviceCategoryMapping';

type ServiceActionDestination = Pick<
  RankedHomeActionDTO,
  'lineageId' | 'signal' | 'recommendedAction' | 'evidence' | 'governance' | 'primaryCta'
>;

/**
 * Keeps the homeowner-facing CTA aligned with its promise even when a legacy
 * or merged Home Action still carries the old generic Action/Fix destination.
 */
export function resolveHomeActionPrimaryHref(
  action: ServiceActionDestination,
  propertyId: string,
): string {
  const isServiceAction = action.primaryCta.label.trim().toLowerCase() === 'schedule service' ||
    /^schedule service for\b/i.test(action.recommendedAction.trim());

  if (!isServiceAction || action.governance.safetyTier === 'SAFETY_EMERGENCY') {
    return action.primaryCta.href;
  }
  if (action.primaryCta.href.startsWith('/dashboard/providers')) {
    return action.primaryCta.href;
  }

  const serviceLabel = action.recommendedAction.match(/^schedule service for\s+(.+)$/i)?.[1]?.trim() ||
    action.evidence.find((evidence) => evidence.label.trim())?.label.trim() ||
    action.signal.replace(/^schedule service for\s+/i, '').trim() ||
    'Home maintenance';
  const params = new URLSearchParams({
    propertyId,
    category: getProviderCategoryForSystemType(serviceLabel),
    serviceLabel,
    intent: 'service-booking',
    from: 'home-action',
    actionKey: action.lineageId,
  });

  return `/dashboard/providers?${params.toString()}`;
}
