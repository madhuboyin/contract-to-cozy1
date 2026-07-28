import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { resolvePropertyAccess } from '../propertyAccess.service';
import {
  type OwnershipCostCategory,
  type OwnershipCostEvidenceStatus,
  type OwnershipCostFreshnessStatus,
  type OwnershipCostLens,
  type OwnershipCostRecurrence,
  type OwnershipCostSourceDomain,
  type OwnershipCostVerificationStatus,
} from './ownershipCost.contract';
import {
  type OwnershipCostCurrentLens,
} from './ownershipCostReadModel.service';
import { OwnershipCostAccessDeniedError } from './ownershipCostObservation.service';
import { OWNERSHIP_COST_LENS_CATEGORIES } from './ownershipCostSnapshot';

export const OWNERSHIP_COST_CHANGE_REASON_TYPES = [
  'PRICE',
  'USAGE',
  'SCOPE',
  'ASSESSMENT',
  'RATE',
  'COVERAGE',
  'FINANCING',
  'ONE_TIME_EVENT',
  'UNEXPLAINED',
] as const;

export type OwnershipCostChangeReason =
  typeof OWNERSHIP_COST_CHANGE_REASON_TYPES[number];

type ChangeLine = {
  category: OwnershipCostCategory;
  subcategory: string | null;
  annualizedAmountCents: number | null;
  applicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  evidenceStatus: OwnershipCostEvidenceStatus | null;
  verificationStatus: OwnershipCostVerificationStatus;
  freshnessStatus: OwnershipCostFreshnessStatus;
  includedLenses: OwnershipCostLens[];
  sourceObservation: {
    id: string;
    recurrence: OwnershipCostRecurrence;
    sourceDomain: OwnershipCostSourceDomain;
    sourceEntityType: string | null;
    sourceEntityId: string | null;
    sourceDocumentId: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    assumptionsJson: unknown;
  };
};

export type OwnershipCostComparableSnapshot = {
  id: string;
  methodVersion: string;
  categoryDefinitionVersion: string;
  basePeriodStart: Date;
  basePeriodEnd: Date;
  computedAt: Date;
  lines: ChangeLine[];
};

export type OwnershipCostObservedChange = {
  id: string | null;
  category: OwnershipCostCategory;
  label: string;
  fromSnapshotId: string;
  toSnapshotId: string;
  priorPeriod: { start: string; end: string };
  currentPeriod: { start: string; end: string };
  priorAnnualCents: number;
  currentAnnualCents: number;
  deltaCents: number;
  deltaPercent: number | null;
  impact: 'RECURRING' | 'ONE_TIME';
  recurringDeltaCents: number | null;
  reason: OwnershipCostChangeReason;
  explanationStatus: 'SUPPORTED' | 'UNEXPLAINED';
  explanation: string;
  evidence: Array<{
    observationId: string;
    sourceDomain: OwnershipCostSourceDomain;
    sourceEntityType: string | null;
    sourceEntityId: string | null;
    sourceDocumentId: string | null;
    periodStart: string;
    periodEnd: string;
    evidenceStatus: OwnershipCostEvidenceStatus;
    verificationStatus: OwnershipCostVerificationStatus;
  }>;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  materiality: {
    material: boolean;
    absoluteThresholdCents: number;
    percentageThreshold: number;
  };
  rankScore: number;
  action: {
    href: string;
    label: string;
    actionable: boolean;
  };
};

export type OwnershipCostChangeReadModel = {
  propertyId: string;
  selectedLens: OwnershipCostCurrentLens;
  comparable: boolean;
  reason: string | null;
  comparison: {
    fromSnapshotId: string;
    toSnapshotId: string;
    priorPeriodStart: string;
    priorPeriodEnd: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  } | null;
  totalRecurringDeltaCents: number;
  totalOneTimeDeltaCents: number;
  changes: OwnershipCostObservedChange[];
  limitations: string[];
};

export type OwnershipCostChangeDependencies = {
  authorize: (userId: string, propertyId: string) => Promise<boolean>;
  loadSnapshots: (
    propertyId: string,
  ) => Promise<OwnershipCostComparableSnapshot[]>;
  persist: (
    propertyId: string,
    changes: OwnershipCostObservedChange[],
  ) => Promise<OwnershipCostObservedChange[]>;
};

const CATEGORY_LABELS: Record<OwnershipCostCategory, string> = {
  PROPERTY_TAX: 'Property tax',
  INSURANCE: 'Home insurance',
  HOA: 'HOA dues',
  UTILITIES: 'Utilities',
  MORTGAGE_PRINCIPAL: 'Mortgage principal',
  MORTGAGE_INTEREST: 'Mortgage interest',
  PMI: 'Private mortgage insurance',
  RECURRING_HOME_SERVICE: 'Recurring home services',
  ROUTINE_MAINTENANCE: 'Routine maintenance',
  KNOWN_REPAIR: 'Known repairs',
  CAPITAL_PROJECT: 'Capital projects',
  RESERVE_CONTRIBUTION: 'Reserve contribution',
};

const MATERIALITY_ABSOLUTE_CENTS = 12_000;
const MATERIALITY_PERCENTAGE = 0.05;
const OBSERVED_EVIDENCE = new Set<OwnershipCostEvidenceStatus>([
  'OBSERVED',
  'CONFIRMED',
  'HOMEOWNER_REPORTED',
  'EXTRACTED',
]);
const ONE_TIME_CATEGORIES = new Set<OwnershipCostCategory>([
  'KNOWN_REPAIR',
  'CAPITAL_PROJECT',
]);

function actionFor(propertyId: string, category: OwnershipCostCategory) {
  const base = `/dashboard/properties/${propertyId}`;
  const actions: Record<OwnershipCostCategory, { href: string; label: string }> = {
    PROPERTY_TAX: {
      href: `${base}/tools/property-tax`,
      label: 'Review tax evidence',
    },
    INSURANCE: {
      href: `${base}/tools/coverage-intelligence`,
      label: 'Review policy evidence',
    },
    HOA: { href: `${base}/tools/hoa`, label: 'Review HOA dues' },
    UTILITIES: {
      href: `/dashboard/expenses?propertyId=${encodeURIComponent(propertyId)}&category=UTILITIES`,
      label: 'Review utility expenses',
    },
    MORTGAGE_PRINCIPAL: {
      href: `${base}/tools/financing`,
      label: 'Review financing',
    },
    MORTGAGE_INTEREST: {
      href: `${base}/tools/financing`,
      label: 'Review financing',
    },
    PMI: { href: `${base}/tools/financing`, label: 'Review financing' },
    RECURRING_HOME_SERVICE: {
      href: `${base}/maintenance`,
      label: 'Review recurring services',
    },
    ROUTINE_MAINTENANCE: {
      href: `${base}/maintenance`,
      label: 'Review maintenance records',
    },
    KNOWN_REPAIR: {
      href: `${base}/projects`,
      label: 'Review repair records',
    },
    CAPITAL_PROJECT: {
      href: `${base}/projects`,
      label: 'Review project records',
    },
    RESERVE_CONTRIBUTION: {
      href: `${base}/tools/reserve-fund`,
      label: 'Review reserve plan',
    },
  };
  return actions[category];
}

function stringAssumptions(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function explicitReason(lines: ChangeLine[]): OwnershipCostChangeReason {
  if (lines.some((line) => ONE_TIME_CATEGORIES.has(line.category))) {
    return 'ONE_TIME_EVENT';
  }
  for (const line of lines) {
    for (const assumption of stringAssumptions(
      line.sourceObservation.assumptionsJson,
    )) {
      const match = /^CHANGE_REASON:(PRICE|USAGE|SCOPE|ASSESSMENT|RATE|COVERAGE|FINANCING)$/
        .exec(assumption);
      if (match) return match[1] as OwnershipCostChangeReason;
    }
  }
  return 'UNEXPLAINED';
}

function confidence(lines: ChangeLine[]): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (lines.some((line) => line.verificationStatus === 'UNVERIFIED')) {
    return 'LOW';
  }
  if (
    lines.every((line) => line.verificationStatus === 'VERIFIED')
    && lines.every((line) =>
      ['OBSERVED', 'CONFIRMED'].includes(line.evidenceStatus ?? ''))
  ) {
    return 'HIGH';
  }
  return 'MEDIUM';
}

function period(lines: ChangeLine[]): { start: Date; end: Date } | null {
  const starts = lines
    .map((line) => line.sourceObservation.periodStart)
    .filter((value): value is Date => Boolean(value));
  const ends = lines
    .map((line) => line.sourceObservation.periodEnd)
    .filter((value): value is Date => Boolean(value));
  if (starts.length !== lines.length || ends.length !== lines.length) return null;
  return {
    start: new Date(Math.min(...starts.map((value) => value.getTime()))),
    end: new Date(Math.max(...ends.map((value) => value.getTime()))),
  };
}

function comparablePeriods(
  prior: { start: Date; end: Date },
  current: { start: Date; end: Date },
) {
  const day = 86_400_000;
  const priorDays = (prior.end.getTime() - prior.start.getTime()) / day;
  const currentDays = (current.end.getTime() - current.start.getTime()) / day;
  return prior.end < current.start
    && Math.abs(priorDays - currentDays) <= 45;
}

function comparableLines(
  snapshot: OwnershipCostComparableSnapshot,
  category: OwnershipCostCategory,
  lens: OwnershipCostCurrentLens,
) {
  return snapshot.lines.filter((line) =>
    line.category === category
    && line.applicability === 'APPLICABLE'
    && line.annualizedAmountCents != null
    && line.includedLenses.includes(lens)
    && line.evidenceStatus != null
    && OBSERVED_EVIDENCE.has(line.evidenceStatus)
    && line.verificationStatus !== 'UNVERIFIED');
}

function evidence(lines: ChangeLine[]): OwnershipCostObservedChange['evidence'] {
  return lines.map((line) => ({
    observationId: line.sourceObservation.id,
    sourceDomain: line.sourceObservation.sourceDomain,
    sourceEntityType: line.sourceObservation.sourceEntityType,
    sourceEntityId: line.sourceObservation.sourceEntityId,
    sourceDocumentId: line.sourceObservation.sourceDocumentId,
    periodStart: line.sourceObservation.periodStart!.toISOString(),
    periodEnd: line.sourceObservation.periodEnd!.toISOString(),
    evidenceStatus: line.evidenceStatus!,
    verificationStatus: line.verificationStatus,
  }));
}

function explanation(
  label: string,
  reason: OwnershipCostChangeReason,
  deltaCents: number,
) {
  const direction = deltaCents >= 0 ? 'increased' : 'decreased';
  if (reason === 'UNEXPLAINED') {
    return `${label} ${direction}, but the available records do not establish why.`;
  }
  const labels: Record<Exclude<OwnershipCostChangeReason, 'UNEXPLAINED'>, string> = {
    PRICE: 'a supported price change',
    USAGE: 'a supported usage change',
    SCOPE: 'a supported scope change',
    ASSESSMENT: 'a supported assessment change',
    RATE: 'a supported rate change',
    COVERAGE: 'a supported coverage change',
    FINANCING: 'a supported financing change',
    ONE_TIME_EVENT: 'a one-time recorded event',
  };
  return `${label} ${direction} because of ${labels[reason]}.`;
}

export function compareOwnershipCostSnapshots(
  propertyId: string,
  prior: OwnershipCostComparableSnapshot,
  current: OwnershipCostComparableSnapshot,
  selectedLens: OwnershipCostCurrentLens,
): OwnershipCostObservedChange[] {
  if (
    prior.methodVersion !== current.methodVersion
    || prior.categoryDefinitionVersion !== current.categoryDefinitionVersion
  ) {
    return [];
  }

  const changes: OwnershipCostObservedChange[] = [];
  for (const category of OWNERSHIP_COST_LENS_CATEGORIES[selectedLens]) {
    const priorLines = comparableLines(prior, category, selectedLens);
    const currentLines = comparableLines(current, category, selectedLens);
    if (priorLines.length === 0 || currentLines.length === 0) continue;

    const priorSubcategories = [...new Set(
      priorLines.map((line) => line.subcategory ?? ''),
    )].sort();
    const currentSubcategories = [...new Set(
      currentLines.map((line) => line.subcategory ?? ''),
    )].sort();
    if (JSON.stringify(priorSubcategories) !== JSON.stringify(currentSubcategories)) {
      continue;
    }

    const priorPeriod = period(priorLines);
    const currentPeriod = period(currentLines);
    if (
      !priorPeriod
      || !currentPeriod
      || !comparablePeriods(priorPeriod, currentPeriod)
    ) {
      continue;
    }

    const priorAnnualCents = priorLines.reduce(
      (total, line) => total + line.annualizedAmountCents!,
      0,
    );
    const currentAnnualCents = currentLines.reduce(
      (total, line) => total + line.annualizedAmountCents!,
      0,
    );
    const deltaCents = currentAnnualCents - priorAnnualCents;
    if (deltaCents === 0) continue;
    const deltaPercent = priorAnnualCents === 0
      ? null
      : deltaCents / priorAnnualCents;
    const reason = explicitReason([...priorLines, ...currentLines]);
    const material = Math.abs(deltaCents) >= MATERIALITY_ABSOLUTE_CENTS
      || (
        deltaPercent != null
        && Math.abs(deltaPercent) >= MATERIALITY_PERCENTAGE
      );
    const impact = ONE_TIME_CATEGORIES.has(category)
      ? 'ONE_TIME' as const
      : 'RECURRING' as const;
    const changeConfidence = confidence([...priorLines, ...currentLines]);
    const action = actionFor(propertyId, category);
    const rankScore =
      Math.min(60, Math.round(Math.abs(deltaCents) / 10_000))
      + (changeConfidence === 'HIGH' ? 20 : changeConfidence === 'MEDIUM' ? 12 : 4)
      + (material ? 15 : 0)
      + (action ? 5 : 0);

    changes.push({
      id: null,
      category,
      label: CATEGORY_LABELS[category],
      fromSnapshotId: prior.id,
      toSnapshotId: current.id,
      priorPeriod: {
        start: priorPeriod.start.toISOString(),
        end: priorPeriod.end.toISOString(),
      },
      currentPeriod: {
        start: currentPeriod.start.toISOString(),
        end: currentPeriod.end.toISOString(),
      },
      priorAnnualCents,
      currentAnnualCents,
      deltaCents,
      deltaPercent,
      impact,
      recurringDeltaCents: impact === 'RECURRING' ? deltaCents : null,
      reason,
      explanationStatus:
        reason === 'UNEXPLAINED' ? 'UNEXPLAINED' : 'SUPPORTED',
      explanation: explanation(CATEGORY_LABELS[category], reason, deltaCents),
      evidence: evidence([...priorLines, ...currentLines]),
      confidence: changeConfidence,
      materiality: {
        material,
        absoluteThresholdCents: MATERIALITY_ABSOLUTE_CENTS,
        percentageThreshold: MATERIALITY_PERCENTAGE,
      },
      rankScore,
      action: { ...action, actionable: material },
    });
  }
  return changes.sort((left, right) =>
    right.rankScore - left.rankScore
    || Math.abs(right.deltaCents) - Math.abs(left.deltaCents)
    || left.category.localeCompare(right.category));
}

function latestComparablePair(
  snapshots: OwnershipCostComparableSnapshot[],
): [OwnershipCostComparableSnapshot, OwnershipCostComparableSnapshot] | null {
  for (let currentIndex = 0; currentIndex < snapshots.length; currentIndex += 1) {
    const current = snapshots[currentIndex];
    for (let priorIndex = currentIndex + 1; priorIndex < snapshots.length; priorIndex += 1) {
      const prior = snapshots[priorIndex];
      if (
        prior.methodVersion === current.methodVersion
        && prior.categoryDefinitionVersion === current.categoryDefinitionVersion
        && prior.basePeriodEnd < current.basePeriodStart
      ) {
        return [prior, current];
      }
    }
  }
  return null;
}

export function buildOwnershipCostChangeReadModel(
  propertyId: string,
  snapshots: OwnershipCostComparableSnapshot[],
  selectedLens: OwnershipCostCurrentLens,
): OwnershipCostChangeReadModel {
  const pair = latestComparablePair(snapshots);
  if (!pair) {
    return {
      propertyId,
      selectedLens,
      comparable: false,
      reason: 'At least two non-overlapping snapshots with the same calculation and category definitions are required.',
      comparison: null,
      totalRecurringDeltaCents: 0,
      totalOneTimeDeltaCents: 0,
      changes: [],
      limitations: [
        'No modeled backcast is used as observed history.',
        'Missing, estimated, unverified, overlapping, or definition-incompatible periods are excluded.',
      ],
    };
  }
  const [prior, current] = pair;
  const changes = compareOwnershipCostSnapshots(
    propertyId,
    prior,
    current,
    selectedLens,
  );
  return {
    propertyId,
    selectedLens,
    comparable: changes.length > 0,
    reason: changes.length > 0
      ? null
      : 'The snapshots do not contain category periods with comparable observed evidence.',
    comparison: {
      fromSnapshotId: prior.id,
      toSnapshotId: current.id,
      priorPeriodStart: prior.basePeriodStart.toISOString(),
      priorPeriodEnd: prior.basePeriodEnd.toISOString(),
      currentPeriodStart: current.basePeriodStart.toISOString(),
      currentPeriodEnd: current.basePeriodEnd.toISOString(),
    },
    totalRecurringDeltaCents: changes.reduce(
      (total, change) => total + (change.recurringDeltaCents ?? 0),
      0,
    ),
    totalOneTimeDeltaCents: changes.reduce(
      (total, change) =>
        total + (change.impact === 'ONE_TIME' ? change.deltaCents : 0),
      0,
    ),
    changes,
    limitations: [
      'Only non-overlapping periods with the same method and category definitions are compared.',
      'Estimated, benchmark, forecast, unverified, and missing amounts are excluded.',
      'A reason remains unexplained unless its source evidence explicitly supports the attribution.',
    ],
  };
}

async function loadComparableSnapshots(
  propertyId: string,
): Promise<OwnershipCostComparableSnapshot[]> {
  return prisma.ownershipCostSnapshot.findMany({
    where: { propertyId },
    orderBy: [{ basePeriodEnd: 'desc' }, { computedAt: 'desc' }, { id: 'desc' }],
    take: 12,
    select: {
      id: true,
      methodVersion: true,
      categoryDefinitionVersion: true,
      basePeriodStart: true,
      basePeriodEnd: true,
      computedAt: true,
      lines: {
        orderBy: [{ category: 'asc' }, { id: 'asc' }],
        select: {
          category: true,
          subcategory: true,
          annualizedAmountCents: true,
          applicability: true,
          evidenceStatus: true,
          verificationStatus: true,
          freshnessStatus: true,
          includedLenses: true,
          sourceObservation: {
            select: {
              id: true,
              recurrence: true,
              sourceDomain: true,
              sourceEntityType: true,
              sourceEntityId: true,
              sourceDocumentId: true,
              periodStart: true,
              periodEnd: true,
              assumptionsJson: true,
            },
          },
        },
      },
    },
  });
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function persistChanges(
  propertyId: string,
  changes: OwnershipCostObservedChange[],
): Promise<OwnershipCostObservedChange[]> {
  return Promise.all(changes.map(async (change) => {
    const persisted = await prisma.ownershipCostChange.upsert({
      where: {
        fromSnapshotId_toSnapshotId_category: {
          fromSnapshotId: change.fromSnapshotId,
          toSnapshotId: change.toSnapshotId,
          category: change.category,
        },
      },
      create: {
        propertyId,
        fromSnapshotId: change.fromSnapshotId,
        toSnapshotId: change.toSnapshotId,
        category: change.category,
        amountDeltaCents: change.deltaCents,
        recurringDeltaCents: change.recurringDeltaCents,
        changeReason: change.reason,
        explanationStatus: change.explanationStatus,
        evidenceJson: json({
          priorPeriod: change.priorPeriod,
          currentPeriod: change.currentPeriod,
          priorAnnualCents: change.priorAnnualCents,
          currentAnnualCents: change.currentAnnualCents,
          deltaPercent: change.deltaPercent,
          impact: change.impact,
          explanation: change.explanation,
          evidence: change.evidence,
          confidence: change.confidence,
          materiality: change.materiality,
          rankScore: change.rankScore,
          action: change.action,
        }),
      },
      update: {
        amountDeltaCents: change.deltaCents,
        recurringDeltaCents: change.recurringDeltaCents,
        changeReason: change.reason,
        explanationStatus: change.explanationStatus,
        evidenceJson: json({
          priorPeriod: change.priorPeriod,
          currentPeriod: change.currentPeriod,
          priorAnnualCents: change.priorAnnualCents,
          currentAnnualCents: change.currentAnnualCents,
          deltaPercent: change.deltaPercent,
          impact: change.impact,
          explanation: change.explanation,
          evidence: change.evidence,
          confidence: change.confidence,
          materiality: change.materiality,
          rankScore: change.rankScore,
          action: change.action,
        }),
      },
      select: { id: true },
    });
    return { ...change, id: persisted.id };
  }));
}

const defaultDependencies: OwnershipCostChangeDependencies = {
  authorize: async (userId, propertyId) =>
    Boolean(await resolvePropertyAccess(userId, propertyId)),
  loadSnapshots: loadComparableSnapshots,
  persist: persistChanges,
};

export class OwnershipCostChangeService {
  constructor(
    private readonly dependencies: OwnershipCostChangeDependencies =
      defaultDependencies,
  ) {}

  async getObservedChanges(
    propertyId: string,
    userId: string,
    selectedLens: OwnershipCostCurrentLens,
  ) {
    if (!await this.dependencies.authorize(userId, propertyId)) {
      throw new OwnershipCostAccessDeniedError();
    }
    return buildOwnershipCostChangeReadModel(
      propertyId,
      await this.dependencies.loadSnapshots(propertyId),
      selectedLens,
    );
  }

  async refreshObservedChanges(
    propertyId: string,
    userId: string,
    selectedLens: OwnershipCostCurrentLens,
  ) {
    const readModel = await this.getObservedChanges(
      propertyId,
      userId,
      selectedLens,
    );
    if (readModel.changes.length === 0) return readModel;
    return {
      ...readModel,
      changes: await this.dependencies.persist(
        propertyId,
        readModel.changes,
      ),
    };
  }
}

export const ownershipCostChangeService = new OwnershipCostChangeService();
