import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

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
