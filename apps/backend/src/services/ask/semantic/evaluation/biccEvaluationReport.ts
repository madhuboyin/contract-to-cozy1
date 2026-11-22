// BICC-EVAL-006/-013/-014/-018/-019 and BICC-OPS-009 (FRD §6, §15): the executable parts of the evaluation contract.
// Pure functions over plain data; no provider, database or network access.
import { clopperPearsonInterval, type ProportionInterval } from './biccStatistics';

// ───────────────────────────── EVAL-018: all-prompt success ─────────────────────────────

export type PromptOutcomeKind =
  | 'CORRECT_ANSWER' | 'APPROPRIATE_CLARIFICATION' | 'SUPPORTED_BOUNDARY'          // success
  | 'UNSUPPORTED_FALLBACK' | 'WRONG_REFUSAL' | 'DEAD_END_RECOVERY' | 'DROPPED_FACET' | 'DATA_POINT_UNREACHABLE' | 'WRONG_ANSWER'; // failure

const SUCCESS_KINDS: ReadonlySet<PromptOutcomeKind> = new Set(['CORRECT_ANSWER', 'APPROPRIATE_CLARIFICATION', 'SUPPORTED_BOUNDARY']);
export const isPromptSuccess = (kind: PromptOutcomeKind): boolean => SUCCESS_KINDS.has(kind);

export type ResultSource = 'HELD_OUT' | 'TUNING' | 'MAIN_CORPUS';

export interface PromptResult {
  promptId: string;
  source: ResultSource;
  /** The shard the prompt came from; required for HELD_OUT results. */
  shardId?: string;
  /** True when the prompt was revealed or used to change behaviour; it is then tuning evidence. */
  contaminated?: boolean;
  outcome: PromptOutcomeKind;
  strata: Record<string, string>;
}

export interface StratumRate extends ProportionInterval { stratum: string; value: string }

export interface SuccessReport {
  /** Only independently held-out, uncontaminated results can produce a headline (EVAL-013). */
  certificationHeadline: ProportionInterval | null;
  headlineRefusedReason: 'NO_HELD_OUT_RESULTS' | null;
  heldOut: { eligible: number; contaminatedExcluded: number; byStratum: StratumRate[]; byShard: Record<string, ProportionInterval> };
  /** Descriptive only; never a certification figure and never labelled as generalisation evidence. */
  tuningOrMainCorpus: { results: number; rate: ProportionInterval | null; label: 'TUNING_EVIDENCE_NOT_CERTIFICATION' };
  /** EVAL-006: this report measures prompt-level success of the evaluated outcomes, not total answer accuracy. */
  scope: 'PROMPT_SUCCESS_AS_DEFINED_BY_EVAL_018';
}

const rate = (results: readonly PromptResult[]): ProportionInterval => clopperPearsonInterval(results.filter((r) => isPromptSuccess(r.outcome)).length, results.length);

function byStratum(results: readonly PromptResult[]): StratumRate[] {
  const groups = new Map<string, PromptResult[]>();
  for (const result of results) for (const [stratum, value] of Object.entries(result.strata)) {
    const key = `${stratum}\u0000${value}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const [stratum, value] = key.split('\u0000');
    return { stratum, value, ...rate(group) };
  }).sort((a, b) => a.stratum.localeCompare(b.stratum) || a.value.localeCompare(b.value));
}

/** The held-out-first success report. Main-corpus or contaminated results never become the headline. */
export function buildSuccessReport(results: readonly PromptResult[]): SuccessReport {
  const heldOutAll = results.filter((result) => result.source === 'HELD_OUT');
  const eligible = heldOutAll.filter((result) => !result.contaminated);
  const other = [...results.filter((result) => result.source !== 'HELD_OUT'), ...heldOutAll.filter((result) => result.contaminated)];
  const shards = new Map<string, PromptResult[]>();
  for (const result of eligible) shards.set(result.shardId ?? 'UNKNOWN_SHARD', [...(shards.get(result.shardId ?? 'UNKNOWN_SHARD') ?? []), result]);
  return {
    certificationHeadline: eligible.length ? rate(eligible) : null,
    headlineRefusedReason: eligible.length ? null : 'NO_HELD_OUT_RESULTS',
    heldOut: {
      eligible: eligible.length,
      contaminatedExcluded: heldOutAll.length - eligible.length,
      byStratum: byStratum(eligible),
      byShard: Object.fromEntries([...shards.entries()].map(([shardId, group]) => [shardId, rate(group)])),
    },
    tuningOrMainCorpus: { results: other.length, rate: other.length ? rate(other) : null, label: 'TUNING_EVIDENCE_NOT_CERTIFICATION' },
    scope: 'PROMPT_SUCCESS_AS_DEFINED_BY_EVAL_018',
  };
}

export interface RevisionComparison {
  comparable: boolean;
  reason?: string;
  baselineRate?: number;
  currentRate?: number;
  /** current minus baseline, in absolute proportion points. */
  delta?: number;
  withinNonInferiorityMargin?: boolean;
  regressed?: string[];
  improved?: string[];
  trials?: number;
}

/** EVAL-018 / GATE-010: compare the same still-sealed pool across two revisions; incompatible denominators are refused. */
export function compareRevisions(baseline: readonly PromptResult[], current: readonly PromptResult[], margin = 0.02): RevisionComparison {
  const ids = (results: readonly PromptResult[]) => results.map((r) => r.promptId).sort();
  const a = ids(baseline); const b = ids(current);
  if (a.length !== b.length || a.some((id, index) => id !== b[index])) return { comparable: false, reason: 'The revisions were not scored on the same prompt pool; historical metrics with different denominators are not compared.' };
  if (!a.length) return { comparable: false, reason: 'No prompts.' };
  const before = new Map(baseline.map((r) => [r.promptId, isPromptSuccess(r.outcome)]));
  const regressed: string[] = []; const improved: string[] = [];
  for (const result of current) {
    const was = before.get(result.promptId)!; const now = isPromptSuccess(result.outcome);
    if (was && !now) regressed.push(result.promptId); else if (!was && now) improved.push(result.promptId);
  }
  const baselineRate = baseline.filter((r) => isPromptSuccess(r.outcome)).length / baseline.length;
  const currentRate = current.filter((r) => isPromptSuccess(r.outcome)).length / current.length;
  const delta = currentRate - baselineRate;
  return { comparable: true, baselineRate, currentRate, delta, withinNonInferiorityMargin: delta >= -margin, regressed, improved, trials: baseline.length };
}

// ───────────────────────────── EVAL-014: scorer contract ─────────────────────────────

/** Deterministic claim segmentation: sentence terminators, semicolons and list lines each begin a claim. */
export function segmentClaims(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"'(])|;\s+/)
    .map((claim) => claim.replace(/^[-*•]\s*/, '').trim())
    .filter((claim) => claim.length > 0);
}

export type ScorerImplementation = 'DETERMINISTIC' | 'HUMAN_REVIEW' | 'LLM_JUDGE';

export interface JudgeCalibration {
  /** A sealed, independently human-labelled set. */
  sealedLabelSetId: string;
  /** The judge version key (provider+model+prompt+schema+config) the calibration was measured against. */
  calibratedVersionKey: string;
  agreement: number;
  classMetrics: Record<string, { precision: number; recall: number }>;
  calibratedAt: string;
}

export interface ScorerContract {
  id: string;
  version: string;
  claimSegmentation: string;
  rubricVersion: string;
  implementation: ScorerImplementation;
  decisionThresholds: Record<string, number>;
  judge?: { provider: string; model: string; promptVersion: string; schemaVersion: string; configVersion: string };
  calibration?: JudgeCalibration;
  /** Fixed catalogue text that deterministic checks can decide must not require a judge. */
  evaluates: 'STATIC_AUTHORED_CONTENT' | 'VARIABLE_OUTPUT';
}

export const judgeVersionKey = (judge: NonNullable<ScorerContract['judge']>): string => [judge.provider, judge.model, judge.promptVersion, judge.schemaVersion, judge.configVersion].join('|');

export function validateScorerContract(contract: ScorerContract, minimumAgreement = 0.9): string[] {
  const issues: string[] = [];
  for (const field of ['id', 'version', 'claimSegmentation', 'rubricVersion'] as const) if (!contract[field]?.trim()) issues.push(`${field} is required.`);
  if (!Object.keys(contract.decisionThresholds).length) issues.push('decisionThresholds are required.');
  if (contract.implementation === 'LLM_JUDGE') {
    if (contract.evaluates === 'STATIC_AUTHORED_CONTENT') issues.push('An LLM judge must not be required to validate static authored content; use lint, exact assertions or human review.');
    const judge = contract.judge;
    if (!judge || Object.values(judge).some((value) => !String(value ?? '').trim())) issues.push('An LLM judge records provider, model, prompt, schema and configuration versions.');
    const calibration = contract.calibration;
    if (!calibration) issues.push('An LLM judge requires a calibration against a sealed human-labelled set.');
    else {
      if (judge && calibration.calibratedVersionKey !== judgeVersionKey(judge)) issues.push('Calibration is stale: the judge, rubric, prompt, schema or model changed after it was measured; recalibrate before certification.');
      if (!calibration.sealedLabelSetId.trim()) issues.push('Calibration must name its sealed human-labelled set.');
      if (calibration.agreement < minimumAgreement) issues.push(`Calibration agreement ${calibration.agreement} is below ${minimumAgreement}.`);
      if (!Object.keys(calibration.classMetrics).length) issues.push('Class-level precision and recall must be reported.');
    }
  } else if (contract.judge || contract.calibration) {
    issues.push('Only an LLM_JUDGE scorer carries judge and calibration records.');
  }
  return issues;
}

export interface ScoredItem { id: string; safetyCritical: boolean; judgeScore: number | null; deterministicVerdict?: 'PASS' | 'FAIL'; judgeVerdict?: 'PASS' | 'FAIL' }

/** Borderline and safety-critical cases, and any judge/deterministic disagreement, go to a human (EVAL-014). */
export function requiresHumanAdjudication(item: ScoredItem, borderlineBand: readonly [number, number] = [0.4, 0.6]): boolean {
  if (item.safetyCritical) return true;
  if (item.judgeScore !== null && item.judgeScore >= borderlineBand[0] && item.judgeScore <= borderlineBand[1]) return true;
  return Boolean(item.deterministicVerdict && item.judgeVerdict && item.deterministicVerdict !== item.judgeVerdict);
}

// ───────────────────────────── OPS-009: evaluator egress ─────────────────────────────

export type MaterialProvenance = 'SYNTHETIC_APPROVED' | 'REAL_HOMEOWNER' | 'REPLAYED' | 'PRODUCTION' | 'UNKNOWN';
export interface EvaluatorMaterial { id: string; provenance: MaterialProvenance; text: string }

const IDENTIFIER_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['an email address', /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/],
  ['a phone number', /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/],
  ['a long account-like number', /\b(?:\d[ -]*?){12,19}\b/],
];

/** Offline evaluator calls use approved synthetic material only. Returns the reasons any item must not be sent. */
export function evaluatorEgressViolations(items: readonly EvaluatorMaterial[]): string[] {
  const violations: string[] = [];
  for (const item of items) {
    if (item.provenance !== 'SYNTHETIC_APPROVED') violations.push(`${item.id}: provenance ${item.provenance} is not approved synthetic material (OPS-009).`);
    for (const [label, pattern] of IDENTIFIER_PATTERNS) if (pattern.test(item.text)) violations.push(`${item.id}: contains ${label}.`);
  }
  return violations;
}

// ───────────────────────────── EVAL-019: deterministic fidelity suites ─────────────────────────────

export const FIDELITY_PARTITIONS = ['ENTITY', 'VALUE', 'DATE', 'UNIT', 'FORMULA_BRANCH', 'BOUNDARY', 'MISSING_DATA', 'AUTHORIZATION'] as const;
export type FidelityPartition = typeof FIDELITY_PARTITIONS[number];

export interface FidelityCase { id: string; partition: FidelityPartition; description: string; permanentRegression?: boolean }
export interface FidelityManifest {
  version: string;
  suite: 'HOME_RECORD_READ' | 'CALCULATION';
  cases: FidelityCase[];
  /** Present only when a population bound is claimed; a fixed or exhaustive matrix claims none. */
  inputDistribution?: string | null;
  claimsPopulationBound?: boolean;
}

export interface FidelityCoverage { distinctCases: number; byPartition: Record<FidelityPartition, number>; uncovered: FidelityPartition[]; populationBound: 'NOT_CLAIMED' | 'CLAIMED' }

export function fidelityCoverage(manifest: FidelityManifest): FidelityCoverage {
  const byPartition = Object.fromEntries(FIDELITY_PARTITIONS.map((partition) => [partition, 0])) as Record<FidelityPartition, number>;
  for (const entry of new Map(manifest.cases.map((c) => [c.id, c])).values()) byPartition[entry.partition] += 1;
  return {
    distinctCases: new Set(manifest.cases.map((c) => c.id)).size,
    byPartition,
    uncovered: FIDELITY_PARTITIONS.filter((partition) => byPartition[partition] === 0),
    populationBound: manifest.claimsPopulationBound ? 'CLAIMED' : 'NOT_CLAIMED',
  };
}

/** GATE-004A1/A2 acceptance preconditions: enough distinct cases, every partition covered, no unsupported population claim. */
export function validateFidelityManifest(manifest: FidelityManifest, minimumDistinctCases = 300): string[] {
  const issues: string[] = [];
  const coverage = fidelityCoverage(manifest);
  if (coverage.distinctCases < minimumDistinctCases) issues.push(`${coverage.distinctCases} distinct cases; the gate requires at least ${minimumDistinctCases}.`);
  if (coverage.uncovered.length) issues.push(`Partitions with no case: ${coverage.uncovered.join(', ')}.`);
  if (manifest.cases.length !== coverage.distinctCases) issues.push('Duplicate case ids: cases must be distinct.');
  if (manifest.claimsPopulationBound && !manifest.inputDistribution?.trim()) issues.push('A population bound requires an approved sampled input distribution; a fixed matrix reports partition coverage only (EVAL-019).');
  return issues;
}

/** A failure adds a permanent regression case; it never burns or removes the suite (EVAL-019). */
export function recordFidelityFailure(manifest: FidelityManifest, failedCaseId: string, regression: FidelityCase): FidelityManifest {
  if (!manifest.cases.some((c) => c.id === failedCaseId)) throw new Error(`Unknown case ${failedCaseId}.`);
  return { ...manifest, cases: [...manifest.cases, { ...regression, permanentRegression: true }] };
}
