import { buildCapabilityDefinitions } from './capabilityDefinitionFactory';

export const DECIDE_COMPARE_CAPABILITIES = buildCapabilityDefinitions(([
  ['do-nothing-simulator', 'Do-Nothing Simulator', 'Model the cost and risk of delayed action.', '/dashboard/do-nothing-simulator', 'DO_NOTHING_SIMULATOR', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
  ['negotiation-shield', 'Negotiation Shield', 'Review quotes and inspection asks before negotiating.', '/dashboard/properties/[id]/tools/negotiation-shield', 'NEGOTIATION_SHIELD', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['price-finalization', 'Price Finalization', 'Record accepted terms before booking work.', '/dashboard/properties/[id]/tools/price-finalization', 'PRICE_FINALIZATION', 'LOW_CONSEQUENCE', 'CATALOG_ONLY'],
  ['quote-comparison', 'Quote Comparison', 'Compare vendor quotes side by side.', '/dashboard/properties/[id]/tools/quote-comparison', 'QUOTE_COMPARISON', 'LOW_CONSEQUENCE', 'WORKFLOW_ONLY'],
  ['replace-repair', 'Repair vs Replace', 'Compare repair and replacement paths for a home system.', '/dashboard/replace-repair', 'REPLACE_OR_REPAIR', 'MATERIAL_FINANCIAL', 'CATALOG_ONLY'],
  ['service-price-radar', 'Service Price Radar', 'Benchmark whether a service quote is reasonable.', '/dashboard/properties/[id]/tools/service-price-radar', 'SERVICE_PRICE_RADAR', 'LOW_CONSEQUENCE', 'CONTEXTUAL'],
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
