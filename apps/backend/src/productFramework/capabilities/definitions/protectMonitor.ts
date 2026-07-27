import { buildCapabilityDefinitions } from './capabilityDefinitionFactory';

// home-digital-twin is mixed-consequence today: the same route surfaces both
// low-consequence record projection and scenario computation involving
// replacement cost, savings, and risk claims. Until the record-projection and
// upgrade-planning responsibilities are split onto separate surfaces (see
// HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md), the whole
// capability is classified at the higher MATERIAL_FINANCIAL tier rather than
// LOW_CONSEQUENCE, and its completion is ARTIFACT_CREATED (a computed
// scenario/component record) rather than OUTPUT_VIEWED (mere exposure).
const COMPLETION_KIND_OVERRIDES: Partial<Record<string, 'ARTIFACT_CREATED'>> = {
  'home-digital-twin': 'ARTIFACT_CREATED',
};

export const PROTECT_MONITOR_CAPABILITIES = buildCapabilityDefinitions(([
  ['appreciation', 'Value Tracker', 'Monitor home value and trendlines.', '/dashboard/appreciation', 'VALUE_TRACKER', 'ACTIVE', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['climate', 'Climate Risk', 'Review weather and climate exposure trends.', '/dashboard/climate', 'CLIMATE_RISK', 'BETA', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['energy', 'Energy Audit', 'Review efficiency and utility optimization opportunities.', '/dashboard/energy', 'ENERGY_AUDIT', 'BETA', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['guidance-overview', 'Guidance Overview', 'Review active property signals and next steps.', '/dashboard/properties/[id]/tools/guidance-overview', 'GUIDANCE_OVERVIEW', 'ACTIVE', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['home-digital-twin', 'Home Digital Twin', 'Explore a living model of home systems and risks.', '/dashboard/properties/[id]/tools/home-digital-twin', 'HOME_DIGITAL_TWIN', 'ACTIVE', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'],
  ['home-event-radar', 'Home Event Radar', 'Track current signals affecting this home.', '/dashboard/properties/[id]/tools/home-event-radar', 'HOME_EVENT_RADAR', 'ACTIVE', 'LOW_CONSEQUENCE', 'CONTEXTUAL'],
  ['home-gazette', 'Home Gazette', 'Read a recurring home intelligence briefing.', '/dashboard/properties/[id]/tools/home-gazette', 'HOME_GAZETTE', 'ACTIVE', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['neighborhood-change-radar', 'Neighborhood Change Radar', 'Track external changes affecting value and livability.', '/dashboard/properties/[id]/tools/neighborhood-change-radar', 'NEIGHBORHOOD_CHANGE_RADAR', 'BETA', 'LOW_CONSEQUENCE', 'CONTEXTUAL'],
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
  completionKind: COMPLETION_KIND_OVERRIDES[id] ?? ('OUTPUT_VIEWED' as const),
  mode,
})));
