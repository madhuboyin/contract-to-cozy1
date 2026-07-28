import type {
  OwnershipCostAdapterRunStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { resolvePropertyAccess } from '../propertyAccess.service';
import {
  OWNERSHIP_COST_CATEGORIES,
  OWNERSHIP_COST_DEFINITION_VERSION,
  OWNERSHIP_COST_INVARIANTS,
  OWNERSHIP_COST_LENSES,
} from './ownershipCost.contract';
import {
  OWNERSHIP_COST_ADAPTERS,
  OWNERSHIP_COST_ADAPTER_VERSION,
  OWNERSHIP_COST_CATEGORY_DEFINITION_VERSION,
  OWNERSHIP_COST_METHOD_VERSION,
  adaptOwnershipCostSources,
  ownershipCostFingerprint,
  type CanonicalOwnershipCostObservation,
  type OwnershipCostAdapterKey,
  type OwnershipCostSourceBundle,
} from './ownershipCostAdapters';
import {
  buildOwnershipCostSnapshotDraft,
  type OwnershipCostSnapshotDraft,
} from './ownershipCostSnapshot';
import { loadOwnershipCostSourceBundle } from './ownershipCostSourceRepository';

export class OwnershipCostAccessDeniedError extends Error {
  constructor() {
    super('Property not found or access denied.');
    this.name = 'OwnershipCostAccessDeniedError';
  }
}

export type OwnershipCostRefreshResult = {
  propertyId: string;
  definitionVersion: string;
  adapterVersion: string;
  inputFingerprint: string;
  snapshotId: string;
  coverageStatus: OwnershipCostSnapshotDraft['coverageStatus'];
  observationCount: number;
  missingCategories: OwnershipCostSnapshotDraft['missingCategories'];
  totalsByLens: OwnershipCostSnapshotDraft['totalsByLens'];
  reusedSnapshot: boolean;
};

type TransactionClient = Prisma.TransactionClient;

export type OwnershipCostObservationDependencies = {
  authorize: (userId: string, propertyId: string) => Promise<boolean>;
  loadSources: (
    propertyId: string,
    asOf: Date,
  ) => Promise<OwnershipCostSourceBundle>;
  persist: (input: {
    propertyId: string;
    asOf: Date;
    bundle: OwnershipCostSourceBundle;
    observations: CanonicalOwnershipCostObservation[];
    snapshot: OwnershipCostSnapshotDraft;
  }) => Promise<OwnershipCostRefreshResult>;
  now: () => Date;
};

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function observationCreateData(input: {
  propertyId: string;
  definitionId: string;
  adapterRunId: string;
  observation: CanonicalOwnershipCostObservation;
  correctionOfId?: string | null;
}): Prisma.OwnershipCostObservationUncheckedCreateInput {
  const { observation } = input;
  return {
    propertyId: input.propertyId,
    definitionId: input.definitionId,
    adapterRunId: input.adapterRunId,
    category: observation.category,
    subcategory: observation.subcategory,
    applicability: observation.applicability,
    amountCents: observation.amountCents,
    currency: observation.currency,
    recurrence: observation.recurrence,
    periodStart: observation.periodStart
      ? new Date(observation.periodStart)
      : null,
    periodEnd: observation.periodEnd ? new Date(observation.periodEnd) : null,
    temporalKind: observation.temporalKind,
    evidenceStatus: observation.evidenceStatus,
    verificationStatus: observation.verificationStatus,
    freshnessStatus: observation.freshnessStatus,
    sourceDomain: observation.sourceDomain,
    sourceEntityType: observation.sourceEntityType,
    sourceEntityId: observation.sourceEntityId,
    sourceDocumentId: observation.sourceDocumentId,
    sourceFingerprint: observation.sourceFingerprint,
    confidence: observation.confidence,
    assumptionsJson: json(observation.assumptions),
    missingDependencies: observation.missingDependencies,
    correctionOfId: input.correctionOfId ?? null,
    correctionReason: input.correctionOfId ? 'CANONICAL_SOURCE_RECORD_CHANGED' : null,
    observedAt: observation.periodEnd
      ? new Date(observation.periodEnd)
      : null,
  };
}

async function persistOwnershipCostRefresh(input: {
  propertyId: string;
  asOf: Date;
  bundle: OwnershipCostSourceBundle;
  observations: CanonicalOwnershipCostObservation[];
  snapshot: OwnershipCostSnapshotDraft;
}): Promise<OwnershipCostRefreshResult> {
  return prisma.$transaction(async (tx: TransactionClient) => {
    const definition = await tx.ownershipCostDefinition.upsert({
      where: { definitionVersion: OWNERSHIP_COST_DEFINITION_VERSION },
      create: {
        definitionVersion: OWNERSHIP_COST_DEFINITION_VERSION,
        methodVersion: OWNERSHIP_COST_METHOD_VERSION,
        categoryDefinitionVersion: OWNERSHIP_COST_CATEGORY_DEFINITION_VERSION,
        lensesJson: json(OWNERSHIP_COST_LENSES),
        categoriesJson: json(OWNERSHIP_COST_CATEGORIES),
        invariantsJson: json(OWNERSHIP_COST_INVARIANTS),
      },
      update: {},
      select: { id: true },
    });

    const adapterRunIds = new Map<OwnershipCostAdapterKey, string>();
    for (const adapter of OWNERSHIP_COST_ADAPTERS) {
      const adapterObservations = input.observations.filter(
        (observation) => observation.adapterKey === adapter.key,
      );
      const status: OwnershipCostAdapterRunStatus =
        adapterObservations.some((observation) =>
          observation.amountCents == null
          && observation.applicability !== 'NOT_APPLICABLE')
          ? 'PARTIAL'
          : 'SUCCEEDED';
      const run = await tx.ownershipCostAdapterRun.create({
        data: {
          propertyId: input.propertyId,
          adapterKey: adapter.key,
          adapterVersion: OWNERSHIP_COST_ADAPTER_VERSION,
          status,
          inputFingerprint: ownershipCostFingerprint(
            input.bundle[adapter.key],
          ),
          sourceCount: input.bundle[adapter.key].length,
          observationCount: adapterObservations.length,
          completedAt: input.asOf,
        },
        select: { id: true },
      });
      adapterRunIds.set(adapter.key, run.id);
    }

    const observationIdByFingerprint = new Map<string, string>();
    for (const observation of input.observations) {
      const adapterRunId = adapterRunIds.get(observation.adapterKey);
      if (!adapterRunId) {
        throw new Error(`Missing adapter run for ${observation.adapterKey}.`);
      }
      const priorVersion = await tx.ownershipCostObservation.findFirst({
        where: {
          propertyId: input.propertyId,
          category: observation.category,
          sourceDomain: observation.sourceDomain,
          sourceEntityType: observation.sourceEntityType,
          sourceEntityId: observation.sourceEntityId,
          sourceFingerprint: { not: observation.sourceFingerprint },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      const persisted = await tx.ownershipCostObservation.upsert({
        where: {
          propertyId_sourceFingerprint: {
            propertyId: input.propertyId,
            sourceFingerprint: observation.sourceFingerprint,
          },
        },
        create: observationCreateData({
          propertyId: input.propertyId,
          definitionId: definition.id,
          adapterRunId,
          observation,
          correctionOfId: priorVersion?.id,
        }),
        update: {},
        select: { id: true },
      });
      observationIdByFingerprint.set(
        observation.sourceFingerprint,
        persisted.id,
      );
    }

    const existing = await tx.ownershipCostSnapshot.findUnique({
      where: {
        propertyId_inputFingerprint: {
          propertyId: input.propertyId,
          inputFingerprint: input.snapshot.inputFingerprint,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return {
        propertyId: input.propertyId,
        definitionVersion: OWNERSHIP_COST_DEFINITION_VERSION,
        adapterVersion: OWNERSHIP_COST_ADAPTER_VERSION,
        inputFingerprint: input.snapshot.inputFingerprint,
        snapshotId: existing.id,
        coverageStatus: input.snapshot.coverageStatus,
        observationCount: input.observations.length,
        missingCategories: input.snapshot.missingCategories,
        totalsByLens: input.snapshot.totalsByLens,
        reusedSnapshot: true,
      };
    }

    const snapshot = await tx.ownershipCostSnapshot.create({
      data: {
        propertyId: input.propertyId,
        definitionId: definition.id,
        methodVersion: input.snapshot.methodVersion,
        categoryDefinitionVersion: input.snapshot.categoryDefinitionVersion,
        inputFingerprint: input.snapshot.inputFingerprint,
        basePeriodStart: new Date(input.snapshot.basePeriodStart),
        basePeriodEnd: new Date(input.snapshot.basePeriodEnd),
        coverageStatus: input.snapshot.coverageStatus,
        applicableCategories: input.snapshot.applicableCategories,
        missingCategories: input.snapshot.missingCategories,
        totalsByLensJson: json(input.snapshot.totalsByLens),
        lines: {
          create: input.snapshot.lines.map((line) => {
            const sourceObservationId = observationIdByFingerprint.get(
              line.sourceFingerprint,
            );
            if (!sourceObservationId) {
              throw new Error(
                `Snapshot line source ${line.sourceFingerprint} was not persisted.`,
              );
            }
            return {
              sourceObservationId,
              category: line.category,
              subcategory: line.subcategory,
              amountCents: line.amountCents,
              annualizedAmountCents: line.annualizedAmountCents,
              applicability: line.applicability,
              evidenceStatus: line.evidenceStatus,
              verificationStatus: line.verificationStatus,
              freshnessStatus: line.freshnessStatus,
              includedLenses: line.includedLenses,
            };
          }),
        },
      },
      select: { id: true },
    });

    return {
      propertyId: input.propertyId,
      definitionVersion: OWNERSHIP_COST_DEFINITION_VERSION,
      adapterVersion: OWNERSHIP_COST_ADAPTER_VERSION,
      inputFingerprint: input.snapshot.inputFingerprint,
      snapshotId: snapshot.id,
      coverageStatus: input.snapshot.coverageStatus,
      observationCount: input.observations.length,
      missingCategories: input.snapshot.missingCategories,
      totalsByLens: input.snapshot.totalsByLens,
      reusedSnapshot: false,
    };
  });
}

const defaultDependencies: OwnershipCostObservationDependencies = {
  authorize: async (userId, propertyId) =>
    Boolean(await resolvePropertyAccess(userId, propertyId)),
  loadSources: (propertyId, asOf) =>
    loadOwnershipCostSourceBundle(propertyId, asOf),
  persist: persistOwnershipCostRefresh,
  now: () => new Date(),
};

export class OwnershipCostObservationService {
  constructor(
    private readonly dependencies: OwnershipCostObservationDependencies =
      defaultDependencies,
  ) {}

  async refresh(
    propertyId: string,
    userId: string,
    asOf = this.dependencies.now(),
  ): Promise<OwnershipCostRefreshResult> {
    if (!await this.dependencies.authorize(userId, propertyId)) {
      throw new OwnershipCostAccessDeniedError();
    }
    const bundle = await this.dependencies.loadSources(propertyId, asOf);
    const observations = adaptOwnershipCostSources(bundle, asOf);
    const snapshot = buildOwnershipCostSnapshotDraft(observations, asOf);
    return this.dependencies.persist({
      propertyId,
      asOf,
      bundle,
      observations,
      snapshot,
    });
  }
}

export const ownershipCostObservationService =
  new OwnershipCostObservationService();
