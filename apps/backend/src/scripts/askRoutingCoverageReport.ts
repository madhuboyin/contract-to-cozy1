/**
 * Read-only Ask routing coverage and calibration-drift report (Findings Implementation Plan, Phase 4).
 *
 *   npm run report:ask-routing-coverage -- --out <file.json>
 *
 * Runs the real, deterministic router (safety gate, direct patterns, local classifier) over the reviewed certification corpus and reports, by
 * language, operation and confidence band, how often it routes correctly, routes to the wrong operation, asks for clarification, or falls back.
 * It also lists every operation the semantic index can reach that the corpus does not exercise, and every stored calibration row that no longer
 * equals the live raw score. It needs no network, database, Redis or model, and it writes nothing except the file named by --out.
 *
 * The local classifier is feature hashing over curated concept groups and character n-grams. It is not a learned embedding model, and this report
 * says so in its own header so that a reader of the output cannot take it for one.
 *
 * Use --out: importing the router loads modules whose logger may print to stdout.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../services/ask/askOperationRegistry';
import { resolveAskRoutingCascade } from '../services/ask/askRoutingCascade';
import { ASK_OPERATION_SEMANTIC_INDEX_VERSION, retrieveAskOperationCandidates } from '../services/ask/askSemanticRouter';
import { ASK_LOCAL_EMBEDDING_VERSION } from '../services/ask/askSemanticEmbedding';
import { ASK_ROUTING_CALIBRATION_EVIDENCE_VERSION, ASK_ROUTING_CALIBRATION_VERSION } from '../services/ask/askRoutingCalibration';
import { ASK_ROUTING_CALIBRATION_EVIDENCE_METADATA, ASK_ROUTING_CALIBRATION_OBSERVATIONS } from '../services/ask/askRoutingCalibrationEvidence';
import { ASK_ROUTING_CERTIFICATION_FIXTURES, ASK_ROUTING_GENERALIZATION_REGRESSIONS, type AskRoutingCertificationFixture } from '../services/ask/askTrustCertificationCorpus';
import { ASK_DEFAULT_LANGUAGE } from '../services/ask/askLanguageRegistry';
import { deterministicMessageRouteOperationIds } from './askArchitectureInventory';

export type RoutingOutcome = 'CORRECT' | 'FALSE_ROUTE' | 'CLARIFICATION' | 'FALLBACK' | 'SAFETY_INTERCEPT';
export type SelectedBand = 'HIGH' | 'MEDIUM' | 'LOW' | 'DIRECT_PATTERN' | 'SAFETY_GATE' | 'FALLBACK_BY_DESIGN' | 'NONE';
export type ClarificationReason = 'POLICY_WRITE_OR_MATERIAL_BELOW_HIGH' | 'AMBIGUOUS_OR_MULTI_INTENT';

export interface FixtureOutcome {
  fixtureId: string;
  corpus: 'INDEPENDENT_REVIEW' | 'GENERALIZATION_REGRESSION';
  language: string;
  category: string;
  expected: AskOperationId;
  outcome: RoutingOutcome;
  /** For CLARIFICATION: whether the expected operation was among the candidates offered, so the homeowner could still reach it. */
  expectedAmongCandidates: boolean;
  /** Why a clarification was asked. A write or high-materiality operation must reach the HIGH band to run, so that clarification is policy, not a miss. */
  clarificationReason: ClarificationReason | null;
  /** Where the expected operation ranked by raw retrieval score across every indexed operation (1 = best), and the band and confidence it earned. */
  expectedRank: number | null;
  expectedBand: string | null;
  expectedConfidence: number | null;
  selected: AskOperationId | null;
  stage: string;
  band: SelectedBand;
  confidence: number | null;
  /** A wrong operation chosen at HIGH confidence, or by a direct pattern: the failure class that matters most. */
  confidentFalseRoute: boolean;
}

export interface CalibrationDriftRow {
  fixtureId: string;
  kind: 'EXPECTED_SCORE_CHANGED' | 'COMPETITOR_CHANGED' | 'COMPETITOR_SCORE_CHANGED' | 'ROW_MISSING';
  stored: { operationId: string | null; rawScore: number | null };
  live: { operationId: string | null; rawScore: number | null };
}

export interface AskRoutingCoverageReport {
  mechanism: string;
  versions: Record<string, string>;
  corpus: { independent: number; regressions: number; byCategory: Record<string, number> };
  aggregate: Record<string, number>;
  byLanguage: Record<string, Record<string, number>>;
  byBand: Record<string, Record<string, number>>;
  byOperation: Array<{ operationId: AskOperationId; fixtures: number; correct: number; falseRoute: number; clarification: number; fallback: number; positiveExamples: number; hardNegativeExamples: number }>;
  failures: FixtureOutcome[];
  operationCoverage: {
    messageRoutableOperations: number;
    semanticallyIndexed: number;
    withoutAnyRoutingFixture: AskOperationId[];
    withoutAnyRoutingFixtureAndDirectPatternOnly: AskOperationId[];
    withoutHardNegativeExamples: AskOperationId[];
  };
  calibrationDrift: { storedRows: number; driftedFixtures: number; rows: CalibrationDriftRow[] };
}

const MECHANISM = 'Local classifier = feature hashing (384 dimensions, FNV-1a) over curated operation-agnostic concept groups, word and character n-grams, plus lexical overlap with operation-owned examples. It has no learned semantic representation and is not an embedding model.';

function classify(fixture: AskRoutingCertificationFixture, corpus: FixtureOutcome['corpus']): FixtureOutcome {
  const language = ASK_DEFAULT_LANGUAGE;
  const decision = resolveAskRoutingCascade(fixture.message, { language, embeddingRetrievalEnabled: true });
  const resolvedStage = decision.stage === 'DETERMINISTIC' || decision.stage === 'LOCAL_CLASSIFIER';
  const selected = resolvedStage && !decision.requiresClarification ? decision.operation.operationId : null;
  const selectedCandidate = selected ? decision.candidates.find((candidate) => candidate.operationId === selected) : undefined;

  const ranked = retrieveAskOperationCandidates(fixture.message, { topK: Object.keys(ASK_OPERATION_DEFINITIONS).length, language }).sort((left, right) => right.rawScore - left.rawScore);
  const expectedIndex = ranked.findIndex((candidate) => candidate.operationId === fixture.operationId);
  const expectedCandidate = expectedIndex >= 0 ? ranked[expectedIndex] : null;

  let outcome: RoutingOutcome;
  let band: SelectedBand = 'NONE';
  if (decision.stage === 'SAFETY') {
    // The safety gate is meant to take a boundary-operation fixture; that is the expected result, not an intercept of something else.
    outcome = decision.operation.operationId === fixture.operationId ? 'CORRECT' : 'SAFETY_INTERCEPT';
    band = 'SAFETY_GATE';
  } else if (decision.requiresClarification) {
    outcome = 'CLARIFICATION';
  } else if (decision.stage === 'REMOTE_FALLBACK') {
    // GROUNDED_GUIDANCE is the fallback operation itself, so a fixture that expects it is routed as designed.
    outcome = fixture.operationId === 'GROUNDED_GUIDANCE' ? 'CORRECT' : 'FALLBACK';
    if (outcome === 'CORRECT') band = 'FALLBACK_BY_DESIGN';
  } else {
    outcome = selected === fixture.operationId ? 'CORRECT' : 'FALSE_ROUTE';
    band = decision.stage === 'DETERMINISTIC' ? 'DIRECT_PATTERN' : (selectedCandidate?.confidenceBand ?? 'NONE') as SelectedBand;
  }

  let clarificationReason: ClarificationReason | null = null;
  if (outcome === 'CLARIFICATION') {
    const top = decision.candidates[0];
    const definition = top ? ASK_OPERATION_DEFINITIONS[top.operationId] : null;
    const gated = definition && (definition.semantic.effect === 'WRITE' || definition.semantic.materiality === 'HIGH') && top.confidenceBand !== 'HIGH';
    clarificationReason = gated ? 'POLICY_WRITE_OR_MATERIAL_BELOW_HIGH' : 'AMBIGUOUS_OR_MULTI_INTENT';
  }

  return {
    fixtureId: fixture.fixtureId, corpus, language, category: fixture.category, expected: fixture.operationId, outcome,
    expectedAmongCandidates: decision.candidates.some((candidate) => candidate.operationId === fixture.operationId),
    clarificationReason,
    expectedRank: expectedIndex >= 0 ? expectedIndex + 1 : null,
    expectedBand: expectedCandidate?.confidenceBand ?? null,
    expectedConfidence: expectedCandidate ? Number(expectedCandidate.score.toFixed(4)) : null,
    selected, stage: decision.stage, band, confidence: selected ? Number(decision.operation.confidence.toFixed(4)) : null,
    confidentFalseRoute: outcome === 'FALSE_ROUTE' && (band === 'HIGH' || band === 'DIRECT_PATTERN'),
  };
}

function count<T>(rows: readonly T[], key: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[key(row)] = (out[key(row)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function summarize(rows: readonly FixtureOutcome[]): Record<string, number> {
  return {
    samples: rows.length,
    correct: rows.filter((row) => row.outcome === 'CORRECT').length,
    falseRoute: rows.filter((row) => row.outcome === 'FALSE_ROUTE').length,
    confidentFalseRoute: rows.filter((row) => row.confidentFalseRoute).length,
    clarification: rows.filter((row) => row.outcome === 'CLARIFICATION').length,
    clarificationWithExpectedOffered: rows.filter((row) => row.outcome === 'CLARIFICATION' && row.expectedAmongCandidates).length,
    clarificationByPolicy: rows.filter((row) => row.clarificationReason === 'POLICY_WRITE_OR_MATERIAL_BELOW_HIGH').length,
    fallbackWithExpectedRankedFirst: rows.filter((row) => row.outcome === 'FALLBACK' && row.expectedRank === 1).length,
    fallback: rows.filter((row) => row.outcome === 'FALLBACK').length,
    safetyIntercept: rows.filter((row) => row.outcome === 'SAFETY_INTERCEPT').length,
  };
}

/** Compares each stored calibration row with the live raw score for the same fixture, reporting every difference instead of stopping at the first. */
export function calibrationDrift(fixtures: readonly AskRoutingCertificationFixture[]): AskRoutingCoverageReport['calibrationDrift'] {
  const rows: CalibrationDriftRow[] = [];
  const operationCount = Object.keys(ASK_OPERATION_DEFINITIONS).length;
  for (const fixture of fixtures) {
    const candidates = retrieveAskOperationCandidates(fixture.message, { topK: operationCount }).sort((left, right) => right.rawScore - left.rawScore);
    const expected = candidates.find((candidate) => candidate.operationId === fixture.operationId);
    const competitor = candidates.find((candidate) => candidate.operationId !== fixture.operationId);
    const stored = ASK_ROUTING_CALIBRATION_OBSERVATIONS.filter((row) => row.sourceFixtureId === fixture.fixtureId);
    const storedExpected = stored.find((row) => row.correct);
    const storedCompetitor = stored.find((row) => !row.correct);
    if (!storedExpected || !storedCompetitor) {
      rows.push({ fixtureId: fixture.fixtureId, kind: 'ROW_MISSING', stored: { operationId: null, rawScore: null }, live: { operationId: competitor?.operationId ?? null, rawScore: competitor?.rawScore ?? null } });
      continue;
    }
    if (!expected || storedExpected.rawScore !== expected.rawScore) {
      rows.push({ fixtureId: fixture.fixtureId, kind: 'EXPECTED_SCORE_CHANGED', stored: { operationId: storedExpected.candidateOperationId, rawScore: storedExpected.rawScore }, live: { operationId: expected?.operationId ?? null, rawScore: expected?.rawScore ?? null } });
    }
    if (!competitor || storedCompetitor.candidateOperationId !== competitor.operationId) {
      rows.push({ fixtureId: fixture.fixtureId, kind: 'COMPETITOR_CHANGED', stored: { operationId: storedCompetitor.candidateOperationId, rawScore: storedCompetitor.rawScore }, live: { operationId: competitor?.operationId ?? null, rawScore: competitor?.rawScore ?? null } });
    } else if (storedCompetitor.rawScore !== competitor.rawScore) {
      rows.push({ fixtureId: fixture.fixtureId, kind: 'COMPETITOR_SCORE_CHANGED', stored: { operationId: storedCompetitor.candidateOperationId, rawScore: storedCompetitor.rawScore }, live: { operationId: competitor.operationId, rawScore: competitor.rawScore } });
    }
  }
  return { storedRows: ASK_ROUTING_CALIBRATION_OBSERVATIONS.length, driftedFixtures: new Set(rows.map((row) => row.fixtureId)).size, rows };
}

export function buildAskRoutingCoverageReport(): AskRoutingCoverageReport {
  const outcomes: FixtureOutcome[] = [
    ...ASK_ROUTING_CERTIFICATION_FIXTURES.map((fixture) => classify(fixture, 'INDEPENDENT_REVIEW')),
    ...ASK_ROUTING_GENERALIZATION_REGRESSIONS.map((fixture) => classify(fixture, 'GENERALIZATION_REGRESSION')),
  ];
  const directOnly = deterministicMessageRouteOperationIds();
  const definitions = Object.values(ASK_OPERATION_DEFINITIONS);
  const routable = definitions.filter((definition) => definition.messageRoutable && !definition.safetyClass.endsWith('_BOUNDARY'));
  const fixtureOps = new Set(outcomes.map((row) => row.expected));
  const pack = (id: AskOperationId) => ASK_OPERATION_DEFINITIONS[id].semantic.languagePacks[ASK_DEFAULT_LANGUAGE];
  const byOperation = [...fixtureOps].sort().map((operationId) => {
    const rows = outcomes.filter((row) => row.expected === operationId);
    return {
      operationId, fixtures: rows.length,
      correct: rows.filter((row) => row.outcome === 'CORRECT').length,
      falseRoute: rows.filter((row) => row.outcome === 'FALSE_ROUTE').length,
      clarification: rows.filter((row) => row.outcome === 'CLARIFICATION').length,
      fallback: rows.filter((row) => row.outcome === 'FALLBACK').length,
      positiveExamples: pack(operationId)?.positiveExamples.length ?? 0,
      hardNegativeExamples: pack(operationId)?.hardNegativeExamples.length ?? 0,
    };
  });
  const withoutFixture = routable.map((definition) => definition.operationId).filter((id) => !fixtureOps.has(id)).sort();
  return {
    mechanism: MECHANISM,
    versions: {
      localEmbeddingVersionIdentifier: ASK_LOCAL_EMBEDDING_VERSION,
      semanticIndexVersion: ASK_OPERATION_SEMANTIC_INDEX_VERSION,
      calibrationVersion: ASK_ROUTING_CALIBRATION_VERSION,
      calibrationEvidenceVersion: ASK_ROUTING_CALIBRATION_EVIDENCE_VERSION,
      calibrationDatasetVersion: ASK_ROUTING_CALIBRATION_EVIDENCE_METADATA.datasetVersion,
    },
    corpus: {
      independent: ASK_ROUTING_CERTIFICATION_FIXTURES.length,
      regressions: ASK_ROUTING_GENERALIZATION_REGRESSIONS.length,
      byCategory: count(outcomes, (row) => row.category),
    },
    aggregate: summarize(outcomes),
    byLanguage: Object.fromEntries(Object.entries(count(outcomes, (row) => row.language)).map(([language]) => [language, summarize(outcomes.filter((row) => row.language === language))])),
    byBand: Object.fromEntries(['HIGH', 'MEDIUM', 'LOW', 'DIRECT_PATTERN', 'SAFETY_GATE', 'FALLBACK_BY_DESIGN', 'NONE'].map((band) => [band, summarize(outcomes.filter((row) => row.band === band))])),
    byOperation,
    failures: outcomes.filter((row) => row.outcome !== 'CORRECT'),
    operationCoverage: {
      messageRoutableOperations: routable.length,
      semanticallyIndexed: routable.filter((definition) => (pack(definition.operationId)?.positiveExamples.length ?? 0) > 0).length,
      withoutAnyRoutingFixture: withoutFixture,
      withoutAnyRoutingFixtureAndDirectPatternOnly: withoutFixture.filter((id) => directOnly.has(id) && (pack(id)?.positiveExamples.length ?? 0) === 0),
      withoutHardNegativeExamples: routable.map((definition) => definition.operationId).filter((id) => (pack(id)?.hardNegativeExamples.length ?? 0) === 0).sort(),
    },
    calibrationDrift: calibrationDrift(ASK_ROUTING_CERTIFICATION_FIXTURES),
  };
}

function main(): void {
  const outIndex = process.argv.indexOf('--out');
  const report = `${JSON.stringify(buildAskRoutingCoverageReport(), null, 2)}\n`;
  if (outIndex >= 0 && process.argv[outIndex + 1]) writeFileSync(resolve(process.argv[outIndex + 1]), report);
  else process.stdout.write(report);
  process.exit(0);
}

if (require.main === module) main();
