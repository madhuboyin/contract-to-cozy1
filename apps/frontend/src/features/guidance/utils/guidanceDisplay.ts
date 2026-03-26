import { formatEnumLabel } from '@/lib/utils/formatters';
import {
  GuidanceExecutionReadiness,
  GuidanceIssueDomain,
  GuidanceJourneyDTO,
  GuidanceNextStepResult,
  GuidanceStepDTO,
  GuidanceStepStatus,
} from '@/lib/api/guidanceApi';

const FALLBACK_TOOL_ROUTE: Record<string, string> = {
  'replace-repair': '/dashboard/replace-repair',
  'coverage-intelligence': '/dashboard/properties/:propertyId/tools/coverage-intelligence',
  'service-price-radar': '/dashboard/properties/:propertyId/tools/service-price-radar',
  'negotiation-shield': '/dashboard/properties/:propertyId/tools/negotiation-shield',
  'inspection-report': '/dashboard/inspection-report',
  booking: '/dashboard/bookings?propertyId=:propertyId',
  recalls: '/dashboard/properties/:propertyId/recalls',
  documents: '/dashboard/properties/:propertyId/inventory/coverage',
  'home-event-radar': '/dashboard/properties/:propertyId/tools/home-event-radar',
  'do-nothing-simulator': '/dashboard/properties/:propertyId/tools/do-nothing',
  'home-savings': '/dashboard/properties/:propertyId/tools/home-savings',
  'capital-timeline': '/dashboard/properties/:propertyId/tools/capital-timeline',
  'true-cost': '/dashboard/properties/:propertyId/tools/true-cost',
  'insurance-trend': '/dashboard/properties/:propertyId/tools/insurance-trend',
  'coverage-options': '/dashboard/properties/:propertyId/tools/coverage-options',
  'guidance-overview': '/dashboard/properties/:propertyId/tools/guidance-overview',
};

function replaceRouteParam(path: string, key: string, value: string | null | undefined): string {
  if (!path.includes(`:${key}`)) return path;
  if (!value) return path;
  return path.replaceAll(`:${key}`, encodeURIComponent(value));
}

function stripUnresolvedSegments(path: string): string | null {
  if (/:\w+/.test(path)) return null;
  return path;
}

function appendGuidanceContext(
  path: string,
  journey: GuidanceJourneyDTO,
  step: GuidanceStepDTO
): string {
  const params = new URLSearchParams();
  params.set('guidanceJourneyId', journey.id);
  params.set('guidanceStepKey', step.stepKey);
  if (journey.primarySignal?.signalIntentFamily) {
    params.set('guidanceSignalIntentFamily', journey.primarySignal.signalIntentFamily);
  }

  const query = params.toString();
  if (!query) return path;
  return path.includes('?') ? `${path}&${query}` : `${path}?${query}`;
}

export function formatIssueDomain(domain: GuidanceIssueDomain): string {
  return formatEnumLabel(domain) || 'Guidance';
}

export function formatReadinessLabel(readiness: GuidanceExecutionReadiness): string {
  if (readiness === 'NOT_READY') return 'Not Ready';
  if (readiness === 'NEEDS_CONTEXT') return 'Needs Context';
  if (readiness === 'READY') return 'Ready';
  if (readiness === 'TRACKING_ONLY') return 'Tracking';
  return 'Unknown';
}

export function formatStepStatusLabel(status: GuidanceStepStatus): string {
  if (status === 'IN_PROGRESS') return 'In Progress';
  return formatEnumLabel(status);
}

export function resolveGuidanceStepHref(args: {
  propertyId: string;
  journey: GuidanceJourneyDTO;
  step: GuidanceStepDTO;
  next?: GuidanceNextStepResult | null;
}): string | null {
  const { propertyId, journey, step, next } = args;

  const routeTemplate =
    step.routePath ?? (step.toolKey ? FALLBACK_TOOL_ROUTE[step.toolKey] ?? null : null);

  if (!routeTemplate) return null;

  let route = routeTemplate;
  route = replaceRouteParam(route, 'propertyId', propertyId);
  route = replaceRouteParam(route, 'itemId', journey.inventoryItemId ?? null);
  route = replaceRouteParam(route, 'inventoryItemId', journey.inventoryItemId ?? null);
  route = replaceRouteParam(route, 'homeAssetId', journey.homeAssetId ?? null);

  if (step.toolKey === 'replace-repair' && journey.inventoryItemId) {
    return appendGuidanceContext(
      `/dashboard/properties/${propertyId}/inventory/items/${journey.inventoryItemId}/replace-repair`,
      journey,
      step
    );
  }

  const safeRoute = stripUnresolvedSegments(route);
  if (safeRoute) return appendGuidanceContext(safeRoute, journey, step);

  if (next?.recommendedToolKey) {
    const recommended = FALLBACK_TOOL_ROUTE[next.recommendedToolKey] ?? null;
    if (!recommended) return null;
    const withProperty = replaceRouteParam(recommended, 'propertyId', propertyId);
    const safeRecommended = stripUnresolvedSegments(withProperty);
    return safeRecommended ? appendGuidanceContext(safeRecommended, journey, step) : null;
  }

  return null;
}

export function buildJourneyTitle(journey: GuidanceJourneyDTO): string {
  const domain = formatIssueDomain(journey.issueDomain);
  const signalFamily = journey.primarySignal?.signalIntentFamily
    ? formatEnumLabel(journey.primarySignal.signalIntentFamily)
    : null;

  return signalFamily ? `${signalFamily} - ${domain}` : `${domain} Guidance`;
}

export function buildJourneySubtitle(
  journey: GuidanceJourneyDTO,
  nextStepLabel?: string | null
): string {
  if (nextStepLabel) return `Next: ${nextStepLabel}`;
  if (journey.currentStepKey) return `Current step: ${formatEnumLabel(journey.currentStepKey)}`;
  return 'Track and resolve this issue with ordered next steps.';
}
