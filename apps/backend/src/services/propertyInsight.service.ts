import { createHash } from 'crypto';
import { PropertyInsightSnapshot, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

export type InsightAgeBand = 'EARLY' | 'MID' | 'HIGH_MAINT' | 'LEGACY' | 'UNKNOWN';
export type InsightSizeBand = 'COMPACT' | 'STANDARD' | 'LARGE' | 'UNKNOWN';

export type InsightTopAngle =
  | 'MAINTENANCE_CLUSTERING'
  | 'ACCELERATED_CAPITAL_PHASE'
  | 'SCALE_AMPLIFIES_COST'
  | 'IMPROVE_ACCURACY'
  | 'GENERAL_PLANNING';

export interface InsightSnapshotData {
  schemaVersion: 'v1';
  propertyId: string;
  inputs: {
    yearBuilt: number | null;
    propertySize: number | null;
    propertyType: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  };
  derived: {
    propertyAgeYears: number | null;
    ageBand: InsightAgeBand;
    sizeBand: InsightSizeBand;
    regionKey: string;
    confidenceScore: number;
    missingFieldKeys: string[];
    topAngles: InsightTopAngle[];
  };
  computedAt: string;
  inputFingerprint: string;
}

type PropertyInsightInput = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  yearBuilt: number | null;
  propertySize: number | null;
  propertyType: string | null;
  updatedAt: Date;
};

const SNAPSHOT_SCHEMA_VERSION = 'v1';
export const INSIGHT_SNAPSHOT_TTL_DAYS = 7;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function normalizeText(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase();
}

function buildInputFingerprint(property: PropertyInsightInput): string {
  const raw = [
    property.id,
    property.yearBuilt ?? 'NA',
    property.propertySize ?? 'NA',
    normalizeText(property.propertyType),
    normalizeText(property.address),
    normalizeText(property.city),
    normalizeText(property.state),
    normalizeText(property.zipCode),
  ].join('|');

  return createHash('sha1').update(raw).digest('hex');
}

function deriveAgeBand(yearBuilt: number | null): { propertyAgeYears: number | null; ageBand: InsightAgeBand } {
  if (!yearBuilt) {
    return { propertyAgeYears: null, ageBand: 'UNKNOWN' };
  }

  const nowYear = new Date().getFullYear();
  const propertyAgeYears = Math.max(nowYear - yearBuilt, 0);

  if (propertyAgeYears <= 10) return { propertyAgeYears, ageBand: 'EARLY' };
  if (propertyAgeYears <= 20) return { propertyAgeYears, ageBand: 'MID' };
  if (propertyAgeYears <= 35) return { propertyAgeYears, ageBand: 'HIGH_MAINT' };
  return { propertyAgeYears, ageBand: 'LEGACY' };
}

function deriveSizeBand(propertySize: number | null): InsightSizeBand {
  if (!propertySize || propertySize <= 0) return 'UNKNOWN';
  if (propertySize < 1500) return 'COMPACT';
  if (propertySize <= 3000) return 'STANDARD';
  return 'LARGE';
}

function deriveRegionKey(property: Pick<PropertyInsightInput, 'zipCode' | 'state' | 'city'>): string {
  const zip = String(property.zipCode || '').trim();
  if (zip.length >= 5) return zip.slice(0, 5);

  const state = String(property.state || '').trim().toUpperCase();
  const city = String(property.city || '').trim().toUpperCase().replace(/\s+/g, '_');

  if (state && city) return `${state}_${city}`;
  if (state) return state;
  if (city) return city;
  return 'UNKNOWN_REGION';
}

function computeConfidenceScore(property: PropertyInsightInput): { confidenceScore: number; missingFieldKeys: string[] } {
  const missingFieldKeys: string[] = [];
  let score = 30;

  if (property.yearBuilt) score += 25;
  else missingFieldKeys.push('yearBuilt');

  if (property.propertySize) score += 15;
  else missingFieldKeys.push('propertySize');

  if (property.propertyType) score += 15;
  else missingFieldKeys.push('propertyType');

  const hasPreciseAddress = Boolean(property.address && property.zipCode && String(property.zipCode).trim().length >= 5);
  if (hasPreciseAddress) score += 15;
  else missingFieldKeys.push('address');

  return {
    confidenceScore: clamp(score, 0, 100),
    missingFieldKeys,
  };
}

function deriveTopAngles(ageBand: InsightAgeBand, sizeBand: InsightSizeBand, missingFieldKeys: string[]): InsightTopAngle[] {
  const angles: InsightTopAngle[] = [];

  if (ageBand === 'HIGH_MAINT') angles.push('MAINTENANCE_CLUSTERING');
  if (ageBand === 'LEGACY') angles.push('ACCELERATED_CAPITAL_PHASE');
  if (sizeBand === 'LARGE') angles.push('SCALE_AMPLIFIES_COST');
  if (missingFieldKeys.length > 0) angles.push('IMPROVE_ACCURACY');

  if (angles.length === 0) angles.push('GENERAL_PLANNING');
  return angles;
}

function parseSnapshotJson(snapshotJson: Prisma.JsonValue | null | undefined): Partial<InsightSnapshotData> {
  if (!snapshotJson || typeof snapshotJson !== 'object' || Array.isArray(snapshotJson)) {
    return {};
  }
  return snapshotJson as Partial<InsightSnapshotData>;
}

async function getPropertyInsightInput(propertyId: string, userId: string): Promise<PropertyInsightInput> {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfile: { userId },
    },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      yearBuilt: true,
      propertySize: true,
      propertyType: true,
      updatedAt: true,
    },
  });

  if (!property) {
    throw new APIError('Property not found', 404, 'NOT_FOUND');
  }

  return {
    ...property,
    propertyType: property.propertyType ? String(property.propertyType) : null,
  };
}

function buildInsightSnapshotData(property: PropertyInsightInput): InsightSnapshotData {
  const { propertyAgeYears, ageBand } = deriveAgeBand(property.yearBuilt);
  const sizeBand = deriveSizeBand(property.propertySize);
  const regionKey = deriveRegionKey(property);
  const { confidenceScore, missingFieldKeys } = computeConfidenceScore(property);
  const topAngles = deriveTopAngles(ageBand, sizeBand, missingFieldKeys);

  return {
    schemaVersion: 'v1',
    propertyId: property.id,
    inputs: {
      yearBuilt: property.yearBuilt,
      propertySize: property.propertySize,
      propertyType: property.propertyType,
      address: property.address || null,
      city: property.city || null,
      state: property.state || null,
      zipCode: property.zipCode || null,
    },
    derived: {
      propertyAgeYears,
      ageBand,
      sizeBand,
      regionKey,
      confidenceScore,
      missingFieldKeys,
      topAngles,
    },
    computedAt: new Date().toISOString(),
    inputFingerprint: buildInputFingerprint(property),
  };
}

function isWithinSnapshotTTL(computedAt: Date, now: Date = new Date()): boolean {
  const ttlMs = INSIGHT_SNAPSHOT_TTL_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - computedAt.getTime() <= ttlMs;
}

export function isInsightSnapshotStale(
  snapshot: PropertyInsightSnapshot,
  property: Pick<PropertyInsightInput, 'id' | 'yearBuilt' | 'propertySize' | 'propertyType' | 'address' | 'city' | 'state' | 'zipCode' | 'updatedAt'>,
  now: Date = new Date()
): boolean {
  if (!isWithinSnapshotTTL(snapshot.computedAt, now)) return true;

  if (snapshot.computedAt < property.updatedAt) return true;

  const parsed = parseSnapshotJson(snapshot.snapshotJson);
  const expectedFingerprint = buildInputFingerprint({
    ...property,
    propertyType: property.propertyType ? String(property.propertyType) : null,
  });

  return parsed.inputFingerprint !== expectedFingerprint;
}

export function parseInsightSnapshot(snapshot: PropertyInsightSnapshot): InsightSnapshotData {
  const parsed = parseSnapshotJson(snapshot.snapshotJson) as Partial<InsightSnapshotData>;

  const confidenceScore = typeof snapshot.confidenceScore === 'number'
    ? snapshot.confidenceScore
    : Number(parsed.derived?.confidenceScore || 0);

  return {
    schemaVersion: 'v1',
    propertyId: snapshot.propertyId,
    inputs: {
      yearBuilt: parsed.inputs?.yearBuilt ?? null,
      propertySize: parsed.inputs?.propertySize ?? null,
      propertyType: parsed.inputs?.propertyType ?? null,
      address: parsed.inputs?.address ?? null,
      city: parsed.inputs?.city ?? null,
      state: parsed.inputs?.state ?? null,
      zipCode: parsed.inputs?.zipCode ?? null,
    },
    derived: {
      propertyAgeYears: parsed.derived?.propertyAgeYears ?? null,
      ageBand: parsed.derived?.ageBand || 'UNKNOWN',
      sizeBand: parsed.derived?.sizeBand || 'UNKNOWN',
      regionKey: parsed.derived?.regionKey || 'UNKNOWN_REGION',
      confidenceScore,
      missingFieldKeys: parsed.derived?.missingFieldKeys ?? [],
      topAngles: parsed.derived?.topAngles ?? ['GENERAL_PLANNING'],
    },
    computedAt: parsed.computedAt || snapshot.computedAt.toISOString(),
    inputFingerprint: parsed.inputFingerprint || '',
  };
}

export async function computeInsightSnapshot(args: {
  propertyId: string;
  userId: string;
  forceRecompute?: boolean;
}): Promise<{ snapshot: PropertyInsightSnapshot; property: PropertyInsightInput }> {
  const property = await getPropertyInsightInput(args.propertyId, args.userId);

  if (!args.forceRecompute) {
    const latestSnapshot = await prisma.propertyInsightSnapshot.findFirst({
      where: {
        propertyId: args.propertyId,
        userId: args.userId,
      },
      orderBy: { computedAt: 'desc' },
    });

    if (latestSnapshot && !isInsightSnapshotStale(latestSnapshot, property)) {
      return { snapshot: latestSnapshot, property };
    }
  }

  const snapshotData = buildInsightSnapshotData(property);

  const snapshot = await prisma.propertyInsightSnapshot.create({
    data: {
      propertyId: property.id,
      userId: args.userId,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      confidenceScore: snapshotData.derived.confidenceScore,
      snapshotJson: snapshotData as unknown as Prisma.InputJsonValue,
    },
  });

  return { snapshot, property };
}
