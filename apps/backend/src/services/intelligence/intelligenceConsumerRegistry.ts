import type { IntelligenceConsumerDefinition } from './intelligenceConsumerRegistry.contract';

/**
 * Intentionally empty. FRD §15 Phase 2 work item 4 registers the initial
 * high-value consumers (Home Actions, compound Radar, risk, coverage,
 * maintenance prediction, sale readiness, personalization, capability
 * suggestions, Recommendation Snapshots, Home Briefing) once the
 * IntelligenceRecomputeRun/Target orchestrator that would actually invoke
 * these handlers exists. Populating this now with stub/no-op handlers would
 * be dead code nothing calls.
 */
export const INTELLIGENCE_CONSUMER_REGISTRY: readonly IntelligenceConsumerDefinition[] = [];
