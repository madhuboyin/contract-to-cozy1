import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../ask/askOperationRegistry';
import { retrieveAskOperationCandidates } from '../ask/askSemanticRouter';
import {
  ASK_ROUTING_CALIBRATION_OBSERVATIONS,
  ASK_ROUTING_CALIBRATION_EVIDENCE_METADATA,
  type AskRoutingCalibrationObservation,
} from '../ask/askRoutingCalibrationEvidence';
import {
  deriveAskRoutingCalibrationAnchors,
  type AskRoutingCalibrationKind,
} from '../ask/askRoutingCalibration';

type BoundedMetadata = Record<string, unknown>;

const TRACKED_EVENTS = [
  'CAPABILITY_RESOLVED', 'ANSWER_TRUST_VALIDATED', 'CORRECTION_REQUESTED',
  'CLARIFICATION_SUBMITTED',
] as const;

export const ASK_REVIEWED_REGRESSION_DATASET_VERSION = 'ask-reviewed-regression-v1';
export type AskTrustReviewStatus = 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED' | 'PROMOTED';

export interface AskTrustLearningEvent {
  executionId: string;
  eventType: string;
  metadataJson: Prisma.JsonValue | null;
  createdAt: Date;
  execution: {
    operationId: string | null;
    intentConfidence: number | null;
    status: string;
  };
}

interface AskTrustLearningOptions {
  /** Test/evaluation seam. Production callers always read the bounded event projection below. */
  events?: AskTrustLearningEvent[];
}

function metadata(value: Prisma.JsonValue | null): BoundedMetadata {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as BoundedMetadata : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 120 ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 20) : [];
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function windowBounds(from?: Date, to?: Date): { from: Date; to: Date } {
  const end = to ?? new Date();
  return { from: from ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000), to: end };
}

export async function getAskTrustLearningReport(
  from?: Date,
  to?: Date,
  options: AskTrustLearningOptions = {},
) {
  const period = windowBounds(from, to);
  const events: AskTrustLearningEvent[] = options.events ?? await prisma.askExecutionEvent.findMany({
    where: { eventType: { in: [...TRACKED_EVENTS] }, createdAt: { gte: period.from, lte: period.to } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 50_000,
    select: {
      executionId: true, eventType: true, metadataJson: true, createdAt: true,
      execution: { select: { operationId: true, intentConfidence: true, status: true } },
    },
  });

  const routing = new Map<string, typeof events[number]>();
  const validation = new Map<string, typeof events[number]>();
  const corrected = new Map<string, { kind: string; operationId: string; language: string; highConfidence: boolean }>();
  const clarificationResolved = new Set<string>();
  const versionCounts = new Map<string, number>();

  for (const event of events) {
    const meta = metadata(event.metadataJson);
    if (event.eventType === 'CAPABILITY_RESOLVED') {
      routing.set(event.executionId, event);
      const versionKey = [text(meta.language) ?? 'en', text(meta.operationSemanticIndexVersion) ?? 'unknown-index', text(meta.operationSemanticVersion) ?? 'unknown-contract', text(meta.classifierMode) ?? 'unknown-classifier'].join('|');
      versionCounts.set(versionKey, (versionCounts.get(versionKey) ?? 0) + 1);
    }
    if (event.eventType === 'ANSWER_TRUST_VALIDATED') validation.set(event.executionId, event);
    if (event.eventType === 'CLARIFICATION_SUBMITTED') clarificationResolved.add(event.executionId);
    if (event.eventType === 'CORRECTION_REQUESTED') {
      const kind = text(meta.kind) ?? 'UNKNOWN';
      const operationId = event.execution.operationId ?? 'UNRESOLVED';
      const routeMeta = metadata(routing.get(event.executionId)?.metadataJson ?? null);
      const language = text(routeMeta.language) ?? 'en';
      const highConfidence = text(routeMeta.routingConfidenceBand) === 'HIGH' || (event.execution.intentConfidence ?? 0) >= 0.75;
      corrected.set(event.executionId, { kind, operationId, language, highConfidence });
    }
  }

  const operation = new Map<string, {
    operationId: string; language: string;
    routed: number; highConfidence: number; clarified: number; validations: number;
    relevancePass: number; repairs: number; corrections: number; semanticFailures: number;
  }>();
  const row = (operationId: string, language: string) => {
    const key = `${language}|${operationId}`;
    const current = operation.get(key) ?? { operationId, language, routed: 0, highConfidence: 0, clarified: 0, validations: 0, relevancePass: 0, repairs: 0, corrections: 0, semanticFailures: 0 };
    operation.set(key, current);
    return current;
  };

  let highConfidenceResponses = 0;
  let clarificationRequests = 0;
  let modelDisabledResolved = 0;
  for (const event of routing.values()) {
    const meta = metadata(event.metadataJson);
    const operationId = text(meta.operationId) ?? event.execution.operationId ?? 'UNRESOLVED';
    const current = row(operationId, text(meta.language) ?? 'en');
    current.routed += 1;
    if (text(meta.routingConfidenceBand) === 'HIGH') { current.highConfidence += 1; highConfidenceResponses += 1; }
    if (text(meta.routingStage) === 'CLARIFICATION') { current.clarified += 1; clarificationRequests += 1; }
    if (text(meta.classifierMode) === 'DISABLED' && !['FAILED_RETRYABLE', 'FAILED_TERMINAL'].includes(event.execution.status)) modelDisabledResolved += 1;
  }

  let relevancePass = 0;
  let unsupportedAbsenceClaims = 0;
  let irrelevantBoundaries = 0;
  let repairedResponses = 0;
  let semanticFailures = 0;
  const failureClusters = new Map<string, { operationId: string; language: string; reasonCode: string; count: number }>();
  for (const event of validation.values()) {
    const meta = metadata(event.metadataJson);
    const operationId = event.execution.operationId ?? 'UNRESOLVED';
    const routeMeta = metadata(routing.get(event.executionId)?.metadataJson ?? null);
    const language = text(routeMeta.language) ?? text(metadata(meta.semantic as Prisma.JsonValue ?? null).language) ?? 'en';
    const current = row(operationId, language);
    current.validations += 1;
    const checks = metadata(meta.checks as Prisma.JsonValue ?? null);
    if (text(checks.questionCoverage) === 'PASS') { relevancePass += 1; current.relevancePass += 1; }
    if (meta.repaired === true) { repairedResponses += 1; current.repairs += 1; }
    const semantic = metadata(meta.semantic as Prisma.JsonValue ?? null);
    if (text(semantic.outcome) === 'FAIL') { semanticFailures += 1; current.semanticFailures += 1; }
    const reasons = strings(meta.reasonCodes);
    if (reasons.includes('UNSUPPORTED_ABSENCE_CLAIM')) unsupportedAbsenceClaims += 1;
    if (reasons.includes('INAPPLICABLE_BOUNDARY_REMOVED')) irrelevantBoundaries += 1;
    for (const reasonCode of reasons) {
      if (['SELECTED_OPERATION_TOP_MATCH', 'DIRECT_ANSWER_SEMANTIC_MATCH', 'NON_SUCCESS_RESULT'].includes(reasonCode)) continue;
      const key = `${language}|${operationId}|${reasonCode}`;
      const cluster = failureClusters.get(key) ?? { operationId, language, reasonCode, count: 0 };
      cluster.count += 1;
      failureClusters.set(key, cluster);
    }
  }

  for (const correction of corrected.values()) row(correction.operationId, correction.language).corrections += 1;
  const incorrectHighConfidence = [...corrected.values()].filter((item) => item.highConfidence && ['INTENT', 'ENTITY'].includes(item.kind)).length;
  const operationRows = [...operation.values()].map((value) => ({
    ...value,
    clarificationRate: rate(value.clarified, value.routed),
    directAnswerRelevanceRate: rate(value.relevancePass, value.validations),
    correctionRate: rate(value.corrections, value.routed),
    repairRate: rate(value.repairs, value.validations),
    thresholdRecommendation: value.routed < 20 ? 'INSUFFICIENT_EVIDENCE'
      : (rate(value.corrections, value.routed) ?? 0) > 0.02 || value.semanticFailures > 0 ? 'RAISE_OR_CLARIFY_MORE'
        : (rate(value.clarified, value.routed) ?? 0) > 0.3 && value.corrections === 0 ? 'REVIEW_FOR_LOWER_READ_THRESHOLD'
          : 'KEEP_CURRENT',
  })).sort((left, right) => right.routed - left.routed || left.language.localeCompare(right.language) || left.operationId.localeCompare(right.operationId));

  const correctionClusters = [...corrected.values()].reduce<Array<{ operationId: string; language: string; kind: string; count: number }>>((clusters, item) => {
    const existing = clusters.find((cluster) => cluster.operationId === item.operationId && cluster.language === item.language && cluster.kind === item.kind);
    if (existing) existing.count += 1;
    else clusters.push({ operationId: item.operationId, language: item.language, kind: item.kind, count: 1 });
    return clusters;
  }, []).sort((left, right) => right.count - left.count || left.operationId.localeCompare(right.operationId));

  const reviewedFixtureCandidates = [
    ...[...failureClusters.values()].sort((left, right) => right.count - left.count).slice(0, 20).map((cluster) => ({
      fixtureKey: createHash('sha256').update(`failure|${cluster.language}|${cluster.operationId}|${cluster.reasonCode}`).digest('hex').slice(0, 16),
      operationId: cluster.operationId, language: cluster.language, category: 'ANSWER_TRUST_FAILURE', reasonCode: cluster.reasonCode, occurrences: cluster.count, reviewStatus: 'NEEDS_REVIEW' as const,
    })),
    ...correctionClusters.slice(0, 20).map((cluster) => ({
      fixtureKey: createHash('sha256').update(`correction|${cluster.language}|${cluster.operationId}|${cluster.kind}`).digest('hex').slice(0, 16),
      operationId: cluster.operationId, language: cluster.language, category: 'HOMEOWNER_CORRECTION', reasonCode: cluster.kind, occurrences: cluster.count, reviewStatus: 'NEEDS_REVIEW' as const,
    })),
  ].sort((left, right) => right.occurrences - left.occurrences).slice(0, 25);

  const incorrectHighConfidenceRate = rate(incorrectHighConfidence, highConfidenceResponses);
  const directAnswerRelevanceRate = rate(relevancePass, validation.size);
  const resolvedClarifications = [...routing.entries()].filter(([executionId, event]) => (
    text(metadata(event.metadataJson).routingStage) === 'CLARIFICATION'
      && clarificationResolved.has(executionId)
  )).length;
  const alerts = [
    unsupportedAbsenceClaims > 0 ? { severity: 'CRITICAL', code: 'UNSUPPORTED_ABSENCE_CLAIMS', count: unsupportedAbsenceClaims, action: 'Inspect affected operation/source contracts before expanding routing.' } : null,
    (incorrectHighConfidenceRate ?? 0) >= 0.01 ? { severity: 'HIGH', code: 'INCORRECT_HIGH_CONFIDENCE_RATE', count: incorrectHighConfidence, action: 'Raise or narrow thresholds for the affected operations and review correction clusters.' } : null,
    directAnswerRelevanceRate != null && directAnswerRelevanceRate < 0.95 ? { severity: 'HIGH', code: 'DIRECT_ANSWER_RELEVANCE_BELOW_OBJECTIVE', count: validation.size - relevancePass, action: 'Review answer-trust failure clusters and operation first-block contracts.' } : null,
    semanticFailures > 0 ? { severity: 'MEDIUM', code: 'SEMANTIC_ANSWER_MISMATCHES', count: semanticFailures, action: 'Promote reviewed mismatch clusters into regression fixtures.' } : null,
  ].filter((alert): alert is NonNullable<typeof alert> => Boolean(alert));

  return {
    generatedAt: new Date().toISOString(),
    period: { from: period.from.toISOString(), to: period.to.toISOString() },
    privacy: { rawMessagesRead: false, rawMessagesReturned: false, boundedMetadataOnly: true },
    metrics: {
      routedExecutions: routing.size, validatedResponses: validation.size,
      incorrectHighConfidenceResponses: incorrectHighConfidence, incorrectHighConfidenceRate,
      directAnswerRelevanceRate, unsupportedAbsenceClaims, irrelevantBoundaries,
      clarificationRate: rate(clarificationRequests, routing.size),
      clarificationResolutionRate: rate(resolvedClarifications, clarificationRequests),
      correctionRate: rate(corrected.size, routing.size), repairRate: rate(repairedResponses, validation.size),
      semanticFailureCount: semanticFailures, modelDisabledSuccessfulResolutionRate: rate(modelDisabledResolved, [...routing.values()].filter((event) => text(metadata(event.metadataJson).classifierMode) === 'DISABLED').length),
    },
    operations: operationRows,
    correctionClusters,
    reviewedFixtureCandidates,
    registeredOperationIds: Object.keys(ASK_OPERATION_DEFINITIONS) as AskOperationId[],
    versionLineage: [...versionCounts.entries()].map(([key, count]) => {
      const [language, semanticIndexVersion, semanticContractVersion, classifierMode] = key.split('|');
      return { language, semanticIndexVersion, semanticContractVersion, classifierMode, count };
    }).sort((left, right) => right.count - left.count),
    alerts,
    controls: { recommendationsAreAdvisory: true, automaticThresholdMutation: false, rawTextFixturePromotion: false },
  };
}

export async function syncAskTrustReviewCandidates(from?: Date, to?: Date) {
  const report = await getAskTrustLearningReport(from, to);
  const synced = [];
  for (const candidate of report.reviewedFixtureCandidates) {
    synced.push(await prisma.askTrustReviewCandidate.upsert({
      where: { fixtureKey: candidate.fixtureKey },
      create: {
        fixtureKey: candidate.fixtureKey,
        datasetVersion: ASK_REVIEWED_REGRESSION_DATASET_VERSION,
        operationId: candidate.operationId,
        language: candidate.language,
        category: candidate.category,
        reasonCode: candidate.reasonCode,
        occurrences: candidate.occurrences,
        reviewStatus: 'NEEDS_REVIEW',
        sourceMetadataJson: {
          period: report.period,
          boundedMetadataOnly: true,
          source: 'ASK_TRUST_LEARNING_REPORT',
        },
      },
      update: {
        occurrences: candidate.occurrences,
        sourceMetadataJson: {
          period: report.period,
          boundedMetadataOnly: true,
          source: 'ASK_TRUST_LEARNING_REPORT',
        },
      },
    }));
  }
  return { datasetVersion: ASK_REVIEWED_REGRESSION_DATASET_VERSION, synced: synced.length };
}

export async function listAskTrustReviewCandidates(status?: AskTrustReviewStatus) {
  return prisma.askTrustReviewCandidate.findMany({
    where: status ? { reviewStatus: status } : undefined,
    orderBy: [{ occurrences: 'desc' }, { updatedAt: 'desc' }],
    take: 500,
  });
}

export async function reviewAskTrustCandidate(input: {
  fixtureKey: string;
  disposition: 'APPROVE' | 'REJECT';
  expectedOperationId?: AskOperationId;
  reviewedQuestion?: string;
  reviewNotes?: string;
  reviewerId: string;
}) {
  const candidate = await prisma.askTrustReviewCandidate.findUnique({ where: { fixtureKey: input.fixtureKey } });
  if (!candidate) throw Object.assign(new Error('Ask trust review candidate not found.'), { code: 'ASK_TRUST_REVIEW_CANDIDATE_NOT_FOUND' });
  if (candidate.reviewStatus === 'PROMOTED') throw Object.assign(new Error('A promoted fixture cannot be reviewed again.'), { code: 'ASK_TRUST_FIXTURE_ALREADY_PROMOTED' });
  if (input.disposition === 'APPROVE') {
    if (!input.expectedOperationId || !ASK_OPERATION_DEFINITIONS[input.expectedOperationId]) {
      throw Object.assign(new Error('Approval requires a registered expected operation.'), { code: 'ASK_TRUST_EXPECTED_OPERATION_REQUIRED' });
    }
    if (!input.reviewedQuestion?.trim()) {
      throw Object.assign(new Error('Approval requires de-identified representative wording.'), { code: 'ASK_TRUST_REVIEWED_QUESTION_REQUIRED' });
    }
  }
  return prisma.askTrustReviewCandidate.update({
    where: { fixtureKey: input.fixtureKey },
    data: {
      reviewStatus: input.disposition === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      expectedOperationId: input.disposition === 'APPROVE' ? input.expectedOperationId : null,
      reviewedQuestion: input.disposition === 'APPROVE' ? input.reviewedQuestion!.trim() : null,
      reviewNotes: input.reviewNotes?.trim() || null,
      reviewerId: input.reviewerId,
      reviewedAt: new Date(),
      promotedAt: null,
    },
  });
}

export async function promoteAskTrustCandidate(fixtureKey: string, reviewerId: string) {
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.askTrustReviewCandidate.findUnique({ where: { fixtureKey } });
    if (!candidate) throw Object.assign(new Error('Ask trust review candidate not found.'), { code: 'ASK_TRUST_REVIEW_CANDIDATE_NOT_FOUND' });
    if (candidate.reviewStatus === 'PROMOTED') return candidate;
    if (candidate.reviewStatus !== 'APPROVED' || !candidate.expectedOperationId || !candidate.reviewedQuestion) {
      throw Object.assign(new Error('Only an approved, labeled candidate can be promoted.'), { code: 'ASK_TRUST_FIXTURE_APPROVAL_REQUIRED' });
    }
    if (!ASK_OPERATION_DEFINITIONS[candidate.expectedOperationId as AskOperationId]) {
      throw Object.assign(new Error('The reviewed operation is no longer registered.'), { code: 'ASK_TRUST_EXPECTED_OPERATION_UNREGISTERED' });
    }
    return tx.askTrustReviewCandidate.update({
      where: { fixtureKey },
      data: {
        reviewStatus: 'PROMOTED',
        reviewerId,
        promotedAt: new Date(),
        datasetVersion: ASK_REVIEWED_REGRESSION_DATASET_VERSION,
      },
    });
  });
}

export async function getPromotedAskTrustRegressionCorpus() {
  const rows = await prisma.askTrustReviewCandidate.findMany({
    where: { reviewStatus: 'PROMOTED', datasetVersion: ASK_REVIEWED_REGRESSION_DATASET_VERSION },
    orderBy: [{ promotedAt: 'asc' }, { fixtureKey: 'asc' }],
  });
  return {
    schemaVersion: '1.0',
    datasetVersion: ASK_REVIEWED_REGRESSION_DATASET_VERSION,
    fixtures: rows.map((row) => ({
      fixtureId: row.fixtureKey,
      operationId: row.expectedOperationId as AskOperationId,
      message: row.reviewedQuestion!,
      language: row.language,
      provenance: 'REVIEWED_PRODUCTION_CORRECTION' as const,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      promotedAt: row.promotedAt?.toISOString() ?? null,
    })),
  };
}

/**
 * Produces a reviewable, immutable calibration proposal from the active
 * evaluation evidence plus explicitly promoted production corrections.
 * It never mutates the active runtime curve; activation remains a separate
 * code-review/release decision so correction traffic cannot tune routing by
 * itself.
 */
export async function getAskTrustCalibrationArtifact(options: {
  /** Test/offline seam; production callers always use the promoted durable corpus. */
  corpus?: Awaited<ReturnType<typeof getPromotedAskTrustRegressionCorpus>>;
} = {}) {
  const corpus = options.corpus ?? await getPromotedAskTrustRegressionCorpus();
  const eligibleOperationIds = Object.values(ASK_OPERATION_DEFINITIONS)
    .filter((definition) => !definition.safetyClass.endsWith('_BOUNDARY'))
    .map((definition) => definition.operationId);
  const productionObservations: AskRoutingCalibrationObservation[] = [];
  const excludedFixtures: Array<{ fixtureId: string; reason: string }> = [];

  for (const fixture of corpus.fixtures) {
    const definition = ASK_OPERATION_DEFINITIONS[fixture.operationId];
    if (!definition || definition.safetyClass.endsWith('_BOUNDARY')) {
      excludedFixtures.push({ fixtureId: fixture.fixtureId, reason: 'DETERMINISTIC_BOUNDARY_NOT_SEMANTICALLY_CALIBRATED' });
      continue;
    }
    if (fixture.language !== 'en') {
      excludedFixtures.push({ fixtureId: fixture.fixtureId, reason: 'LANGUAGE_NOT_CERTIFIED_FOR_ACTIVE_CALIBRATION' });
      continue;
    }
    const candidates = retrieveAskOperationCandidates(fixture.message, {
      eligibleOperationIds,
      topK: eligibleOperationIds.length,
      language: 'en',
    }).sort((left, right) => right.rawScore - left.rawScore);
    const expected = candidates.find((candidate) => candidate.operationId === fixture.operationId);
    const competitor = candidates.find((candidate) => candidate.operationId !== fixture.operationId);
    if (!expected || !competitor) {
      excludedFixtures.push({ fixtureId: fixture.fixtureId, reason: 'EXPECTED_OR_COMPETING_CANDIDATE_UNAVAILABLE' });
      continue;
    }
    productionObservations.push(
      {
        observationId: `${fixture.fixtureId}-expected`,
        sourceFixtureId: fixture.fixtureId,
        candidateOperationId: expected.operationId,
        rawScore: expected.rawScore,
        correct: true,
      },
      {
        observationId: `${fixture.fixtureId}-competitor`,
        sourceFixtureId: fixture.fixtureId,
        candidateOperationId: competitor.operationId,
        rawScore: competitor.rawScore,
        correct: false,
      },
    );
  }

  const combinedObservations = [...ASK_ROUTING_CALIBRATION_OBSERVATIONS, ...productionObservations];
  const kinds: AskRoutingCalibrationKind[] = ['READ', 'MATERIAL', 'WRITE'];
  const profiles = Object.fromEntries(kinds.map((kind) => [
    kind,
    { anchors: deriveAskRoutingCalibrationAnchors(combinedObservations, kind) },
  ]));
  const evidenceVersion = createHash('sha256').update(JSON.stringify({
    baseDatasetVersion: ASK_ROUTING_CALIBRATION_EVIDENCE_METADATA.datasetVersion,
    reviewedCorrectionDatasetVersion: corpus.datasetVersion,
    observations: combinedObservations,
  })).digest('hex').slice(0, 12);

  return {
    schemaVersion: '1.0',
    artifactVersion: `ask-routing-calibration-proposal-${evidenceVersion}`,
    generatedAt: new Date().toISOString(),
    provenance: {
      baseDatasetVersion: ASK_ROUTING_CALIBRATION_EVIDENCE_METADATA.datasetVersion,
      reviewedCorrectionDatasetVersion: corpus.datasetVersion,
      evaluationObservationCount: ASK_ROUTING_CALIBRATION_OBSERVATIONS.length,
      promotedCorrectionFixtureCount: corpus.fixtures.length,
      productionCorrectionObservationCount: productionObservations.length,
    },
    observations: combinedObservations,
    profiles,
    excludedFixtures,
    controls: {
      reviewedCorrectionsOnly: true,
      activeCalibrationMutated: false,
      activationRequiresCodeReviewAndRelease: true,
      recommendationsAreAdvisory: true,
    },
  };
}
