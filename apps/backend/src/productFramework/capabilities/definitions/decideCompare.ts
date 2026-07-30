import { buildCapabilityDefinitions } from './capabilityDefinitionFactory';

export const DECIDE_COMPARE_CAPABILITIES = buildCapabilityDefinitions(([
  ['do-nothing-simulator', 'Do-Nothing Simulator', 'Model the cost and risk of delayed action.', '/dashboard/do-nothing-simulator', 'DO_NOTHING_SIMULATOR', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
  ['home-digital-twin', 'Home Upgrade Planner', 'Compare repair, replace, upgrade, and wait options for a specific home system.', '/dashboard/properties/[id]/tools/home-digital-twin', 'HOME_DIGITAL_TWIN', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'],
  ['negotiation-shield', 'Negotiation Shield', 'Review quotes and inspection asks before negotiating.', '/dashboard/properties/[id]/tools/negotiation-shield', 'NEGOTIATION_SHIELD', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['price-finalization', 'Price Finalization', 'Record accepted terms before booking work.', '/dashboard/properties/[id]/tools/price-finalization', 'PRICE_FINALIZATION', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['quote-comparison', 'Service Quote Decision', 'Review scope, compare proposals, and track a service decision.', '/dashboard/properties/[id]/tools/quote-comparison', 'QUOTE_COMPARISON', 'LOW_CONSEQUENCE', 'WORKFLOW_ONLY'],
  ['replace-repair', 'Repair vs Replace', 'Compare repair and replacement paths for a home system.', '/dashboard/replace-repair', 'REPLACE_OR_REPAIR', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
  ['service-price-radar', 'Service Price Radar', 'Review a service quote, understand its scope, and decide what to do next.', '/dashboard/properties/[id]/tools/service-price-radar', 'SERVICE_PRICE_RADAR', 'MATERIAL_FINANCIAL', 'CONTEXTUAL'],
] as const).map(([id, label, description, routeTemplate, rolloutKey, safetyTier, mode]) => ({
  id,
  label,
  description,
  routeTemplate,
  outcomeCategory: 'DECIDE_COMPARE' as const,
  rolloutKey,
  releaseStage: 'ACTIVE' as const,
  safetyTier,
  completionKind: 'DECISION_RECORDED' as const,
  mode,
})));
