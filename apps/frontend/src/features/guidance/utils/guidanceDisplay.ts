import { formatEnumLabel } from '@/lib/utils/formatters';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
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
  'replace-repair': '/dashboard/properties/:propertyId/inventory?intent=replace-repair',
  'coverage-intelligence': '/dashboard/properties/:propertyId/tools/coverage-intelligence',
  'service-price-radar': '/dashboard/properties/:propertyId/tools/service-price-radar',
  'quote-comparison': '/dashboard/properties/:propertyId/tools/quote-comparison',
  'negotiation-shield': '/dashboard/properties/:propertyId/tools/negotiation-shield',
  'price-finalization': '/dashboard/properties/:propertyId/tools/price-finalization',
  'replacement-model-comparison': '/dashboard/properties/:propertyId/guidance/step',
  'replacement-priorities-capture': '/dashboard/properties/:propertyId/guidance/step',
  'replacement-purchase-options': '/dashboard/properties/:propertyId/guidance/step',
  'replacement-purchase-finalization': '/dashboard/properties/:propertyId/guidance/step',
  'replacement-planning': '/dashboard/properties/:propertyId/guidance/step',
  'replacement-plan-followup': '/dashboard/properties/:propertyId/guidance/step',
  'inspection-report': '/dashboard/inspection-report?propertyId=:propertyId',
  booking: '/dashboard/providers?propertyId=:propertyId',
  recalls: '/dashboard/properties/:propertyId/recalls',
  documents: '/dashboard/properties/:propertyId/inventory/coverage',
  'home-event-radar': '/dashboard/properties/:propertyId/tools/home-event-radar',
  incidents: '/dashboard/properties/:propertyId?tab=incidents',
  'do-nothing-simulator': '/dashboard/properties/:propertyId/tools/do-nothing',
  'home-savings': '/dashboard/properties/:propertyId/tools/home-savings',
  'capital-timeline': '/dashboard/properties/:propertyId/tools/capital-timeline',
  'true-cost': '/dashboard/properties/:propertyId/tools/true-cost',
  'insurance-trend': '/dashboard/properties/:propertyId/tools/insurance-trend',
  'coverage-options': '/dashboard/properties/:propertyId/tools/coverage-options',
  'guidance-overview': '/dashboard/properties/:propertyId/tools/guidance-overview',
};

const GUIDANCE_FOCUSED_TOOL_KEYS = new Set([
  'capital-timeline',
  'coverage-intelligence',
  'coverage-options',
  'do-nothing-simulator',
  'documents',
  'history-verify',
  'home-event-radar',
  'home-savings',
  'incidents',
  'inspection-report',
  'maintenance',
  'negotiation-shield',
  'quote-comparison',
  'recalls',
  'replace-repair',
  'replacement-priorities-capture',
  'replacement-model-comparison',
  'replacement-purchase-options',
  'replacement-purchase-finalization',
  'replacement-planning',
  'replacement-plan-followup',
  'service-price-radar',
  'true-cost',
]);

const CLEANING_TYPE_LABELS: Record<string, string> = {
  standard_clean: 'Standard recurring clean',
  deep_clean: 'One-time deep clean',
  move_clean: 'Move-in / move-out clean',
  post_construction: 'Post-construction clean-up',
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
  const selectedCleaningTypeLabel = getJourneySelectedCleaningTypeLabel(journey);
  params.set('guidanceJourneyId', journey.id);
  params.set('guidanceStepKey', step.stepKey);
  if (journey.primarySignal?.signalIntentFamily) {
    params.set('guidanceSignalIntentFamily', journey.primarySignal.signalIntentFamily);
  }
  // Pass asset scope so destination tools can stay in the same issue context.
  if (journey.inventoryItemId) {
    params.set('itemId', journey.inventoryItemId);
    params.set('inventoryItemId', journey.inventoryItemId);
  }
  if (journey.homeAssetId) {
    params.set('homeAssetId', journey.homeAssetId);
  }
  if (step.toolKey === 'service-price-radar' && journey.inventoryItemId) {
    params.set('linkedEntityType', 'APPLIANCE');
    params.set('linkedEntityId', journey.inventoryItemId);
    const assetName = journey.inventoryItem?.name?.trim() ?? null;
    if (assetName) params.set('label', assetName);
  }
  if (step.toolKey === 'service-price-radar' && journey.serviceKey === 'cleaning_service') {
    params.set('category', 'CLEANING');
    if (selectedCleaningTypeLabel) params.set('label', selectedCleaningTypeLabel);
  }
  // FRD-FR-10: For booking steps, pass asset name and issue description so the
  // booking form can auto-populate the description field.
  if (step.toolKey === 'booking') {
    const assetName =
      journey.inventoryItem?.name?.trim() ??
      (journey.homeAsset?.assetType ? formatEnumLabel(journey.homeAsset.assetType) : null);
    if (assetName) params.set('assetName', assetName);
    const issueDescription = formatIssueTypeLabel(journey.issueType) ?? journey.issueType ?? null;
    if (issueDescription) params.set('issueDescription', issueDescription);
    if (journey.serviceKey === 'cleaning_service') {
      params.set('category', 'CLEANING');
      if (selectedCleaningTypeLabel) {
        params.set('serviceLabel', selectedCleaningTypeLabel);
        params.set('issueDescription', selectedCleaningTypeLabel);
      }
    }
  }

  const query = params.toString();
  if (!query) return path;
  return path.includes('?') ? `${path}&${query}` : `${path}?${query}`;
}

function getJourneySelectedCleaningTypeLabel(journey: GuidanceJourneyDTO): string | null {
  const selectionStep = journey.steps.find((step) => step.stepKey === 'select_cleaning_type');
  const explicitLabel =
    typeof selectionStep?.producedData?.selectedCleaningTypeLabel === 'string'
      ? selectionStep.producedData.selectedCleaningTypeLabel.trim()
      : '';
  if (explicitLabel) return explicitLabel;
  const selectionKey =
    typeof selectionStep?.producedData?.selectedCleaningType === 'string'
      ? selectionStep.producedData.selectedCleaningType
      : null;
  return formatSelectedCleaningTypeLabel(selectionKey);
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

const ISSUE_TYPE_LABELS: Record<string, string> = {
  not_working: 'Not working properly',
  past_life: 'Aging or past expected life',
  // B5: near_end_of_life was missing — showed as raw enum "Near End Of Life"
  near_end_of_life: 'Planning to replace this item',
  broken: 'Broken or physically damaged',
  inspection_needed: 'Needs inspection or maintenance',
  coverage_question: 'Coverage or warranty question',
  cost_estimate: 'Need a cost estimate',
  not_draining: 'Not draining properly',
  not_drying: 'Not drying properly',
  not_cooling: 'Not cooling properly',
  not_heating: 'Not heating properly',
  not_cleaning: 'Not cleaning properly',
  leak: 'Leaking water',
  unusual_noise: 'Making unusual noise',
  error_code: 'Showing an error code or warning light',
  door_issue: 'Door not latching or sealing',
  burner_issue: 'Burner or element not working',
  ice_maker: 'Ice maker or water dispenser not working',
  poor_airflow: 'Poor airflow or uneven temperatures',
  high_utility_cost: 'Unusually high utility costs',
  low_pressure: 'Low water pressure',
  no_hot_water: 'No hot water',
  slow_drain: 'Slow drain or clog',
  tripping_breaker: 'Tripping circuit breaker',
  flickering: 'Flickering lights or power fluctuations',
  outlet_issue: 'Outlet or switch not functioning',
  visible_damage: 'Visible damage',
  gutter_issue: 'Gutter or drainage issue',
  battery_low: 'Low battery or replacement needed',
  connectivity_issue: 'Connectivity or pairing issue',
  // B5: symptom picker keys that were absent from this map — showed as formatted enums
  // PLUMBING
  pipe_noise: 'Banging or rattling pipes',
  water_discoloration: 'Discolored or smelly water',
  // ELECTRICAL
  no_power: 'No power to outlet or circuit',
  burning_smell: 'Burning smell or warm outlet',
  gfci_tripping: 'GFCI outlet keeps tripping',
  panel_upgrade: 'Panel upgrade or capacity concern',
  // HVAC
  short_cycling: 'Turning on and off repeatedly',
  refrigerant_issue: 'Possible refrigerant or freon issue',
  thermostat_issue: 'Thermostat not responding correctly',
  filter_clog: 'Filter clogged or overdue for replacement',
  // ROOF_EXTERIOR
  missing_shingles: 'Missing or damaged shingles',
  moss_algae: 'Moss or algae growth',
  storm_damage: 'Storm or hail damage',
  // SAFETY
  false_alarm: 'Frequent false alarms',
  // SMART_HOME
  app_issue: 'App or integration not working',
};

export function formatIssueTypeLabel(issueType: string | null | undefined): string | null {
  const normalized = issueType?.trim();
  if (!normalized) return null;
  const key = normalized.toLowerCase();
  return ISSUE_TYPE_LABELS[key] ?? formatEnumLabel(normalized) ?? normalized;
}

export function formatSelectedCleaningTypeLabel(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return CLEANING_TYPE_LABELS[normalized] ?? formatEnumLabel(normalized) ?? normalized;
}

export function resolveGuidanceStepHref(args: {
  propertyId: string;
  journey: GuidanceJourneyDTO;
  step: GuidanceStepDTO;
  next?: GuidanceNextStepResult | null;
  mode?: 'guided' | 'standalone';
}): string | null {
  const { propertyId, journey, step, next, mode = 'guided' } = args;

  if (
    mode === 'guided' &&
    step.toolKey &&
    GUIDANCE_FOCUSED_TOOL_KEYS.has(step.toolKey)
  ) {
    return appendGuidanceContext(
      `/dashboard/properties/${propertyId}/guidance/step`,
      journey,
      step
    );
  }

  const routeTemplate =
    step.routePath ?? (step.toolKey ? FALLBACK_TOOL_ROUTE[step.toolKey] ?? null : null);

  if (!routeTemplate) return null;

  let route = routeTemplate;
  route = replaceRouteParam(route, 'propertyId', propertyId);
  route = replaceRouteParam(route, 'itemId', journey.inventoryItemId ?? null);
  route = replaceRouteParam(route, 'inventoryItemId', journey.inventoryItemId ?? null);
  route = replaceRouteParam(route, 'homeAssetId', journey.homeAssetId ?? null);
  // FRD-FR-10: Substitute :issueType from the journey's issueType for booking step pre-population
  route = replaceRouteParam(route, 'issueType', journey.issueType ?? null);

  if (step.toolKey === 'replace-repair' && journey.inventoryItemId) {
    return buildGuidanceOverviewHref({
      propertyId,
      journeyId: journey.id,
      stepKey: step.stepKey,
      inventoryItemId: journey.inventoryItemId,
      homeAssetId: journey.homeAssetId,
      assetName: journey.inventoryItem?.name ?? null,
      issueType: journey.issueType,
    });
  }

  if (step.toolKey === 'coverage-intelligence' && journey.inventoryItemId) {
    return appendGuidanceContext(
      `/dashboard/properties/${propertyId}/inventory/items/${journey.inventoryItemId}/coverage`,
      journey,
      step
    );
  }

  if (step.toolKey === 'booking') {
    const bookingBaseRoute =
      stripUnresolvedSegments(route) ??
      `/dashboard/providers?propertyId=${encodeURIComponent(propertyId)}`;
    const bookingUrl = new URL(bookingBaseRoute, 'http://localhost');

    // Preserve template-defined booking filters and only infer a provider
    // category when the journey needs one and the route did not specify it.
    if (journey.journeyTypeKey === 'weather_risk_resolution') {
      const weatherCategory = journey.primarySignal?.signalIntentFamily
        ? WEATHER_SIGNAL_PROVIDER_CATEGORY[journey.primarySignal.signalIntentFamily] ?? null
        : null;
      if (weatherCategory && !bookingUrl.searchParams.get('category')) {
        bookingUrl.searchParams.set('category', weatherCategory);
      }
    }
    const bookingRoute = appendGuidanceContext(
      `${bookingUrl.pathname}${bookingUrl.search}`,
      journey,
      step
    );
    const returnTo = buildGuidanceOverviewHref({
      propertyId,
      journeyId: journey.id,
      stepKey: step.stepKey,
      inventoryItemId: journey.inventoryItemId,
      homeAssetId: journey.homeAssetId,
      assetName:
        journey.inventoryItem?.name?.trim() ??
        (journey.homeAsset?.assetType ? formatEnumLabel(journey.homeAsset.assetType) : null),
      issueType: journey.issueType,
    });
    const joiner = bookingRoute.includes('?') ? '&' : '?';
    return `${bookingRoute}${joiner}returnTo=${encodeURIComponent(returnTo)}`;
  }

  const safeRoute = stripUnresolvedSegments(route);
  if (safeRoute) {
    return appendGuidanceContext(safeRoute, journey, step);
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
    cost_of_inaction_risk: 'Cost of Waiting',
    financial_exposure: 'Out-of-Pocket Exposure',
    coverage_gap: 'Coverage Gap',
    coverage_lapse_detected: 'Coverage Lapsing Soon',
    lifecycle_end_or_past_life: 'Aging System',
    maintenance_failure_risk: 'Maintenance Issue',
    inspection_followup_needed: 'Inspection Follow-up',
    recall_detected: 'Safety Recall',
    freeze_risk: 'Freeze Risk',
    flood_risk: 'Flood Risk',
    heat_risk: 'Heat Risk',
    hurricane_risk: 'Storm Risk',
    wind_risk: 'Wind Risk',
    wildfire_risk: 'Wildfire Risk',
    energy_inefficiency_detected: 'Energy Inefficiency',
    high_utility_cost: 'High Utility Cost',
    permit_required: 'Permit Required',
    hoa_violation_detected: 'HOA Violation',
    safety_inspection_due: 'Safety Inspection Due',
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
  const domainHints: Record<string, string> = {
    FINANCIAL: 'Review your options to avoid unnecessary out-of-pocket costs.',
    INSURANCE: 'Check your coverage before the gap becomes an expense.',
    MAINTENANCE: 'Address this before a minor issue becomes a major repair.',
    SAFETY: 'Safety issues need prompt attention — review the details below.',
    ASSET_LIFECYCLE: 'Your system is aging — decide on repair or replacement.',
    WEATHER: 'Take protective action before the weather window closes.',
    COMPLIANCE: 'Resolve this to avoid fines or permit complications.',
    ENERGY: 'Reduce ongoing costs with targeted improvements.',
  };

  if (nextStepLabel) return `Next: ${nextStepLabel}`;
  if (journey.currentStepKey) return `In progress: ${formatEnumLabel(journey.currentStepKey)}`;
  return domainHints[journey.issueDomain] ?? 'Follow these steps to resolve this issue.';
}
