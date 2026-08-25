export type IntelligenceSourceKind = 'EXTERNAL' | 'AI';

export interface IntelligenceSourceRegistryEntry {
  sourceId: string;
  kind: IntelligenceSourceKind;
  owner: string;
  capabilityConsumers: readonly string[];
  freshnessSlaSeconds: number;
  credentialConfigRequirements: readonly string[];
  retryPolicy: { maxAttempts: number; backoffMs: number };
  fallbackBehavior: string;
  userVisibleDegradationMessage: string;
  operationalRunbook: string;
  sourceFile?: string;
}

const ai = (sourceId: string, sourceFile: string, capabilityConsumers: readonly string[], fallbackBehavior: string): IntelligenceSourceRegistryEntry => ({
  sourceId, kind: 'AI', owner: 'AI Platform', capabilityConsumers, freshnessSlaSeconds: 0,
  credentialConfigRequirements: ['GEMINI_API_KEY'], retryPolicy: { maxAttempts: 2, backoffMs: 250 }, fallbackBehavior,
  userVisibleDegradationMessage: 'Generated intelligence is temporarily unavailable. Record-based information remains available.',
  operationalRunbook: 'docs/operations/AI_REQUEST_GOVERNANCE_RUNBOOK.md', sourceFile,
});

export const AI_SOURCE_REGISTRY: readonly IntelligenceSourceRegistryEntry[] = Object.freeze([
  ai('ai:ask', 'apps/backend/src/services/gemini.service.ts', ['ask'], 'Return a typed unavailable response; never fabricate a record-grounded answer.'),
  ai('ai:document-intelligence', 'apps/backend/src/services/documentIntelligence.service.ts', ['document-intelligence'], 'Fail closed to manual review with no promotable fields.'),
  ai('ai:inspection-extraction', 'apps/backend/src/services/inspectionExtraction.service.ts', ['inspection-findings'], 'Retain the document for manual extraction.'),
  ai('ai:tax-appeal', 'apps/backend/src/services/taxAppeal.service.ts', ['property-tax'], 'Require homeowner confirmation/manual entry.'),
  ai('ai:property-appreciation', 'apps/backend/src/services/propertyAppreciation.service.ts', ['property-value'], 'Use the labeled deterministic regional baseline only.'),
  ai('ai:trash-schedule', 'apps/backend/src/community/providers/trashSchedule.provider.ts', ['community'], 'Link to the official municipal source without an extracted schedule.'),
  ai('ai:image-analysis', 'apps/backend/src/services/ai/geminiImageAnalysis.util.ts', ['home-records'], 'Ask for manual entry or a clearer image.'),
  ai('ai:room-scan', 'apps/backend/src/services/roomScan/provider.ts', ['room-scan'], 'Preserve the scan and request manual confirmation.'),
  ai('ai:appliance-oracle', 'apps/backend/src/services/applianceOracle.service.ts', ['appliance-oracle'], 'Show canonical inventory and lifecycle facts only.'),
  ai('ai:vendor-suggestions', 'apps/backend/src/services/guidanceEngine/vendorSuggestionsAdvisor.service.ts', ['guidance'], 'Show non-commercial search guidance without generated vendors.'),
  ai('ai:model-shortlist', 'apps/backend/src/services/guidanceEngine/modelShortlistAdvisor.service.ts', ['guidance'], 'Show comparison criteria without generated products.'),
  ai('ai:diy-guide', 'apps/backend/src/services/diyAiGuide.service.ts', ['diy'], 'Show deterministic safety boundaries and template steps only.'),
  ai('ai:emergency-troubleshooter', 'apps/backend/src/services/emergencyTroubleshooter.service.ts', ['incidents-emergency'], 'Show emergency escalation and deterministic safety steps.'),
  ai('ai:home-modification', 'apps/backend/src/services/homeModificationAdvisor.service.ts', ['renovation'], 'Show canonical project and permit context only.'),
  ai('ai:budget-forecaster', 'apps/backend/src/services/budgetForecaster.service.ts', ['capital-planning'], 'Show recorded costs without a generated forecast.'),
  ai('ai:energy-auditor', 'apps/backend/src/services/energyAuditor.service.ts', ['energy'], 'Show recorded equipment and deterministic efficiency checks.'),
  ai('ai:climate-risk', 'apps/backend/src/services/climateRiskPredictor.service.ts', ['climate-risk'], 'Disclose that no property-grounded risk estimate is available.'),
  ai('ai:moving-concierge', 'apps/backend/src/services/movingConcierge.service.ts', ['buyer-closing'], 'Show the canonical moving checklist only.'),
]);

export const PLATFORM_EXTERNAL_SOURCE_REGISTRY: readonly IntelligenceSourceRegistryEntry[] = Object.freeze([
  { sourceId: 'external:home-event-radar', kind: 'EXTERNAL', owner: 'Home Event Radar', capabilityConsumers: ['home-event-radar', 'home-actions', 'home-briefing'], freshnessSlaSeconds: 3600, credentialConfigRequirements: ['source-specific adapter configuration'], retryPolicy: { maxAttempts: 3, backoffMs: 60_000 }, fallbackBehavior: 'Mark matching evidence stale and suppress source-dependent compound outputs.', userVisibleDegradationMessage: 'Around-your-home updates may be delayed because a source is stale or unavailable.', operationalRunbook: 'docs/product/HOME_EVENT_RADAR_IMPLEMENTATION_PLAN.md' },
  { sourceId: 'external:service-price-benchmark', kind: 'EXTERNAL', owner: 'Service Price Radar', capabilityConsumers: ['service-price-radar', 'quote-comparison'], freshnessSlaSeconds: 86_400, credentialConfigRequirements: ['approved benchmark source and active release'], retryPolicy: { maxAttempts: 3, backoffMs: 60_000 }, fallbackBehavior: 'Do not claim quote comparability; retain rough budgeting guidance only.', userVisibleDegradationMessage: 'Qualified local price benchmarks are temporarily unavailable.', operationalRunbook: 'docs/operations/SERVICE_PRICE_BENCHMARK_SOURCE_OPERATIONS_RUNBOOK.md' },
]);

export const INTELLIGENCE_SOURCE_REGISTRY: readonly IntelligenceSourceRegistryEntry[] = Object.freeze([...PLATFORM_EXTERNAL_SOURCE_REGISTRY, ...AI_SOURCE_REGISTRY]);

export function validateIntelligenceSourceRegistry(entries: readonly IntelligenceSourceRegistryEntry[] = INTELLIGENCE_SOURCE_REGISTRY): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.sourceId)) issues.push(`${entry.sourceId}: duplicate source id`);
    ids.add(entry.sourceId);
    if (!entry.owner.trim()) issues.push(`${entry.sourceId}: missing owner`);
    if (!entry.capabilityConsumers.length) issues.push(`${entry.sourceId}: missing capability consumers`);
    if (entry.freshnessSlaSeconds < 0) issues.push(`${entry.sourceId}: invalid freshness SLA`);
    if (!entry.credentialConfigRequirements.length) issues.push(`${entry.sourceId}: missing credential/config requirements`);
    if (entry.retryPolicy.maxAttempts < 1 || entry.retryPolicy.backoffMs < 0) issues.push(`${entry.sourceId}: invalid retry policy`);
    if (!entry.fallbackBehavior.trim()) issues.push(`${entry.sourceId}: missing fallback behavior`);
    if (!entry.userVisibleDegradationMessage.trim()) issues.push(`${entry.sourceId}: missing degradation message`);
    if (!entry.operationalRunbook.trim()) issues.push(`${entry.sourceId}: missing runbook`);
  }
  return issues;
}

export function sourceRegistryEntry(sourceId: string): IntelligenceSourceRegistryEntry | null {
  return INTELLIGENCE_SOURCE_REGISTRY.find((entry) => entry.sourceId === sourceId) ?? null;
}
