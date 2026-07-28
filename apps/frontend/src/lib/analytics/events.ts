import { getFaro } from '@/lib/monitoring/faro';
import {
  canonicalizeDiscoverableToolId,
  getDiscoverableTool,
} from '@/features/tools/toolDiscoveryRegistry';
import { persistToolLifecycleEvents } from '@/features/tools/toolLifecycleTelemetry';
import type { ToolLifecycleEventDTO } from '@/types';

// ---------------------------------------------------------------------------
// Event catalogue
// All product funnel events flow through track(). New events must be added
// to CtcEventName before use — do not pass raw strings to track().
// ---------------------------------------------------------------------------

export type CtcEventName =
  // Acquisition & Onboarding
  | 'landing_page_viewed'
  | 'hero_cta_clicked'
  | 'signup_started'
  | 'signup_completed'
  | 'address_lookup_started'
  | 'address_entered_manually'
  | 'property_claimed'
  | 'active_trigger_selected'
  // Activation
  | 'dashboard_first_view'
  | 'tool_opened'
  | 'first_wow_moment'
  | 'document_uploaded'
  | 'magic_scan_started'
  | 'magic_scan_completed'
  | 'first_value_viewed'
  | 'first_action_started'
  | 'first_action_resolved'
  // Outcome Density & Trust (North Star)
  | 'outcome_win_generated'
  | 'outcome_action_taken'
  | 'trust_info_clicked'
  // Retention & Lifecycle
  | 'session_started'
  | 'return_visit'
  | 'task_completed'
  | 'notification_clicked'
  | 'property_onboarded'
  // Monetization / Resolution
  | 'provider_searched'
  | 'provider_search_radius_expanded'
  | 'provider_responsibility_answered'
  | 'booking_initiated'
  // Workflow funnel
  | 'workflow_started'
  | 'workflow_step_reached'
  | 'workflow_completed'
  | 'workflow_abandoned'
  | 'property_tax_outcome_recorded'
  // Recommendations
  | 'recommendation_shown'
  | 'action_taken'
  | 'action_completed'
  | 'tool_discovery_impression'
  | 'tool_discovery_clicked'
  | 'tool_discovery_catalog_searched'
  | 'tool_discovery_outcome'
  // Savings
  | 'savings_projected'
  | 'savings_verified'
  // Morning Brief
  | 'morning_brief_opened'
  | 'morning_brief_cta_clicked'
  | 'morning_brief_savings_clicked'
  | 'morning_brief_recall_clicked'
  // Performance
  | 'web_vital_recorded'
  // Diagnostics
  | 'route_redirected'
  | 'dead_end_reached'
  | 'api_error_encountered'
  // Incident Lifecycle
  | 'incident_pin_toggled'
  | 'incident_archived'
  | 'incident_restored'
  | 'incident_auto_resolution_canceled'
  | 'incident_auto_resolution_notification_dismissed'
  | 'incident_resolved_manually_before_auto'
  | 'incident_archive_view_opened'
  // Data quality — projection freshness and conflict signals, measured
  // separately from engagement (see HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_
  // IMPLEMENTATION_PLAN.md Slice 8: "measure projection freshness and
  // conflict resolution separately from engagement").
  | 'data_quality_signal';

export type CtcTool =
  | 'service-price-radar'
  | 'negotiation-shield'
  | 'quote-comparison'
  | 'price-finalization'
  | 'coverage-intelligence'
  | 'coverage-options'
  | 'hidden-asset-finder'
  | 'mortgage-refinance-radar'
  | 'guidance-overview'
  | 'home-event-radar'
  | 'insurance-trend'
  | 'property-tax'
  | 'ownership-costs'
  | 'home-savings'
  | 'do-nothing'
  | 'risk-premium-optimizer'
  | 'maintenance'
  | 'morning-brief'
  | 'action-center'
  | 'vault'
  | 'magic-scan'
  | 'resolution-hub'
  | 'savings-benefits'
  // Added as part of the tool-instrumentation coverage sprint
  | 'break-even'
  | 'capital-timeline'
  | 'diy'
  | 'financing'
  | 'hoa'
  | 'home-digital-twin'
  | 'home-digital-will'
  | 'home-gazette'
  | 'home-habit-coach'
  | 'home-renovation-risk-advisor'
  | 'home-risk-replay'
  | 'inspection-hub'
  | 'neighborhood-change-radar'
  | 'permits'
  | 'plant-advisor'
  | 'reserve-fund'
  | 'sell-hold-rent';

function toEventAttributes(properties: Record<string, unknown>): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      attrs[key] = value;
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      attrs[key] = String(value);
      continue;
    }
    attrs[key] = JSON.stringify(value);
  }
  return attrs;
}

export interface CtcEventProperties {
  // Acquisition & Onboarding
  landing_page_viewed: { source?: string; deviceType?: string };
  hero_cta_clicked: { buttonText: string; sectionName: string };
  signup_started: { method: string };
  signup_completed: { timeToCompleteSeconds: number };
  address_lookup_started: { source: string };
  address_entered_manually: { source: string };
  property_claimed: { zipCode: string; yearBuilt: number; source: 'API' | 'MANUAL' };
  active_trigger_selected: { triggerType: string; situation: string };
  
  // Activation
  dashboard_first_view: { propertyId: string };
  tool_opened: { tool: CtcTool; entryPoint: string };
  first_wow_moment: { insightId: string; insightType: string };
  document_uploaded: { type: string; sizeBytes: number; success: boolean };
  magic_scan_started: { propertyId: string; source: string };
  magic_scan_completed: { propertyId: string; confidence: number; documentType?: string; draftId?: string };
  first_value_viewed: { propertyId: string; actionId: string; triggerType: string };
  first_action_started: { propertyId: string | null; actionId: string };
  first_action_resolved: { propertyId: string; actionId: string; disposition: string };
  
  // Outcome Density & Trust
  outcome_win_generated: { type: 'SAVINGS' | 'RISK_PREVENTION' | 'TIME_SAVED'; valueUsd?: number; sourceEngine: string; propertyId: string };
  outcome_action_taken: { type: 'SAVINGS' | 'RISK_PREVENTION' | 'TIME_SAVED'; sourceEngine: string; propertyId: string };
  trust_info_clicked: { insightId: string; sourceEngine: string };
  
  // Retention & Lifecycle
  session_started: { propertyCount: number };
  return_visit: { sessionCount: number; daysSinceLastVisit: number };
  task_completed: { priority: string; category: string; propertyId: string; journeyType?: string };
  notification_clicked: { channel: 'PUSH' | 'EMAIL' | 'SMS'; campaignId: string };
  property_onboarded: { propertyId: string; durationSeconds: number };
  
  // Monetization / Resolution
  provider_searched: { category: string; location: string; radiusMiles?: number; resultCount?: number };
  provider_search_radius_expanded: {
    category: string;
    zipCode: string;
    previousRadiusMiles: number;
    radiusMiles: number;
  };
  provider_responsibility_answered: { category: string; party: string };
  booking_initiated: { providerId?: string; category: string; source: string };
  
  // Diagnostics
  api_error_encountered: { endpoint: string; statusCode: number; message: string };

  // Workflow (Legacy preserved)
  workflow_started: { tool: CtcTool; propertyId: string; entryPoint: string };
  workflow_step_reached: { tool: CtcTool; step: string; propertyId: string };
  workflow_completed: { tool: CtcTool; propertyId: string; durationSeconds?: number };
  workflow_abandoned: { tool: CtcTool; exitStep: string; propertyId: string };
  property_tax_outcome_recorded: {
    propertyId: string;
    outcome:
      | 'DOCUMENT_REVIEW_CONFIRMED'
      | 'EXEMPTION_DECISION'
      | 'CORRECTION_DECISION'
      | 'INFORMAL_REVIEW_DECISION'
      | 'EXTERNAL_FILING'
      | 'DETERMINATION';
    status?: string;
    actionId?: string;
    caseId?: string;
    determination?: string;
    assessedValueReduction?: number;
    refundAmount?: number;
    creditAmount?: number;
  };
  // Recommendations
  recommendation_shown: { tool: CtcTool; confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH'; source: string };
  action_taken: { tool: CtcTool; actionType: string; propertyId: string };
  action_completed: { tool: CtcTool; actionType: string; propertyId: string };
  data_quality_signal: {
    tool: CtcTool;
    propertyId: string;
    signalType: 'STALE' | 'NEEDS_RECOMPUTE' | 'DEGRADED' | 'FACT_CONFLICT';
  };
  tool_discovery_impression: {
    propertyId?: string | null;
    surface: 'unified_home' | 'property_detail' | 'explore_tools' | 'command_palette' | 'workflow' | 'completion';
    toolIds: string[];
    manifestVersions?: number[];
    registryVersion?: string | null;
    recommendationReasons?: string[];
    recommendationVersions?: string[];
    contextVersion?: string | null;
    sourceActionId?: string | null;
    sourceEntityType?: string | null;
    sourceEntityId?: string | null;
    journeyId?: string | null;
    sourceKind?: ToolLifecycleEventDTO['sourceKind'];
    sourceId?: string | null;
    readiness?: ToolLifecycleEventDTO['readiness'];
    rolloutCohort?: ToolLifecycleEventDTO['rolloutCohort'];
  };
  tool_discovery_clicked: {
    propertyId?: string | null;
    surface: 'unified_home' | 'property_detail' | 'explore_tools' | 'command_palette' | 'workflow' | 'completion';
    toolId: string;
    manifestVersion?: number | null;
    registryVersion?: string | null;
    position?: number;
    recommendationReason?: string | null;
    recommendationVersion?: string | null;
    contextVersion?: string | null;
    sourceActionId?: string | null;
    sourceEntityType?: string | null;
    sourceEntityId?: string | null;
    journeyId?: string | null;
    sourceKind?: ToolLifecycleEventDTO['sourceKind'];
    sourceId?: string | null;
    readiness?: ToolLifecycleEventDTO['readiness'];
    rolloutCohort?: ToolLifecycleEventDTO['rolloutCohort'];
  };
  tool_discovery_catalog_searched: {
    propertyId?: string | null;
    queryLength: number;
    resultCount: number;
  };
  tool_discovery_outcome: {
    propertyId?: string | null;
    toolId: string;
    sourceSurface: string;
    recommendationReason?: string | null;
    recommendationVersion?: string | null;
    outcome: 'workflow_completed';
  };
  // Savings
  savings_projected: { tool: CtcTool; amountUsd: number; propertyId: string };
  savings_verified: { tool: CtcTool; amountUsd: number; propertyId: string };
  // Morning Brief
  morning_brief_opened: { propertyId: string; itemCount: number };
  morning_brief_cta_clicked: { propertyId: string; actionType: string; tool: CtcTool };
  morning_brief_savings_clicked: { propertyId: string; savingsEstimate?: string; scoreValue?: number };
  morning_brief_recall_clicked: { propertyId: string; recallCount: number };
  // Performance
  web_vital_recorded: {
    metric: 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB';
    value: number;
    rating: 'good' | 'needs-improvement' | 'poor';
    delta?: number;
    id: string;
    route: string;
    withinBudget?: boolean;
  };
  // Navigation
  route_redirected: { oldRoute: string; canonicalRoute: string; redirectType: '308' | '307-resolver' };
  dead_end_reached: { route: string; propertyId?: string };
  // Incident Lifecycle
  incident_pin_toggled: { incidentId: string; propertyId: string; isPinned: boolean };
  incident_archived: { incidentId: string; propertyId: string; reason?: string };
  incident_restored: { incidentId: string; propertyId: string };
  incident_auto_resolution_canceled: { incidentId: string; propertyId: string };
  incident_auto_resolution_notification_dismissed: { incidentId: string; propertyId: string };
  incident_resolved_manually_before_auto: { incidentId: string; propertyId: string; daysBeforeAutoResolve: number };
  incident_archive_view_opened: { propertyId: string };
}

// ---------------------------------------------------------------------------
// track() — the single call site for all product events
//
// Uses Faro custom events when available (sent to Grafana Loki/Tempo).
// Falls back to console.debug in development so events are visible without
// a Faro endpoint configured.
// ---------------------------------------------------------------------------

type DiscoveryAttribution = CtcEventProperties['tool_discovery_clicked'];

function discoveryAttributionKey(toolId: string): string {
  return `ctc:tool-discovery-attribution:${toolId}`;
}

function rememberDiscoveryAttribution(properties: DiscoveryAttribution): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(discoveryAttributionKey(properties.toolId), JSON.stringify(properties));
  } catch {
    // Analytics attribution must never block navigation.
  }
}

function readDiscoveryAttribution(toolId: string): DiscoveryAttribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = discoveryAttributionKey(toolId);
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    window.sessionStorage.removeItem(key);
    return JSON.parse(raw) as DiscoveryAttribution;
  } catch {
    return null;
  }
}

function emitEvent(event: string, properties: Record<string, unknown>): void {
  const faro = getFaro();
  if (faro) {
    faro.api.pushEvent(event, toEventAttributes(properties));
    return;
  }
  if (process.env.NODE_ENV !== 'production') console.debug('[ctc:event]', event, properties);
}

export function track<E extends CtcEventName>(
  event: E,
  properties: CtcEventProperties[E],
): void {
  emitEvent(event, properties as Record<string, unknown>);

  if (event === 'tool_discovery_clicked') {
    const attribution = properties as DiscoveryAttribution;
    rememberDiscoveryAttribution(attribution);
    persistToolLifecycleEvents(attribution.propertyId, [{
      toolId: attribution.toolId,
      stage: 'CLICKED',
      surface: attribution.surface,
      manifestVersion: attribution.manifestVersion,
      registryVersion: attribution.registryVersion,
      recommendationReason: attribution.recommendationReason,
      recommendationVersion: attribution.recommendationVersion,
      contextVersion: attribution.contextVersion,
      sourceKind: attribution.sourceKind,
      sourceId: attribution.sourceId,
      sourceActionId: attribution.sourceActionId,
      sourceEntityType: attribution.sourceEntityType,
      sourceEntityId: attribution.sourceEntityId,
      journeyId: attribution.journeyId,
      readiness: attribution.readiness,
      rolloutCohort: attribution.rolloutCohort,
    }]);
  }

  if (event === 'tool_discovery_impression') {
    const impression = properties as CtcEventProperties['tool_discovery_impression'];
    persistToolLifecycleEvents(impression.propertyId, impression.toolIds.map((toolId, index) => ({
      toolId,
      stage: 'DISCOVERED',
      surface: impression.surface,
      manifestVersion: impression.manifestVersions?.[index] ?? null,
      registryVersion: impression.registryVersion,
      recommendationReason: impression.recommendationReasons?.[index] ?? null,
      recommendationVersion: impression.recommendationVersions?.[index] ?? null,
      contextVersion: impression.contextVersion,
      sourceKind: impression.sourceKind,
      sourceId: impression.sourceId,
      sourceActionId: impression.sourceActionId,
      sourceEntityType: impression.sourceEntityType,
      sourceEntityId: impression.sourceEntityId,
      journeyId: impression.journeyId,
      readiness: impression.readiness,
      rolloutCohort: impression.rolloutCohort,
    })));
  }

  if (event === 'workflow_started') {
    const workflow = properties as CtcEventProperties['workflow_started'];
    const toolId = canonicalizeDiscoverableToolId(workflow.tool);
    if (toolId) {
      persistToolLifecycleEvents(workflow.propertyId, [{
        toolId,
        stage: 'STARTED',
        surface: workflow.entryPoint || 'direct',
      }]);
    }
  }

  if (event === 'workflow_completed') {
    const workflow = properties as CtcEventProperties['workflow_completed'];
    const toolId = canonicalizeDiscoverableToolId(workflow.tool);
    if (!toolId) return;
    const attribution = readDiscoveryAttribution(toolId);
    const completionKind = getDiscoverableTool(toolId)?.completionKind ?? 'OUTPUT_GENERATED';
    persistToolLifecycleEvents(workflow.propertyId, [
      {
        toolId,
        stage: 'OUTPUT_GENERATED',
        surface: attribution?.surface ?? 'direct',
        recommendationReason: attribution?.recommendationReason ?? null,
        recommendationVersion: attribution?.recommendationVersion ?? null,
        contextVersion: attribution?.contextVersion ?? null,
        sourceActionId: attribution?.sourceActionId ?? null,
        sourceEntityType: attribution?.sourceEntityType ?? null,
        sourceEntityId: attribution?.sourceEntityId ?? null,
        journeyId: attribution?.journeyId ?? null,
        completionKind,
      },
      {
        toolId,
        stage: 'COMPLETED',
        surface: attribution?.surface ?? 'direct',
        recommendationReason: attribution?.recommendationReason ?? null,
        recommendationVersion: attribution?.recommendationVersion ?? null,
        contextVersion: attribution?.contextVersion ?? null,
        sourceActionId: attribution?.sourceActionId ?? null,
        sourceEntityType: attribution?.sourceEntityType ?? null,
        sourceEntityId: attribution?.sourceEntityId ?? null,
        journeyId: attribution?.journeyId ?? null,
        completionKind,
        durationSeconds: workflow.durationSeconds,
      },
    ]);
    if (attribution) {
      emitEvent('tool_discovery_outcome', {
        propertyId: attribution.propertyId ?? workflow.propertyId,
        toolId: attribution.toolId,
        sourceSurface: attribution.surface,
        recommendationReason: attribution.recommendationReason ?? null,
        recommendationVersion: attribution.recommendationVersion ?? null,
        outcome: 'workflow_completed',
      });
    }
  }
}
