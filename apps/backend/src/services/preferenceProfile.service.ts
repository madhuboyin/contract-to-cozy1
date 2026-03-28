import {
  BundlingPreference,
  CashBufferPosture,
  DeductiblePreferenceStyle,
  PreferenceProfileSource,
  PreferenceRiskTolerance,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logSharedDataEvent } from './sharedDataObservability.service';

export type PreferenceProfileInput = {
  riskTolerance?: PreferenceRiskTolerance | null;
  deductiblePreferenceStyle?: DeductiblePreferenceStyle | null;
  cashBufferPosture?: CashBufferPosture | null;
  bundlingPreference?: BundlingPreference | null;
  confidence?: number | null;
  source?: PreferenceProfileSource;
  notesJson?: Record<string, unknown> | null;
};

export type PreferenceProfileDTO = {
  id: string;
  propertyId: string;
  homeownerProfileId: string | null;
  riskTolerance: PreferenceRiskTolerance | null;
  deductiblePreferenceStyle: DeductiblePreferenceStyle | null;
  cashBufferPosture: CashBufferPosture | null;
  bundlingPreference: BundlingPreference | null;
  confidence: number | null;
  source: PreferenceProfileSource;
  notesJson: Prisma.JsonValue | null;
  createdAt: string;
  updatedAt: string;
};

export type PreferencePostureDefaults = {
  exists: boolean;
  preferenceProfileId: string | null;
  riskTolerance: PreferenceRiskTolerance | null;
  deductiblePreferenceStyle: DeductiblePreferenceStyle | null;
  cashBufferPosture: CashBufferPosture | null;
  bundlingPreference: BundlingPreference | null;
};

function mapPreferenceProfile(record: {
  id: string;
  propertyId: string;
  homeownerProfileId: string | null;
  riskTolerance: PreferenceRiskTolerance | null;
  deductiblePreferenceStyle: DeductiblePreferenceStyle | null;
  cashBufferPosture: CashBufferPosture | null;
  bundlingPreference: BundlingPreference | null;
  confidence: number | null;
  source: PreferenceProfileSource;
  notesJson: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}): PreferenceProfileDTO {
  return {
    id: record.id,
    propertyId: record.propertyId,
    homeownerProfileId: record.homeownerProfileId,
    riskTolerance: record.riskTolerance,
    deductiblePreferenceStyle: record.deductiblePreferenceStyle,
    cashBufferPosture: record.cashBufferPosture,
    bundlingPreference: record.bundlingPreference,
    confidence: record.confidence,
    source: record.source,
    notesJson: record.notesJson,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function hasPreferenceInput(input: Partial<PreferenceProfileInput> | undefined): boolean {
  if (!input) return false;
  return [
    input.riskTolerance,
    input.deductiblePreferenceStyle,
    input.cashBufferPosture,
    input.bundlingPreference,
    input.confidence,
    input.source,
    input.notesJson,
  ].some((value) => value !== undefined);
}

export class PreferenceProfileService {
  async getCurrentProfile(propertyId: string): Promise<PreferenceProfileDTO | null> {
    const latest = await prisma.preferenceProfile.findFirst({
      where: { propertyId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return latest ? mapPreferenceProfile(latest) : null;
  }

  async resolvePostureDefaults(propertyId: string): Promise<PreferencePostureDefaults> {
    const latest = await prisma.preferenceProfile.findFirst({
      where: { propertyId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        riskTolerance: true,
        deductiblePreferenceStyle: true,
        cashBufferPosture: true,
        bundlingPreference: true,
      },
    });

    if (!latest) {
      return {
        exists: false,
        preferenceProfileId: null,
        riskTolerance: null,
        deductiblePreferenceStyle: null,
        cashBufferPosture: null,
        bundlingPreference: null,
      };
    }

    return {
      exists: true,
      preferenceProfileId: latest.id,
      riskTolerance: latest.riskTolerance,
      deductiblePreferenceStyle: latest.deductiblePreferenceStyle,
      cashBufferPosture: latest.cashBufferPosture,
      bundlingPreference: latest.bundlingPreference,
    };
  }

  async upsertProfile(
    propertyId: string,
    _userId: string,
    input: PreferenceProfileInput
  ): Promise<PreferenceProfileDTO> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        homeownerProfileId: true,
      },
    });

    if (!property) {
      throw new Error('Property not found for preference profile upsert.');
    }

    if (!property.homeownerProfileId) {
      logSharedDataEvent({
        event: 'preference_profile.upsert.property_missing_homeowner_profile',
        level: 'WARN',
        propertyId,
      });
    }

    return prisma.$transaction(async (tx) => {
      const latest = await tx.preferenceProfile.findFirst({
        where: { propertyId },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          source: true,
        },
      });

      const source = input.source ?? latest?.source ?? PreferenceProfileSource.USER_INPUT;

      const notesJsonInput =
        input.notesJson === undefined
          ? undefined
          : input.notesJson === null
            ? Prisma.JsonNull
            : (input.notesJson as Prisma.InputJsonValue);

      if (latest) {
        const updated = await tx.preferenceProfile.update({
          where: { id: latest.id },
          data: {
            homeownerProfileId: property.homeownerProfileId ?? null,
            ...(input.riskTolerance !== undefined ? { riskTolerance: input.riskTolerance } : {}),
            ...(input.deductiblePreferenceStyle !== undefined
              ? { deductiblePreferenceStyle: input.deductiblePreferenceStyle }
              : {}),
            ...(input.cashBufferPosture !== undefined ? { cashBufferPosture: input.cashBufferPosture } : {}),
            ...(input.bundlingPreference !== undefined ? { bundlingPreference: input.bundlingPreference } : {}),
            ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
            source,
            ...(notesJsonInput !== undefined ? { notesJson: notesJsonInput } : {}),
          },
        });

        logSharedDataEvent({
          event: 'preference_profile.upsert.updated',
          level: 'INFO',
          propertyId,
          metadata: {
            profileId: updated.id,
            source,
          },
        });
        return mapPreferenceProfile(updated);
      }

      const created = await tx.preferenceProfile.create({
        data: {
          propertyId,
          homeownerProfileId: property.homeownerProfileId ?? null,
          riskTolerance: input.riskTolerance ?? null,
          deductiblePreferenceStyle: input.deductiblePreferenceStyle ?? null,
          cashBufferPosture: input.cashBufferPosture ?? null,
          bundlingPreference: input.bundlingPreference ?? null,
          confidence: input.confidence ?? null,
          source,
          notesJson:
            notesJsonInput === undefined
              ? Prisma.JsonNull
              : notesJsonInput,
        },
      });

      logSharedDataEvent({
        event: 'preference_profile.upsert.created',
        level: 'INFO',
        propertyId,
        metadata: {
          profileId: created.id,
          source,
        },
      });
      return mapPreferenceProfile(created);
    });
  }
}
