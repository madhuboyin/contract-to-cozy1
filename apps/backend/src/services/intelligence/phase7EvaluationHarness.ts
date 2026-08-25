import {
  CAPABILITY_GOLDEN_RANKING_EXPECTATIONS,
} from '../../productFramework/capabilities/capabilityGoldenFixtures';
import { evaluateCapabilityGoldenRankingFixture } from '../../productFramework/capabilities/capabilityGoldenRanking';
import {
  RADAR_COMPOUND_RULE_CODES,
  RADAR_COMPOUND_RULE_VERSION,
  evaluateRadarCompoundRules,
} from '../../modules/homeEventRadar/domain/radarCompoundRules';
import { validateDecisionDefinitionRegistry } from '../decisionPlatform/decisionDefinitionRegistry';
import {
  documentInsightsToExtractionEnvelope,
  DOCUMENT_INTELLIGENCE_EXTRACTOR_VERSION,
} from '../documentIntelligenceExtractionEnvelope.adapter';
import { SKILL_EVALUATION_PACKAGES } from '../skills/skillEvaluationRegistry';
import {
  ASK_ANSWER_TRUST_VALIDATOR_VERSION,
} from '../ask/askAnswerTrustValidator';
import {
  ASK_TRUST_CERTIFICATION_LAYERS,
  validateAskTrustCertificationCorpus,
} from '../ask/askTrustCertificationCorpus';
import { ASK_OPERATION_DEFINITIONS } from '../ask/askOperationRegistry';
import { validateAskOperationSemanticPackages } from '../ask/askOperationSemanticPackages';

export const PHASE7_EVALUATION_HARNESS_VERSION = 'home-intelligence-phase7-v1';

export type Phase7EvaluationCategory =
  | 'RANKING'
  | 'MINIMAL_DATA'
  | 'CONFLICTING_FACTS'
  | 'DECISIONS'
  | 'EXTRACTION'
  | 'COMPOUND_RULES'
  | 'GENERATED_EXPLANATIONS'
  | 'SAFETY_BOUNDARIES';

export interface Phase7EvaluationResult {
  scenarioId: string;
  category: Phase7EvaluationCategory;
  capabilityId: string;
  capabilityVersion: string;
  passed: boolean;
  details: string;
}

function result(
  scenarioId: string,
  category: Phase7EvaluationCategory,
  capabilityId: string,
  capabilityVersion: string,
  passed: boolean,
  details: string,
): Phase7EvaluationResult {
  return { scenarioId, category, capabilityId, capabilityVersion, passed, details };
}

/**
 * Runs a small, deterministic operator-facing suite over the same code-owned
 * registries and pure evaluators used by the deeper unit/golden suites. It is
 * intentionally DB/model free so an operator can distinguish a failing
 * product rule from an unavailable environment.
 */
export function runPhase7EvaluationHarness(): Phase7EvaluationResult[] {
  const rankingFailures: string[] = [];
  for (const expectation of CAPABILITY_GOLDEN_RANKING_EXPECTATIONS) {
    const evaluated = evaluateCapabilityGoldenRankingFixture(expectation.fixtureId);
    if (JSON.stringify(evaluated.topCapabilityIds) !== JSON.stringify(expectation.expectedTopCapabilityIds)) {
      rankingFailures.push(expectation.fixtureId);
    }
  }

  const sparse = evaluateCapabilityGoldenRankingFixture('sparse-new-home');
  const packages = Object.values(SKILL_EVALUATION_PACKAGES);
  const conflictingCoverage = packages.every((suite) =>
    suite.contextCases.some((candidate) => candidate.state === 'CONFLICTING' && candidate.expectedBehavior === 'BLOCK'));
  const safetyCoverage = packages.every((suite) => suite.exclusionCases.length > 0 && suite.negativeCases.length > 0);

  const extractionFailure = documentInsightsToExtractionEnvelope({
    documentType: 'UNKNOWN',
    confidence: 0,
    extractedData: {},
    suggestedActions: ['Manual review required - AI response format was invalid'],
  });

  const staleCompound = evaluateRadarCompoundRules({
    propertyId: 'phase7-evaluation-property',
    events: [{
      matchId: 'stale-match', eventId: 'stale-event', eventType: 'weather', severity: 'severe',
      effectiveAt: new Date('2026-01-01T00:00:00.000Z'), lifecycleStatus: 'now', sourceFreshnessStatus: 'stale',
    }],
    facts: {
      hasSumpPump: null, hasSumpPumpBackup: null, primaryHeatingFuel: null,
      hvacFilterState: 'unknown', unresolvedRoofIssue: null, unresolvedGutterOrDrainageIssue: null,
    },
    evaluatedAt: new Date('2026-01-01T01:00:00.000Z'),
  });

  const trustIssues = validateAskTrustCertificationCorpus();
  const semanticContractIssues = validateAskOperationSemanticPackages(Object.keys(ASK_OPERATION_DEFINITIONS) as Array<keyof typeof ASK_OPERATION_DEFINITIONS>);
  const trustLayers = new Set(ASK_TRUST_CERTIFICATION_LAYERS.map((entry) => entry.layer));

  return [
    result('deterministic-capability-ranking', 'RANKING', 'capability-discovery', PHASE7_EVALUATION_HARNESS_VERSION,
      rankingFailures.length === 0, rankingFailures.length ? `Golden ranking mismatches: ${rankingFailures.join(', ')}` : 'All golden ranking expectations match.'),
    result('sparse-home-safe-partial-value', 'MINIMAL_DATA', 'capability-discovery', PHASE7_EVALUATION_HARNESS_VERSION,
      sparse.topCapabilityIds.length > 0 && sparse.ineligibleCapabilityIds.length > 0 && sparse.suppressedDuplicates.length > 0,
      'Sparse input must retain safe partial value while excluding inapplicable work and suppressing duplicates.'),
    result('conflicting-context-blocks', 'CONFLICTING_FACTS', 'skills', PHASE7_EVALUATION_HARNESS_VERSION,
      conflictingCoverage, 'Every Skill evaluation package must block conflicting required context.'),
    result('decision-registry-completeness', 'DECISIONS', 'decision-platform', 'decision-registry-v1',
      validateDecisionDefinitionRegistry().length === 0, 'Every decision family declares a context contract and evaluation suite.'),
    result('invalid-extraction-fails-closed', 'EXTRACTION', 'document-intelligence', DOCUMENT_INTELLIGENCE_EXTRACTOR_VERSION,
      extractionFailure.parseStatus === 'FAILED' && extractionFailure.fields.length === 0, 'Invalid structured extraction must fail closed with no promotable fields.'),
    result('stale-source-compound-suppression', 'COMPOUND_RULES', 'home-event-radar', RADAR_COMPOUND_RULE_VERSION,
      RADAR_COMPOUND_RULE_CODES.length > 0 && staleCompound.length === 0, 'Stale constituent evidence must not generate a compound recommendation.'),
    result('generated-answer-grounding-layers', 'GENERATED_EXPLANATIONS', 'ask', ASK_ANSWER_TRUST_VALIDATOR_VERSION,
      trustIssues.length === 0 && trustLayers.has('DEGRADED_SOURCE') && trustLayers.has('MODEL_DISABLED'), trustIssues.join('; ') || 'Grounding, degraded-source, and model-disabled certification layers are registered.'),
    result('generated-answer-safety-boundaries', 'SAFETY_BOUNDARIES', 'ask', ASK_ANSWER_TRUST_VALIDATOR_VERSION,
      safetyCoverage && semanticContractIssues.length === 0 && trustLayers.has('SAFETY_OVERLAP') && trustLayers.has('HARD_NEGATIVE'),
      semanticContractIssues.join('; ') || 'Every Skill and Ask operation has negative coverage and Ask has safety-overlap certification.'),
  ];
}
