import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

type BoundedMetadata = Record<string, unknown>;

const TRACKED_EVENTS = [
  'CAPABILITY_RESOLVED', 'ANSWER_TRUST_VALIDATED', 'CORRECTION_REQUESTED',
  'CLARIFICATION_SUBMITTED',
] as const;

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
  const corrected = new Map<string, { kind: string; operationId: string; highConfidence: boolean }>();
  const clarificationResolved = new Set<string>();
  const versionCounts = new Map<string, number>();

  for (const event of events) {
    const meta = metadata(event.metadataJson);
    if (event.eventType === 'CAPABILITY_RESOLVED') {
      routing.set(event.executionId, event);
      const versionKey = [text(meta.operationSemanticIndexVersion) ?? 'unknown-index', text(meta.operationSemanticVersion) ?? 'unknown-contract', text(meta.classifierMode) ?? 'unknown-classifier'].join('|');
      versionCounts.set(versionKey, (versionCounts.get(versionKey) ?? 0) + 1);
    }
    if (event.eventType === 'ANSWER_TRUST_VALIDATED') validation.set(event.executionId, event);
    if (event.eventType === 'CLARIFICATION_SUBMITTED') clarificationResolved.add(event.executionId);
    if (event.eventType === 'CORRECTION_REQUESTED') {
      const kind = text(meta.kind) ?? 'UNKNOWN';
      const operationId = event.execution.operationId ?? 'UNRESOLVED';
      const routeMeta = metadata(routing.get(event.executionId)?.metadataJson ?? null);
      const highConfidence = text(routeMeta.routingConfidenceBand) === 'HIGH' || (event.execution.intentConfidence ?? 0) >= 0.75;
      corrected.set(event.executionId, { kind, operationId, highConfidence });
    }
  }

  const operation = new Map<string, {
    routed: number; highConfidence: number; clarified: number; validations: number;
    relevancePass: number; repairs: number; corrections: number; semanticFailures: number;
  }>();
  const row = (operationId: string) => {
    const current = operation.get(operationId) ?? { routed: 0, highConfidence: 0, clarified: 0, validations: 0, relevancePass: 0, repairs: 0, corrections: 0, semanticFailures: 0 };
    operation.set(operationId, current);
    return current;
  };

  let highConfidenceResponses = 0;
  let clarificationRequests = 0;
  let modelDisabledResolved = 0;
  for (const event of routing.values()) {
    const meta = metadata(event.metadataJson);
    const operationId = text(meta.operationId) ?? event.execution.operationId ?? 'UNRESOLVED';
    const current = row(operationId);
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
  const failureClusters = new Map<string, { operationId: string; reasonCode: string; count: number }>();
  for (const event of validation.values()) {
    const meta = metadata(event.metadataJson);
    const operationId = event.execution.operationId ?? 'UNRESOLVED';
    const current = row(operationId);
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
      const key = `${operationId}|${reasonCode}`;
      const cluster = failureClusters.get(key) ?? { operationId, reasonCode, count: 0 };
      cluster.count += 1;
      failureClusters.set(key, cluster);
    }
  }

  for (const correction of corrected.values()) row(correction.operationId).corrections += 1;
  const incorrectHighConfidence = [...corrected.values()].filter((item) => item.highConfidence && ['INTENT', 'ENTITY'].includes(item.kind)).length;
  const operationRows = [...operation.entries()].map(([operationId, value]) => ({
    operationId, ...value,
    clarificationRate: rate(value.clarified, value.routed),
    directAnswerRelevanceRate: rate(value.relevancePass, value.validations),
    correctionRate: rate(value.corrections, value.routed),
    repairRate: rate(value.repairs, value.validations),
    thresholdRecommendation: value.routed < 20 ? 'INSUFFICIENT_EVIDENCE'
      : (rate(value.corrections, value.routed) ?? 0) > 0.02 || value.semanticFailures > 0 ? 'RAISE_OR_CLARIFY_MORE'
        : (rate(value.clarified, value.routed) ?? 0) > 0.3 && value.corrections === 0 ? 'REVIEW_FOR_LOWER_READ_THRESHOLD'
          : 'KEEP_CURRENT',
  })).sort((left, right) => right.routed - left.routed || left.operationId.localeCompare(right.operationId));

  const correctionClusters = [...corrected.values()].reduce<Array<{ operationId: string; kind: string; count: number }>>((clusters, item) => {
    const existing = clusters.find((cluster) => cluster.operationId === item.operationId && cluster.kind === item.kind);
    if (existing) existing.count += 1;
    else clusters.push({ operationId: item.operationId, kind: item.kind, count: 1 });
    return clusters;
  }, []).sort((left, right) => right.count - left.count || left.operationId.localeCompare(right.operationId));

  const reviewedFixtureCandidates = [
    ...[...failureClusters.values()].sort((left, right) => right.count - left.count).slice(0, 20).map((cluster) => ({
      fixtureKey: createHash('sha256').update(`failure|${cluster.operationId}|${cluster.reasonCode}`).digest('hex').slice(0, 16),
      operationId: cluster.operationId, category: 'ANSWER_TRUST_FAILURE', reasonCode: cluster.reasonCode, occurrences: cluster.count, reviewStatus: 'NEEDS_REVIEW' as const,
    })),
    ...correctionClusters.slice(0, 20).map((cluster) => ({
      fixtureKey: createHash('sha256').update(`correction|${cluster.operationId}|${cluster.kind}`).digest('hex').slice(0, 16),
      operationId: cluster.operationId, category: 'HOMEOWNER_CORRECTION', reasonCode: cluster.kind, occurrences: cluster.count, reviewStatus: 'NEEDS_REVIEW' as const,
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
    versionLineage: [...versionCounts.entries()].map(([key, count]) => {
      const [semanticIndexVersion, semanticContractVersion, classifierMode] = key.split('|');
      return { semanticIndexVersion, semanticContractVersion, classifierMode, count };
    }).sort((left, right) => right.count - left.count),
    alerts,
    controls: { recommendationsAreAdvisory: true, automaticThresholdMutation: false, rawTextFixturePromotion: false },
  };
}
