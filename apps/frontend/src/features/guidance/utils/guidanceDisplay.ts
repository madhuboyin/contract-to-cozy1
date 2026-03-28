import { formatEnumLabel } from '@/lib/utils/formatters';
import {
  GuidanceExecutionReadiness,
  GuidanceIssueDomain,
  GuidanceJourneyDTO,
  GuidanceNextStepResult,
  GuidanceStepDTO,
  GuidanceStepStatus,
} from '@/lib/api/guidanceApi';

// Item 21: Maps weather signal families to provider service categories
const WEATHER_SIGNAL_PROVIDER_CATEGORY: Record<string, string> = {
  freeze_risk: 'PLUMBING',
  flood_risk: 'PLUMBING',
  hurricane_risk: 'GENERAL',
  wind_risk: 'GENERAL',
  heat_risk: 'HVAC',
  wildfire_risk: 'GENERAL',
};

const FALLBACK_TOOL_ROUTE: Record<string, string> = {
  'replace-repair': '/dashboard/replace-repair',
  'coverage-intelligence': '/dashboard/properties/:propertyId/tools/coverage-intelligence',
  'service-price-radar': '/dashboard/properties/:propertyId/tools/service-price-radar',
  'negotiation-shield': '/dashboard/properties/:propertyId/tools/negotiation-shield',
  'inspection-report': '/dashboard/inspection-report?propertyId=:propertyId',
  booking: '/dashboard/providers?propertyId=:propertyId',
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
  // Items 20 + 22: Pass itemId so destination tools can pre-load item context
  if (journey.inventoryItemId) {
    params.set('itemId', journey.inventoryItemId);
  }

  const query = params.toString();
  if (!query) return path;
  return path.includes('?') ? `${path}&${query}` : `${path}?${query}`;
}

export function formatIssueDomain(domain: GuidanceIssueDomain): string {
  return formatEnumLabel(domain) || 'Guidance';
}

export function formatReadinessLabel(readiness: GuidanceExecutionReadiness): string {
  if (readiness === 'NOT_READY') return 'Blocked';
  if (readiness === 'NEEDS_CONTEXT') return 'Needs Info';
  if (readiness === 'READY') return 'Ready';
  if (readiness === 'TRACKING_ONLY') return 'Monitoring';
  return 'Updating';
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
  if (safeRoute) {
    // Item 21: Inject weather-signal-derived provider category for weather booking steps
    const routeWithCategory =
      journey.journeyTypeKey === 'weather_risk_resolution' && step.toolKey === 'booking'
        ? (() => {
            const category =
              journey.primarySignal?.signalIntentFamily
                ? WEATHER_SIGNAL_PROVIDER_CATEGORY[journey.primarySignal.signalIntentFamily] ?? null
                : null;
            if (!category) return safeRoute;
            return safeRoute.includes('?') ? `${safeRoute}&category=${category}` : `${safeRoute}?category=${category}`;
          })()
        : safeRoute;
    return appendGuidanceContext(routeWithCategory, journey, step);
  }

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
  const familyKey = String(journey.primarySignal?.signalIntentFamily ?? '').toLowerCase();
  const familyTitle: Record<string, string> = {
    cost_of_inaction_risk: 'Cost Of Waiting Risk',
    financial_exposure: 'Out-of-Pocket Cost Risk',
    coverage_gap: 'Coverage Gap Detected',
    coverage_lapse_detected: 'Coverage Lapse Detected',
    lifecycle_end_or_past_life: 'Aging System Risk',
    maintenance_failure_risk: 'Maintenance Failure Risk',
    inspection_followup_needed: 'Inspection Follow-up Needed',
    recall_detected: 'Safety Recall Alert',
    freeze_risk: 'Freeze Risk Alert',
  };

  if (familyTitle[familyKey]) return familyTitle[familyKey];

  const domain = formatIssueDomain(journey.issueDomain);
  const signalFamily = journey.primarySignal?.signalIntentFamily
    ? formatEnumLabel(journey.primarySignal.signalIntentFamily)
    : null;

  return signalFamily ? signalFamily : `${domain} Action Plan`;
}

export function buildJourneySubtitle(
  journey: GuidanceJourneyDTO,
  nextStepLabel?: string | null
): string {
  if (nextStepLabel) return `Start with: ${nextStepLabel}`;
  if (journey.currentStepKey) return `In progress: ${formatEnumLabel(journey.currentStepKey)}`;
  return 'Follow these steps to resolve this issue.';
}
