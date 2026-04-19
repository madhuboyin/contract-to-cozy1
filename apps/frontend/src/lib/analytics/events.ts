import { getFaro } from '@/lib/monitoring/faro';

// ---------------------------------------------------------------------------
// Event catalogue
// All product funnel events flow through track(). New events must be added
// to CtcEventName before use — do not pass raw strings to track().
// ---------------------------------------------------------------------------

export type CtcEventName =
  // Session
  | 'session_started'
  | 'property_onboarded'
  // Workflow funnel (applies to all Tier 1 tools)
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
  // Navigation
  | 'route_redirected'
  | 'dead_end_reached';

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
  | 'home-savings'
  | 'do-nothing'
  | 'risk-premium-optimizer'
  | 'maintenance'
  | 'morning-brief'
  | 'action-center';

export interface CtcEventProperties {
  // Session
  session_started: { propertyCount: number };
  property_onboarded: { propertyId: string; durationSeconds: number };
  // Workflow
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
