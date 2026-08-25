import { prisma } from '../../lib/prisma';
import { isSafetySensitiveFeedback, type FeedbackReasonCode } from './feedbackContract';
import { runPhase7EvaluationHarness, type Phase7EvaluationResult } from '../intelligence/phase7EvaluationHarness';

export interface FeedbackQualityRow {
  targetType: string | null;
  targetId?: string | null;
  surface?: string | null;
  reasonCodes: string[];
  rating?: string | null;
  capabilityId?: string | null;
  capabilityVersion?: string | null;
  contextVersion?: string | null;
}

export interface FeedbackTargetTypeQuality {
  targetType: string;
  totalCount: number;
  usefulCount: number;
  notUsefulCount: number;
  usefulRate: number | null;
  safetySensitiveCount: number;
  reasonCodeCounts: Record<string, number>;
}

export interface CapabilityVersionQuality {
  capabilityId: string;
  version: string;
  feedbackCount: number;
  usefulCount: number;
  notUsefulCount: number;
  usefulRate: number | null;
  dismissalCount: number;
  dismissalReasonCounts: Record<string, number>;
  correctionCount: number;
  correctionRate: number | null;
  acceptedWorkCount: number;
  completedWorkCount: number;
  completionConversionRate: number | null;
  outcomeCount: number;
  corroboratedOutcomeCount: number;
  verifiedOutcomeCount: number;
  verifiedOutcomeRate: number | null;
  staleOutputIncidentCount: number;
  unavailableOutputIncidentCount: number;
  crossSurfaceInconsistencyCount: number;
  generatedEvaluationCount: number;
  generatedEvaluationPassCount: number;
  generatedEvaluationPassRate: number | null;
}

export interface FeedbackQualityReport {
  byTargetType: FeedbackTargetTypeQuality[];
  byCapabilityVersion: CapabilityVersionQuality[];
  generatedContentEvaluations: Phase7EvaluationResult[];
  summary: {
    capabilityVersionCount: number;
    failingEvaluationCount: number;
    staleOrUnavailableIncidentCount: number;
    crossSurfaceInconsistencyCount: number;
  };
}

export function aggregateFeedbackQualityByTargetType(rows: readonly FeedbackQualityRow[]): FeedbackTargetTypeQuality[] {
  const byTarget = new Map<string, FeedbackQualityRow[]>();
  for (const row of rows) {
    const targetType = row.targetType ?? 'UNTYPED';
    const bucket = byTarget.get(targetType) ?? [];
    bucket.push(row);
    byTarget.set(targetType, bucket);
  }
  return [...byTarget.entries()].map(([targetType, bucket]) => {
    const reasonCodeCounts: Record<string, number> = {};
    let usefulCount = 0;
    let notUsefulCount = 0;
    let safetySensitiveCount = 0;
    for (const row of bucket) {
      const codes = row.reasonCodes as FeedbackReasonCode[];
      for (const code of codes) reasonCodeCounts[code] = (reasonCodeCounts[code] ?? 0) + 1;
      if (codes.includes('USEFUL')) usefulCount += 1;
      if (codes.includes('NOT_USEFUL')) notUsefulCount += 1;
      if (isSafetySensitiveFeedback(codes)) safetySensitiveCount += 1;
    }
    const rated = usefulCount + notUsefulCount;
    return { targetType, totalCount: bucket.length, usefulCount, notUsefulCount, usefulRate: rated ? usefulCount / rated : null, safetySensitiveCount, reasonCodeCounts };
  }).sort((a, b) => b.totalCount - a.totalCount || a.targetType.localeCompare(b.targetType));
}

type MutableCapabilityQuality = Omit<CapabilityVersionQuality,
  'usefulRate' | 'correctionRate' | 'completionConversionRate' | 'verifiedOutcomeRate' | 'generatedEvaluationPassRate'>;

function dimensionKey(capabilityId: string, version: string): string {
  return `${capabilityId}\u0000${version}`;
}

function feedbackDimension(row: FeedbackQualityRow): { capabilityId: string; version: string } {
  return {
    capabilityId: row.capabilityId ?? `feedback:${(row.targetType ?? 'UNTYPED').toLowerCase()}`,
    version: row.capabilityVersion ?? row.contextVersion ?? 'unknown',
  };
}

function emptyQuality(capabilityId: string, version: string): MutableCapabilityQuality {
  return {
    capabilityId, version, feedbackCount: 0, usefulCount: 0, notUsefulCount: 0,
    dismissalCount: 0, dismissalReasonCounts: {}, correctionCount: 0,
    acceptedWorkCount: 0, completedWorkCount: 0, outcomeCount: 0,
    corroboratedOutcomeCount: 0, verifiedOutcomeCount: 0,
    staleOutputIncidentCount: 0, unavailableOutputIncidentCount: 0,
    crossSurfaceInconsistencyCount: 0, generatedEvaluationCount: 0, generatedEvaluationPassCount: 0,
  };
}

function complete(row: MutableCapabilityQuality): CapabilityVersionQuality {
  const rated = row.usefulCount + row.notUsefulCount;
  return {
    ...row,
    usefulRate: rated ? row.usefulCount / rated : null,
    correctionRate: row.feedbackCount ? row.correctionCount / row.feedbackCount : null,
    completionConversionRate: row.acceptedWorkCount ? row.completedWorkCount / row.acceptedWorkCount : null,
    verifiedOutcomeRate: row.outcomeCount ? row.verifiedOutcomeCount / row.outcomeCount : null,
    generatedEvaluationPassRate: row.generatedEvaluationCount ? row.generatedEvaluationPassCount / row.generatedEvaluationCount : null,
  };
}

export function aggregateCapabilityVersionQuality(input: {
  feedback: readonly FeedbackQualityRow[];
  workItems: readonly { state: string; acceptanceState: string; disposition: string | null; sourceVersion: string | null; sources: readonly { sourceType: string; sourceVersion: string | null; active: boolean }[] }[];
  outcomes: readonly { sourceType: string; observedPayloadVersion: string; verificationStatus: string }[];
  currentness: readonly { consumerKey: string; consumerVersion: string; status: string }[];
  evaluations: readonly Phase7EvaluationResult[];
}): CapabilityVersionQuality[] {
  const byDimension = new Map<string, MutableCapabilityQuality>();
  const get = (capabilityId: string, version: string) => {
    const mapKey = dimensionKey(capabilityId, version);
    const existing = byDimension.get(mapKey) ?? emptyQuality(capabilityId, version);
    byDimension.set(mapKey, existing);
    return existing;
  };

  const targetSentiments = new Map<string, Map<string, Set<'USEFUL' | 'NOT_USEFUL'>>>();
  for (const feedback of input.feedback) {
    const { capabilityId, version } = feedbackDimension(feedback);
    const row = get(capabilityId, version);
    row.feedbackCount += 1;
    if (feedback.reasonCodes.includes('USEFUL')) row.usefulCount += 1;
    if (feedback.reasonCodes.includes('NOT_USEFUL')) row.notUsefulCount += 1;
    if (feedback.rating === 'dismissed') {
      row.dismissalCount += 1;
      const reason = feedback.reasonCodes[0] ?? 'UNSPECIFIED';
      row.dismissalReasonCounts[reason] = (row.dismissalReasonCounts[reason] ?? 0) + 1;
    }
    if (feedback.reasonCodes.includes('WRONG_FACT')) row.correctionCount += 1;
    if (feedback.targetId && feedback.surface) {
      const targetKey = `${feedback.targetType ?? 'UNTYPED'}:${feedback.targetId}`;
      const surfaces = targetSentiments.get(targetKey) ?? new Map();
      const sentiments = surfaces.get(feedback.surface) ?? new Set<'USEFUL' | 'NOT_USEFUL'>();
      if (feedback.reasonCodes.includes('USEFUL')) sentiments.add('USEFUL');
      if (feedback.reasonCodes.includes('NOT_USEFUL')) sentiments.add('NOT_USEFUL');
      surfaces.set(feedback.surface, sentiments);
      targetSentiments.set(targetKey, surfaces);
    }
  }

  const inconsistentTargets = new Set<string>();
  for (const [targetKey, surfaces] of targetSentiments) {
    const across = new Set([...surfaces.values()].flatMap((sentiments) => [...sentiments]));
    if (surfaces.size > 1 && across.size > 1) inconsistentTargets.add(targetKey);
  }
  const countedInconsistencies = new Set<string>();
  for (const feedback of input.feedback) {
    const targetKey = `${feedback.targetType ?? 'UNTYPED'}:${feedback.targetId ?? ''}`;
    if (!feedback.targetId || !inconsistentTargets.has(targetKey)) continue;
    const { capabilityId, version } = feedbackDimension(feedback);
    const uniqueKey = `${dimensionKey(capabilityId, version)}:${targetKey}`;
    if (countedInconsistencies.has(uniqueKey)) continue;
    countedInconsistencies.add(uniqueKey);
    get(capabilityId, version).crossSurfaceInconsistencyCount += 1;
  }

  for (const workItem of input.workItems) {
    const source = workItem.sources.find((candidate) => candidate.active) ?? workItem.sources[0];
    const row = get(`work:${(source?.sourceType ?? 'UNKNOWN').toLowerCase()}`, source?.sourceVersion ?? workItem.sourceVersion ?? 'unknown');
    if (workItem.acceptanceState === 'ACCEPTED') row.acceptedWorkCount += 1;
    if (workItem.state === 'VERIFIED' || (workItem.state === 'CLOSED' && workItem.disposition == null)) row.completedWorkCount += 1;
    if (workItem.disposition) {
      row.dismissalCount += 1;
      row.dismissalReasonCounts[workItem.disposition] = (row.dismissalReasonCounts[workItem.disposition] ?? 0) + 1;
    }
  }
  for (const outcome of input.outcomes) {
    const row = get(`outcome:${outcome.sourceType.toLowerCase()}`, outcome.observedPayloadVersion);
    if (outcome.verificationStatus === 'REJECTED' || outcome.verificationStatus === 'SUPERSEDED') continue;
    row.outcomeCount += 1;
    if (outcome.verificationStatus === 'CORROBORATED') row.corroboratedOutcomeCount += 1;
    if (outcome.verificationStatus === 'VERIFIED') row.verifiedOutcomeCount += 1;
  }
  for (const currentness of input.currentness) {
    const row = get(currentness.consumerKey, currentness.consumerVersion);
    if (currentness.status === 'STALE') row.staleOutputIncidentCount += 1;
    if (currentness.status === 'UNAVAILABLE') row.unavailableOutputIncidentCount += 1;
  }
  for (const evaluation of input.evaluations) {
    const row = get(evaluation.capabilityId, evaluation.capabilityVersion);
    row.generatedEvaluationCount += 1;
    if (evaluation.passed) row.generatedEvaluationPassCount += 1;
  }
  return [...byDimension.values()].map(complete)
    .sort((a, b) => a.capabilityId.localeCompare(b.capabilityId) || a.version.localeCompare(b.version));
}

export async function getFeedbackQualityAggregates(input: { since?: Date } = {}): Promise<FeedbackQualityReport> {
  const createdWhere = input.since ? { createdAt: { gte: input.since } } : undefined;
  const [feedback, workItems, outcomes, currentness] = await Promise.all([
    prisma.feedback.findMany({ where: createdWhere, select: { targetType: true, targetId: true, surface: true, reasonCodes: true, rating: true, capabilityId: true, capabilityVersion: true, contextVersion: true } }),
    prisma.operationalWorkItem.findMany({ where: createdWhere, select: { state: true, acceptanceState: true, disposition: true, sourceVersion: true, sources: { select: { sourceType: true, sourceVersion: true, active: true } } } }),
    prisma.outcomeObservation.findMany({ where: input.since ? { recordedAt: { gte: input.since } } : undefined, select: { sourceType: true, observedPayloadVersion: true, verificationStatus: true } }),
    prisma.intelligenceConsumerCurrentness.findMany({ where: input.since ? { updatedAt: { gte: input.since }, status: { in: ['STALE', 'UNAVAILABLE'] } } : { status: { in: ['STALE', 'UNAVAILABLE'] } }, select: { consumerKey: true, consumerVersion: true, status: true } }),
  ]);
  const evaluations = runPhase7EvaluationHarness();
  const byCapabilityVersion = aggregateCapabilityVersionQuality({ feedback, workItems, outcomes, currentness, evaluations });
  return {
    byTargetType: aggregateFeedbackQualityByTargetType(feedback),
    byCapabilityVersion,
    generatedContentEvaluations: evaluations,
    summary: {
      capabilityVersionCount: byCapabilityVersion.length,
      failingEvaluationCount: evaluations.filter((candidate) => !candidate.passed).length,
      staleOrUnavailableIncidentCount: byCapabilityVersion.reduce((sum, row) => sum + row.staleOutputIncidentCount + row.unavailableOutputIncidentCount, 0),
      crossSurfaceInconsistencyCount: byCapabilityVersion.reduce((sum, row) => sum + row.crossSurfaceInconsistencyCount, 0),
    },
  };
}
