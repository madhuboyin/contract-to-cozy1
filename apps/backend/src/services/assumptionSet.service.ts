import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { logSharedDataEvent } from './sharedDataObservability.service';

export type AssumptionSetDTO = {
  id: string;
  propertyId: string;
  toolKey: string;
  scenarioKey: string | null;
  preferenceProfileId: string | null;
  assumptionsJson: Prisma.JsonValue;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssumptionSetCreateInput = {
  propertyId: string;
  toolKey: string;
  scenarioKey?: string | null;
  preferenceProfileId?: string | null;
  assumptionsJson: Record<string, unknown>;
  createdByUserId?: string | null;
};

export type ResolveAssumptionInput = {
  propertyId: string;
  toolKey: string;
  assumptionSetId?: string | null;
  requestOverrides?: Record<string, unknown>;
  scenarioKey?: string | null;
  preferenceProfileId?: string | null;
  createdByUserId?: string | null;
};

export type ResolveAssumptionResult = {
  assumptionSetId: string | null;
  assumptions: Record<string, unknown>;
  resolvedFrom: 'existing' | 'created' | 'inline' | null;
};

function mapAssumptionSet(record: {
  id: string;
  propertyId: string;
  toolKey: string;
  scenarioKey: string | null;
  preferenceProfileId: string | null;
  assumptionsJson: Prisma.JsonValue;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AssumptionSetDTO {
  return {
    id: record.id,
    propertyId: record.propertyId,
    toolKey: record.toolKey,
    scenarioKey: record.scenarioKey,
    preferenceProfileId: record.preferenceProfileId,
    assumptionsJson: record.assumptionsJson,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function hasAssumptionOverrides(overrides: Record<string, unknown> | undefined): boolean {
  return Boolean(overrides && Object.keys(overrides).length > 0);
}

export function normalizeAssumptionIdentityPayload(
  value: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const cleanValue = (input: unknown): unknown => {
    if (input === undefined || input === null) return undefined;

    if (Array.isArray(input)) {
      const next = input
        .map((entry) => cleanValue(entry))
        .filter((entry) => entry !== undefined);
      return next.length > 0 ? next : undefined;
    }

    if (typeof input === 'object') {
      const objectInput = input as Record<string, unknown>;
      const keys = Object.keys(objectInput).sort();
      const next: Record<string, unknown> = {};
      for (const key of keys) {
        const cleaned = cleanValue(objectInput[key]);
        if (cleaned !== undefined) {
          next[key] = cleaned;
        }
      }
      return Object.keys(next).length > 0 ? next : undefined;
    }

    if (typeof input === 'number' && Number.isFinite(input)) {
      return Number(input.toFixed(6));
    }

    return input;
  };

  const normalized = cleanValue(value);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return {};
  return normalized as Record<string, unknown>;
}

export function hashAssumptionIdentityPayload(value: Record<string, unknown> | null | undefined): string {
  const normalized = normalizeAssumptionIdentityPayload(value);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function extractAssumptionOverrides(
  assumptionsJson: Prisma.JsonValue | null | undefined
): Record<string, unknown> {
  if (!assumptionsJson || typeof assumptionsJson !== 'object' || Array.isArray(assumptionsJson)) {
    return {};
  }

  const root = assumptionsJson as Record<string, unknown>;
  const nested = root.overrides;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }

  return root;
}

export class AssumptionSetService {
  async create(input: AssumptionSetCreateInput): Promise<AssumptionSetDTO> {
    if (input.preferenceProfileId) {
      const profile = await prisma.preferenceProfile.findFirst({
        where: {
          id: input.preferenceProfileId,
          propertyId: input.propertyId,
        },
        select: { id: true },
      });

      if (!profile) {
        throw new Error('Preference profile not found for this property.');
      }
    }

    const normalizedInput = normalizeAssumptionIdentityPayload(
      extractAssumptionOverrides(input.assumptionsJson as Prisma.JsonValue)
    );
    const inputHash = hashAssumptionIdentityPayload(normalizedInput);

    const existingCandidates = await prisma.assumptionSet.findMany({
      where: {
        propertyId: input.propertyId,
        toolKey: input.toolKey,
        scenarioKey: input.scenarioKey ?? null,
        preferenceProfileId: input.preferenceProfileId ?? null,
      },
      select: {
        id: true,
        propertyId: true,
        toolKey: true,
        scenarioKey: true,
        preferenceProfileId: true,
        assumptionsJson: true,
        createdByUserId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });

    for (const candidate of existingCandidates) {
      const candidateOverrides = normalizeAssumptionIdentityPayload(
        extractAssumptionOverrides(candidate.assumptionsJson)
      );
      if (hashAssumptionIdentityPayload(candidateOverrides) === inputHash) {
        logSharedDataEvent({
          event: 'assumption_set.create.reused_existing',
          level: 'INFO',
          propertyId: input.propertyId,
          toolKey: input.toolKey,
          assumptionSetId: candidate.id,
          metadata: {
            scenarioKey: input.scenarioKey ?? null,
            preferenceProfileId: input.preferenceProfileId ?? null,
            hash: inputHash,
          },
        });
        return mapAssumptionSet(candidate);
      }
    }

    const created = await prisma.assumptionSet.create({
      data: {
        propertyId: input.propertyId,
        toolKey: input.toolKey,
        scenarioKey: input.scenarioKey ?? null,
        preferenceProfileId: input.preferenceProfileId ?? null,
        assumptionsJson: input.assumptionsJson as Prisma.InputJsonValue,
        createdByUserId: input.createdByUserId ?? null,
      },
    });

    logSharedDataEvent({
      event: 'assumption_set.create.created',
      level: 'INFO',
      propertyId: input.propertyId,
      toolKey: input.toolKey,
      assumptionSetId: created.id,
      metadata: {
        scenarioKey: input.scenarioKey ?? null,
        preferenceProfileId: input.preferenceProfileId ?? null,
        hash: inputHash,
      },
    });

    return mapAssumptionSet(created);
  }

  async getById(propertyId: string, assumptionSetId: string): Promise<AssumptionSetDTO | null> {
    const record = await prisma.assumptionSet.findFirst({
      where: {
        id: assumptionSetId,
        propertyId,
      },
    });

    return record ? mapAssumptionSet(record) : null;
  }

  async listRecent(
    propertyId: string,
    options?: {
      toolKey?: string;
      limit?: number;
    }
  ): Promise<AssumptionSetDTO[]> {
    const rows = await prisma.assumptionSet.findMany({
      where: {
        propertyId,
        ...(options?.toolKey ? { toolKey: options.toolKey } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: options?.limit ?? 20,
    });

    return rows.map(mapAssumptionSet);
  }

  async isUsed(propertyId: string, assumptionSetId: string): Promise<boolean> {
    const [coverageCount, riskPremiumCount, doNothingCount] = await Promise.all([
      prisma.coverageAnalysis.count({
        where: {
          propertyId,
          assumptionSetId,
        },
      }),
      prisma.riskPremiumOptimizationAnalysis.count({
        where: {
          propertyId,
          assumptionSetId,
        },
      }),
      prisma.doNothingSimulationRun.count({
        where: {
          propertyId,
          assumptionSetId,
        },
      }),
    ]);

    return coverageCount + riskPremiumCount + doNothingCount > 0;
  }

  async resolveForRun(input: ResolveAssumptionInput): Promise<ResolveAssumptionResult> {
    const requestOverrides = input.requestOverrides ?? {};

    let existingAssumptions: Record<string, unknown> = {};
    let existingSet: AssumptionSetDTO | null = null;

    if (input.assumptionSetId) {
      existingSet = await this.getById(input.propertyId, input.assumptionSetId);
      if (!existingSet) {
        throw new Error('Assumption set not found for this property.');
      }
      existingAssumptions = extractAssumptionOverrides(existingSet.assumptionsJson);
    }

    const merged = {
      ...existingAssumptions,
      ...requestOverrides,
    };

    if (hasAssumptionOverrides(requestOverrides)) {
      const created = await this.create({
        propertyId: input.propertyId,
        toolKey: input.toolKey,
        scenarioKey: input.scenarioKey ?? null,
        preferenceProfileId: input.preferenceProfileId ?? existingSet?.preferenceProfileId ?? null,
        assumptionsJson: {
          version: 1,
          overrides: merged,
          parentAssumptionSetId: existingSet?.id ?? null,
        },
        createdByUserId: input.createdByUserId ?? null,
      });

      return {
        assumptionSetId: created.id,
        assumptions: merged,
        resolvedFrom: 'created',
      };
    }

    if (existingSet) {
      return {
        assumptionSetId: existingSet.id,
        assumptions: existingAssumptions,
        resolvedFrom: 'existing',
      };
    }

    return {
      assumptionSetId: null,
      assumptions: merged,
      resolvedFrom: hasAssumptionOverrides(merged) ? 'inline' : null,
    };
  }
}
