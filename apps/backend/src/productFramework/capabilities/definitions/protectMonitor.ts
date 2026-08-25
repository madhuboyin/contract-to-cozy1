import { buildCapabilityDefinitions } from './capabilityDefinitionFactory';

export const PROTECT_MONITOR_CAPABILITIES = buildCapabilityDefinitions(([
  ['appreciation', 'Value Tracker', 'Monitor home value and trendlines.', '/dashboard/appreciation', 'VALUE_TRACKER', 'ACTIVE', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['claims', 'Claims', 'Review the status of filed insurance and incident claims for this home.', '/dashboard/properties/[id]/claims', 'CLAIMS', 'ACTIVE', 'REGULATED_COVERAGE', 'CATALOG_ONLY'],
  ['energy', 'Energy Audit', 'Review efficiency and utility optimization opportunities.', '/dashboard/energy', 'ENERGY_AUDIT', 'BETA', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['guidance-overview', 'Guidance Overview', 'Work through an active home decision step by step.', '/dashboard/properties/[id]/tools/guidance-overview', 'GUIDANCE_OVERVIEW', 'ACTIVE', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['home-event-radar', 'Home Event Radar', 'Track current signals affecting this home.', '/dashboard/properties/[id]/tools/home-event-radar', 'HOME_EVENT_RADAR', 'ACTIVE', 'LOW_CONSEQUENCE', 'CONTEXTUAL'],
  ['home-briefing', 'Home Briefing', 'Review meaningful changes since the last engagement, with canonical actions and source health.', '/dashboard/properties/[id]/tools/home-briefing', 'HOME_BRIEFING', 'BETA', 'LOW_CONSEQUENCE', 'CONTEXTUAL'],
  ['neighborhood-change-radar', 'Around Your Home', 'Review sourced local changes while keeping facts separate from inferred relevance.', '/dashboard/properties/[id]/tools/neighborhood-change-radar', 'NEIGHBORHOOD_CHANGE_RADAR', 'BETA', 'LOW_CONSEQUENCE', 'CONTEXTUAL'],
  ['visual-inspector', 'Visual Inspector', 'Review visible home conditions from photos.', '/dashboard/visual-inspector', 'VISUAL_INSPECTOR', 'ACTIVE', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
] as const).map(([id, label, description, routeTemplate, rolloutKey, releaseStage, safetyTier, mode]) => ({
  id,
  label,
  description,
  routeTemplate,
  outcomeCategory: 'PROTECT_MONITOR' as const,
  rolloutKey,
  releaseStage,
  safetyTier,
  // Home Operations Slice 10 (§11): Guidance Overview's real completion is a
  // recorded decision, not merely having viewed the signal list — the
  // "competing active-signal backlog" framing this capability used to carry
  // was already retired from the actual UI/data flow in Slice 4; this closes
  // the same gap in its registered contract.
  completionKind:
    id === 'guidance-overview'
    || id === 'home-briefing'
    || id === 'neighborhood-change-radar'
      ? 'DECISION_RECORDED' as const
      : 'OUTPUT_VIEWED' as const,
  mode,
})));
