import { getFaro } from '@/lib/monitoring/faro';

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
  | 'property_claimed'
  // Activation
  | 'dashboard_first_view'
  | 'tool_opened'
  | 'first_wow_moment'
  | 'document_uploaded'
  | 'magic_scan_started'
  | 'magic_scan_completed'
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
  | 'booking_initiated'
  // Workflow funnel
  | 'workflow_started'
  | 'workflow_step_reached'
  | 'workflow_completed'
  | 'workflow_abandoned'
  // Recommendations
  | 'recommendation_shown'
  | 'action_taken'
  | 'action_completed'
  // Savings
  | 'savings_projected'
  | 'savings_verified'
  // Morning Brief
  | 'morning_brief_opened'
  | 'morning_brief_cta_clicked'
  // Diagnostics
  | 'route_redirected'
  | 'dead_end_reached'
  | 'api_error_encountered';

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
  | 'home-savings'
  | 'do-nothing'
  | 'risk-premium-optimizer'
  | 'maintenance'
  | 'morning-brief'
  | 'action-center'
  | 'vault'
  | 'magic-scan'
  | 'resolution-hub';

export interface CtcEventProperties {
  // Acquisition & Onboarding
  landing_page_viewed: { source?: string; deviceType?: string };
  hero_cta_clicked: { buttonText: string; sectionName: string };
  signup_started: { method: string };
  signup_completed: { timeToCompleteSeconds: number };
  address_lookup_started: { source: string };
  property_claimed: { zipCode: string; yearBuilt: number; source: 'API' | 'MANUAL' };
  
  // Activation
  dashboard_first_view: { propertyId: string };
  tool_opened: { tool: CtcTool; entryPoint: string };
  first_wow_moment: { insightId: string; insightType: string };
  document_uploaded: { type: string; sizeBytes: number; success: boolean };
  magic_scan_started: { propertyId: string; source: string };
  magic_scan_completed: { propertyId: string; confidence: number; documentType?: string; draftId?: string };
  
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
  provider_searched: { category: string; location: string };
  booking_initiated: { providerId?: string; category: string; source: string };
  
  // Diagnostics
  api_error_encountered: { endpoint: string; statusCode: number; message: string };

  // Workflow (Legacy preserved)
  workflow_started: { tool: CtcTool; propertyId: string; entryPoint: string };
  workflow_step_reached: { tool: CtcTool; step: string; propertyId: string };
  workflow_completed: { tool: CtcTool; propertyId: string; durationSeconds?: number };
  workflow_abandoned: { tool: CtcTool; exitStep: string; propertyId: string };
  // Recommendations
  recommendation_shown: { tool: CtcTool; confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH'; source: string };
  action_taken: { tool: CtcTool; actionType: string; propertyId: string };
  action_completed: { tool: CtcTool; actionType: string; propertyId: string };
  // Savings
  savings_projected: { tool: CtcTool; amountUsd: number; propertyId: string };
  savings_verified: { tool: CtcTool; amountUsd: number; propertyId: string };
  // Morning Brief
  morning_brief_opened: { propertyId: string; itemCount: number };
  morning_brief_cta_clicked: { propertyId: string; actionType: string; tool: CtcTool };
  // Navigation
  route_redirected: { oldRoute: string; canonicalRoute: string; redirectType: '308' | '307-resolver' };
  dead_end_reached: { route: string; propertyId?: string };
}

// ---------------------------------------------------------------------------
// track() — the single call site for all product events
//
// Uses Faro custom events when available (sent to Grafana Loki/Tempo).
// Falls back to console.debug in development so events are visible without
// a Faro endpoint configured.
// ---------------------------------------------------------------------------

export function track<E extends CtcEventName>(
  event: E,
  properties: CtcEventProperties[E],
): void {
  const faro = getFaro();

  if (faro) {
    faro.api.pushEvent(event, properties as Record<string, string>);
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[ctc:event]', event, properties);
  }
}
