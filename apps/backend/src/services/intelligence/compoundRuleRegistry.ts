import type { CompoundRuleDefinition } from './compoundRuleRegistry.contract';

/**
 * Home Intelligence Functional Completeness FRD §15 Phase 5 — populated as
 * each vertical slice/rule from HI-CMP-002 lands. See
 * compoundRuleRegistry.contract.ts for why entries point at a producerId
 * rather than carrying a stored callback.
 */
export const COMPOUND_RULE_REGISTRY: readonly CompoundRuleDefinition[] = [
  {
    ruleId: 'RADAR_COMPOUND_INSIGHT_PROMOTION',
    version: '1.0',
    inputContracts: ['PropertyRadarCompoundInsight'],
    applicability: 'Home Intelligence FRD Phase 5 work item 1 — the first implementation HI-CMP-002 calls for: promote every active Radar compound rule (radarCompoundRules.ts: HEAVY_RAIN_OUTAGE_SUMP_BACKUP, SMOKE_HVAC_FILTER, FREEZE_OUTAGE_ELECTRIC_HEAT, SEVERE_WEATHER_OPEN_ROOF_ISSUE) into a canonical Home Action.',
    evidenceRequirements: ['Contributing Home Event(s) (matchId, eventType, severity, effectiveAt/expiresAt, source)', 'Contributing property fact(s) (factKey, confirmed/absent/unknown state)'],
    materiality: 'LOW_CONSEQUENCE — advisory awareness, never a material recommendation.',
    safetyTier: 'LOW_CONSEQUENCE',
    outputType: 'HOME_ACTION',
    expirationPolicy: 'Row-driven: the row disappears from the active set (and the projected Home Action with it) as soon as reconcileRadarCompoundInsightsForProperty no longer returns it as active — no separate expiration timer.',
    deduplicationKey: 'PropertyRadarCompoundInsight.correlationKey (sha256 of rule version + property + rule code + sorted constituent match ids)',
    producerId: 'loadCompoundRadarInsightActions',
    recommendedActionBuilder: 'Projects the insight row\'s own reviewed recommendedActionsJson (built by radarCompoundRules.ts per rule) directly into the Home Action\'s recommendedAction text — this producer does not author new recommendation copy.',
    sourceFile: 'apps/backend/src/services/homeActionSourcePromotion.service.ts',
  },
  {
    ruleId: 'INSPECTION_FINDING_WARRANTY_COVERAGE',
    version: '1.0',
    inputContracts: ['InspectionFinding', 'Warranty'],
    applicability: 'HI-CMP-002 rule 1 of 7 — an OPEN, non-informational inspection finding in a confirmed report whose homeSystem is covered (deterministically, by WarrantyCategory) by an active Warranty on the same property. InsurancePolicy correlation is deliberately out of scope for this rule version — see the loader\'s header comment for why.',
    evidenceRequirements: ['The InspectionFinding itself (homeSystem, severity, report confirmation)', 'Every matched active Warranty (category, provider, expiry)'],
    materiality: 'LOW_CONSEQUENCE — advisory ("may be covered, confirm before filing independently"), never asserts the warranty will pay a claim.',
    safetyTier: 'LOW_CONSEQUENCE',
    outputType: 'HOME_ACTION',
    expirationPolicy: 'Live-correlated on every read/recompute — resolves itself automatically once the finding closes, the warranty lapses, or no warranty in that category remains active. No separate persisted state to expire.',
    deduplicationKey: 'inspection-coverage:<InspectionFinding.id> — one insight per finding, aggregating every matching active warranty rather than one row per (finding, warranty) pair.',
    producerId: 'loadInspectionCoverageActions',
    recommendedActionBuilder: 'Names the matched warranty provider(s) and recommends contacting them to check coverage before paying for repairs independently; timing.dueAt is the soonest matching warranty\'s expiry date.',
    sourceFile: 'apps/backend/src/services/homeActionSourcePromotion.service.ts',
  },
];
