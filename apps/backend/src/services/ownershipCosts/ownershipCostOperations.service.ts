import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  ownershipCostAnomalies,
  ownershipCostReplayTotal,
} from '../../lib/metrics';
import {
  OWNERSHIP_COST_CATEGORY_DEFINITION_VERSION,
  OWNERSHIP_COST_METHOD_VERSION,
  type CanonicalOwnershipCostObservation,
  type OwnershipCostAdapterKey,
} from './ownershipCostAdapters';
import {
  buildOwnershipCostSnapshotDraft,
  type OwnershipCostSnapshotDraft,
} from './ownershipCostSnapshot';

export const OWNERSHIP_COST_OPERATIONS_CONTRACT_VERSION =
  'ownership-cost-operations-v1';
export const OWNERSHIP_COST_REPLAY_CONTRACT_VERSION =
  'ownership-cost-replay-v1';
export const OWNERSHIP_COST_STALE_AFTER_HOURS = 36;
export const OWNERSHIP_COST_CATEGORY_JUMP_PERCENTAGE = 0.5;
export const OWNERSHIP_COST_CATEGORY_JUMP_CENTS = 100_000;

export const EXPECTED_OWNERSHIP_COST_ADAPTERS: readonly OwnershipCostAdapterKey[] = [
  'tax',
  'insurance',
  'financing',
  'expense',
  'utility',
  'hoa',
  'maintenance',
  'recurring-service',
  'project',
  'reserve',
];

type AdapterRunRecord = {
  propertyId: string;
  adapterKey: string;
  adapterVersion: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  sourceCount: number;
  observationCount: number;
  startedAt: Date;
  completedAt: Date | null;
};

type SnapshotRecord = {
  id: string;
  propertyId: string;
  methodVersion: string;
  categoryDefinitionVersion: string;
  inputFingerprint: string;
  coverageStatus: 'CREDIBLE' | 'PARTIAL' | 'ESTIMATE_ONLY' | 'NOT_READY';
  missingCategories: string[];
  computedAt: Date;
};

type ChangeRecord = {
  id: string;
  propertyId: string;
  category: string;
  amountDeltaCents: number;
  evidenceJson: unknown;
  createdAt: Date;
};

type DecisionRecord = {
  decisionType: string;
  status: 'RECORDED' | 'REVISED' | 'SUPERSEDED';
  payloadJson: unknown;
  recordedAt: Date;
};

export type OwnershipCostOperationalAnomaly = {
  type:
    | 'MISSING_CANONICAL_ADAPTER'
    | 'ADAPTER_FAILURE'
    | 'STALE_SNAPSHOT'
    | 'DEFINITION_MISMATCH'
    | 'CATEGORY_JUMP';
  severity: 'WARNING' | 'CRITICAL';
  propertyId: string | null;
  adapterKey: string | null;
  category: string | null;
  detectedAt: string;
  detail: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function latestByProperty<T extends { propertyId: string; computedAt: Date }>(
  records: readonly T[],
) {
  const latest = new Map<string, T>();
  for (const record of records) {
    const current = latest.get(record.propertyId);
    if (!current || record.computedAt > current.computedAt) {
      latest.set(record.propertyId, record);
    }
  }
  return latest;
}

export function evaluateOwnershipCostOperationalAnomalies(input: {
  adapterRuns: readonly AdapterRunRecord[];
  snapshots: readonly SnapshotRecord[];
  changes: readonly ChangeRecord[];
  now: Date;
}): OwnershipCostOperationalAnomaly[] {
  const anomalies: OwnershipCostOperationalAnomaly[] = [];
  const detectedAt = input.now.toISOString();
  const snapshots = latestByProperty(input.snapshots);
  const latestRuns = new Map<string, AdapterRunRecord>();
  for (const run of input.adapterRuns) {
    const key = `${run.propertyId}:${run.adapterKey}`;
    const current = latestRuns.get(key);
    if (!current || run.startedAt > current.startedAt) latestRuns.set(key, run);
  }

  for (const [propertyId, snapshot] of snapshots) {
    const ageHours =
      (input.now.getTime() - snapshot.computedAt.getTime()) / 3_600_000;
    if (ageHours > OWNERSHIP_COST_STALE_AFTER_HOURS) {
      anomalies.push({
        type: 'STALE_SNAPSHOT',
        severity: ageHours > OWNERSHIP_COST_STALE_AFTER_HOURS * 2
          ? 'CRITICAL'
          : 'WARNING',
        propertyId,
        adapterKey: null,
        category: null,
        detectedAt,
        detail: `Latest snapshot is ${Math.floor(ageHours)} hours old.`,
      });
    }
    if (
      snapshot.methodVersion !== OWNERSHIP_COST_METHOD_VERSION
      || snapshot.categoryDefinitionVersion
        !== OWNERSHIP_COST_CATEGORY_DEFINITION_VERSION
    ) {
      anomalies.push({
        type: 'DEFINITION_MISMATCH',
        severity: 'CRITICAL',
        propertyId,
        adapterKey: null,
        category: null,
        detectedAt,
        detail:
          `Snapshot uses ${snapshot.methodVersion}/${snapshot.categoryDefinitionVersion}; `
          + `runtime expects ${OWNERSHIP_COST_METHOD_VERSION}/${OWNERSHIP_COST_CATEGORY_DEFINITION_VERSION}.`,
      });
    }

    for (const adapterKey of EXPECTED_OWNERSHIP_COST_ADAPTERS) {
      const run = latestRuns.get(`${propertyId}:${adapterKey}`);
      if (!run) {
        anomalies.push({
          type: 'MISSING_CANONICAL_ADAPTER',
          severity: 'CRITICAL',
          propertyId,
          adapterKey,
          category: null,
          detectedAt,
          detail: `No canonical ${adapterKey} adapter run is retained for this property.`,
        });
      } else if (run.status === 'FAILED') {
        anomalies.push({
          type: 'ADAPTER_FAILURE',
          severity: 'CRITICAL',
          propertyId,
          adapterKey,
          category: null,
          detectedAt,
          detail: `Latest ${adapterKey} adapter run failed; the persisted snapshot remains last-known-good.`,
        });
      }
    }
  }

  for (const change of input.changes) {
    const evidence = objectValue(change.evidenceJson);
    const priorAnnualCents =
      typeof evidence.priorAnnualCents === 'number'
        ? evidence.priorAnnualCents
        : null;
    const percentage = priorAnnualCents && priorAnnualCents !== 0
      ? Math.abs(change.amountDeltaCents / priorAnnualCents)
      : null;
    if (
      Math.abs(change.amountDeltaCents) >= OWNERSHIP_COST_CATEGORY_JUMP_CENTS
      && (percentage == null
        || percentage >= OWNERSHIP_COST_CATEGORY_JUMP_PERCENTAGE)
    ) {
      anomalies.push({
        type: 'CATEGORY_JUMP',
        severity: percentage != null && percentage >= 1
          ? 'CRITICAL'
          : 'WARNING',
        propertyId: change.propertyId,
        adapterKey: null,
        category: change.category,
        detectedAt,
        detail:
          `${change.category} changed by ${change.amountDeltaCents} cents`
          + (percentage == null
            ? ' from a zero or unavailable prior amount.'
            : ` (${Math.round(percentage * 100)}%).`),
      });
    }
  }
  return anomalies.sort((left, right) =>
    Number(right.severity === 'CRITICAL')
      - Number(left.severity === 'CRITICAL')
    || left.type.localeCompare(right.type)
    || (left.propertyId ?? '').localeCompare(right.propertyId ?? ''));
}

function lifecycleState(record: DecisionRecord) {
  const value = objectValue(record.payloadJson).lifecycleState;
  return typeof value === 'string' ? value : null;
}

export function buildOwnershipCostOperationsDashboard(input: {
  adapterRuns: readonly AdapterRunRecord[];
  snapshots: readonly SnapshotRecord[];
  changes: readonly ChangeRecord[];
  decisions: readonly DecisionRecord[];
  windowStart: Date;
  now: Date;
}) {
  const anomalies = evaluateOwnershipCostOperationalAnomalies(input);
  const runCounts = Object.fromEntries(
    ['SUCCEEDED', 'PARTIAL', 'FAILED', 'RUNNING'].map((status) => [
      status,
      input.adapterRuns.filter((run) => run.status === status).length,
    ]),
  );
  const snapshotCoverage = Object.fromEntries(
    ['CREDIBLE', 'PARTIAL', 'ESTIMATE_ONLY', 'NOT_READY'].map((status) => [
      status,
      input.snapshots.filter((snapshot) =>
        snapshot.coverageStatus === status).length,
    ]),
  );
  const currentDecisions = input.decisions.filter(
    (decision) => decision.status !== 'SUPERSEDED',
  );
  const states = currentDecisions.map(lifecycleState);
  const planningHandoffs = currentDecisions.filter((decision) =>
    ['MONTHLY_CASH_BUFFER', 'CAPITAL_RESERVE'].includes(decision.decisionType))
    .length;

  for (const type of [
    'MISSING_CANONICAL_ADAPTER',
    'ADAPTER_FAILURE',
    'STALE_SNAPSHOT',
    'DEFINITION_MISMATCH',
    'CATEGORY_JUMP',
  ] as const) {
    for (const severity of ['WARNING', 'CRITICAL'] as const) {
      ownershipCostAnomalies.set(
        { type, severity },
        anomalies.filter((item) =>
          item.type === type && item.severity === severity).length,
      );
    }
  }

  return {
    contractVersion: OWNERSHIP_COST_OPERATIONS_CONTRACT_VERSION,
    generatedAt: input.now.toISOString(),
    window: {
      start: input.windowStart.toISOString(),
      end: input.now.toISOString(),
    },
    sourceCoverage: {
      expectedAdapters: EXPECTED_OWNERSHIP_COST_ADAPTERS,
      propertiesObserved: new Set(
        input.snapshots.map((snapshot) => snapshot.propertyId),
      ).size,
      adapterRuns: runCounts,
      sourceRecords: input.adapterRuns.reduce(
        (total, run) => total + run.sourceCount,
        0,
      ),
      observations: input.adapterRuns.reduce(
        (total, run) => total + run.observationCount,
        0,
      ),
    },
    staleness: {
      staleAfterHours: OWNERSHIP_COST_STALE_AFTER_HOURS,
      stalePropertyCount: new Set(
        anomalies
          .filter((item) => item.type === 'STALE_SNAPSHOT')
          .map((item) => item.propertyId),
      ).size,
    },
    calculations: {
      snapshotCount: input.snapshots.length,
      coverage: snapshotCoverage,
      persistedAdapterFailures: runCounts.FAILED,
      definitionMismatchCount: anomalies.filter((item) =>
        item.type === 'DEFINITION_MISMATCH').length,
    },
    actionFunnel: {
      decisionsRecorded: currentDecisions.filter((decision) =>
        decision.decisionType === 'CATEGORY_ACTION').length,
      engaged: states.filter((state) =>
        ['ACCEPTED', 'SAVED', 'SNOOZED'].includes(state ?? '')).length,
      resolvedOutcomes: states.filter((state) => state === 'RESOLVED').length,
      dismissedOrNoAction: states.filter((state) =>
        ['DISMISSED', 'NO_ACTION'].includes(state ?? '')).length,
      planningHandoffs,
      rule:
        'Engagement and saved intent are reported separately from homeowner-resolved outcomes.',
    },
    anomalies,
    limitations: [
      'Prometheus calculation failures supplement persisted adapter-run failures.',
      'Operational reports expose identifiers and versions, never source fact values or homeowner PII.',
      'An anomaly is a review trigger, not proof that a source value is incorrect.',
    ],
  };
}

export type OwnershipCostReplayArtifact = {
  propertyId: string;
  snapshotId: string;
  definitionVersion: string;
  methodVersion: string;
  categoryDefinitionVersion: string;
  inputFingerprint: string;
  basePeriodEnd: Date;
  coverageStatus: OwnershipCostSnapshotDraft['coverageStatus'];
  applicableCategories: string[];
  missingCategories: string[];
  totalsByLens: unknown;
  observations: CanonicalOwnershipCostObservation[];
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export function replayOwnershipCostArtifact(
  artifact: OwnershipCostReplayArtifact,
) {
  const replayed = buildOwnershipCostSnapshotDraft(
    artifact.observations,
    artifact.basePeriodEnd,
  );
  const differences: string[] = [];
  if (replayed.inputFingerprint !== artifact.inputFingerprint) {
    differences.push('INPUT_FINGERPRINT');
  }
  if (replayed.methodVersion !== artifact.methodVersion) {
    differences.push('METHOD_VERSION');
  }
  if (
    replayed.categoryDefinitionVersion !== artifact.categoryDefinitionVersion
  ) {
    differences.push('CATEGORY_DEFINITION_VERSION');
  }
  if (replayed.coverageStatus !== artifact.coverageStatus) {
    differences.push('COVERAGE_STATUS');
  }
  if (!same(replayed.applicableCategories, artifact.applicableCategories)) {
    differences.push('APPLICABLE_CATEGORIES');
  }
  if (!same(replayed.missingCategories, artifact.missingCategories)) {
    differences.push('MISSING_CATEGORIES');
  }
  if (!same(replayed.totalsByLens, artifact.totalsByLens)) {
    differences.push('TOTALS_BY_LENS');
  }
  return {
    contractVersion: OWNERSHIP_COST_REPLAY_CONTRACT_VERSION,
    propertyId: artifact.propertyId,
    snapshotId: artifact.snapshotId,
    definitionVersion: artifact.definitionVersion,
    requested: {
      inputFingerprint: artifact.inputFingerprint,
      methodVersion: artifact.methodVersion,
      categoryDefinitionVersion: artifact.categoryDefinitionVersion,
    },
    reproduced: differences.length === 0,
    differences,
    replayed: {
      inputFingerprint: replayed.inputFingerprint,
      methodVersion: replayed.methodVersion,
      categoryDefinitionVersion: replayed.categoryDefinitionVersion,
      coverageStatus: replayed.coverageStatus,
      totalsByLens: replayed.totalsByLens,
    },
    mutationPerformed: false,
  };
}

function stringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export class OwnershipCostOperationsService {
  async dashboard(windowDays = 30, now = new Date()) {
    const boundedDays = Math.max(1, Math.min(Math.trunc(windowDays), 90));
    const windowStart = new Date(
      now.getTime() - boundedDays * 24 * 60 * 60 * 1000,
    );
    const [adapterRuns, snapshots, changes, decisions] = await Promise.all([
      prisma.ownershipCostAdapterRun.findMany({
        where: { startedAt: { gte: windowStart } },
        orderBy: { startedAt: 'desc' },
        take: 5000,
      }),
      prisma.ownershipCostSnapshot.findMany({
        where: { computedAt: { gte: windowStart } },
        orderBy: { computedAt: 'desc' },
        take: 5000,
      }),
      prisma.ownershipCostChange.findMany({
        where: { createdAt: { gte: windowStart } },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
      prisma.ownershipCostDecision.findMany({
        where: { recordedAt: { gte: windowStart } },
        orderBy: { recordedAt: 'desc' },
        take: 5000,
      }),
    ]);
    return buildOwnershipCostOperationsDashboard({
      adapterRuns,
      snapshots,
      changes,
      decisions,
      windowStart,
      now,
    });
  }

  async replay(input: {
    propertyId: string;
    inputFingerprint: string;
    methodVersion: string;
  }) {
    const snapshot = await prisma.ownershipCostSnapshot.findUnique({
      where: {
        propertyId_inputFingerprint: {
          propertyId: input.propertyId,
          inputFingerprint: input.inputFingerprint,
        },
      },
      include: {
        definition: { select: { definitionVersion: true } },
        lines: {
          include: {
            sourceObservation: {
              include: {
                adapterRun: {
                  select: { adapterKey: true, adapterVersion: true },
                },
              },
            },
          },
        },
      },
    });
    if (!snapshot) {
      ownershipCostReplayTotal.inc({ outcome: 'NOT_FOUND' });
      throw new Error('Ownership-cost snapshot was not found.');
    }
    if (snapshot.methodVersion !== input.methodVersion) {
      ownershipCostReplayTotal.inc({ outcome: 'VERSION_MISMATCH' });
      throw new Error(
        `Requested method ${input.methodVersion} does not match retained method ${snapshot.methodVersion}.`,
      );
    }
    const observations = snapshot.lines.map((line) => {
      const source = line.sourceObservation;
      const adapterKey = source.adapterRun?.adapterKey;
      if (!EXPECTED_OWNERSHIP_COST_ADAPTERS.includes(
        adapterKey as OwnershipCostAdapterKey,
      )) {
        throw new Error(
          `Snapshot line ${line.id} has no retained canonical adapter.`,
        );
      }
      return {
        adapterKey: adapterKey as OwnershipCostAdapterKey,
        adapterVersion:
          source.adapterRun?.adapterVersion ?? 'retained-version-unavailable',
        category: source.category,
        subcategory: source.subcategory,
        amountCents: source.amountCents,
        annualizedAmountCents: line.annualizedAmountCents,
        currency: source.currency,
        recurrence: source.recurrence,
        periodStart: source.periodStart?.toISOString() ?? null,
        periodEnd: source.periodEnd?.toISOString() ?? null,
        temporalKind: source.temporalKind,
        evidenceStatus: source.evidenceStatus,
        verificationStatus: source.verificationStatus,
        freshnessStatus: source.freshnessStatus,
        applicability: source.applicability,
        sourceDomain: source.sourceDomain,
        sourceEntityType: source.sourceEntityType ?? 'retained-source',
        sourceEntityId: source.sourceEntityId ?? source.id,
        sourceDocumentId: source.sourceDocumentId,
        sourceFingerprint: source.sourceFingerprint,
        confidence: source.confidence as 'HIGH' | 'MEDIUM' | 'LOW' | null,
        assumptions: stringArray(source.assumptionsJson),
        missingDependencies: source.missingDependencies,
        dedupeKey: source.sourceFingerprint,
      } satisfies CanonicalOwnershipCostObservation;
    });
    const replay = replayOwnershipCostArtifact({
      propertyId: snapshot.propertyId,
      snapshotId: snapshot.id,
      definitionVersion: snapshot.definition.definitionVersion,
      methodVersion: snapshot.methodVersion,
      categoryDefinitionVersion: snapshot.categoryDefinitionVersion,
      inputFingerprint: snapshot.inputFingerprint,
      basePeriodEnd: snapshot.basePeriodEnd,
      coverageStatus: snapshot.coverageStatus,
      applicableCategories: snapshot.applicableCategories,
      missingCategories: snapshot.missingCategories,
      totalsByLens: snapshot.totalsByLensJson,
      observations,
    });
    ownershipCostReplayTotal.inc({
      outcome: replay.reproduced ? 'REPRODUCED' : 'DRIFTED',
    });
    return replay;
  }
}

export const ownershipCostOperationsService =
  new OwnershipCostOperationsService();
