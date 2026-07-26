import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import {
  radarSourceRegistrationSchema,
  type RadarSourceRegistrationInput,
} from '../contracts';
import {
  evaluateWorkerExecution,
  type WorkerExecutionDecision,
  type WorkerTriggerType,
} from '../../../config/workerExecutionPolicy';

const SENSITIVE_CONFIG_KEY = /(api[-_]?key|authorization|credential|password|private[-_]?key|secret|token|connection[-_]?string)/i;

export type RadarRuntimeEnvironment = 'development' | 'test' | 'staging' | 'production';

export type RadarCoverageProperty = {
  id: string;
  countryCode?: string | null;
  state?: string | null;
  city?: string | null;
  normalizedZipCode?: string | null;
  zipCode?: string | null;
  countyFips?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type RadarSourceCoverageDecision = {
  status: 'covered' | 'not_covered' | 'disabled' | 'failed' | 'stale' | 'unknown';
  sourceDefinitionId: string;
  sourceKey: string;
  detail: string;
  matchedCoverageIds: string[];
};

type RegistryDb = Pick<typeof prisma, 'radarSourceDefinition'>;

type CoverageRecord = {
  id: string;
  coverageType: string;
  countryCode: string | null;
  stateCode: string | null;
  cityName: string | null;
  countyFips: string | null;
  postalCode: string | null;
  centerLatitude: number | null;
  centerLongitude: number | null;
  radiusMeters: number | null;
  geometryGeoJson: unknown;
  validFrom: Date | null;
  validUntil: Date | null;
};

type SourceRecord = {
  id: string;
  key: string;
  family: string;
  sourceType: string;
  name: string;
  provider: string;
  adapterVersion: string;
  contractVersion: number;
  isEnabled: boolean;
  environments: string[];
  scheduleCron: string | null;
  freshnessSeconds: number;
  supportedEventTypes: string[];
  coverageDescription: string;
  configJson: unknown;
  health?: {
    status: string;
    lastAttemptAt: Date | null;
    lastSuccessAt: Date | null;
    dataFreshThrough: Date | null;
    consecutiveFailures: number;
    message: string | null;
  } | null;
  coverage?: CoverageRecord[];
};

export type SafeRadarSourceDefinition = Omit<SourceRecord, 'configJson'> & {
  safeConfig: unknown;
};

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function redactRadarSourceConfig(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactRadarSourceConfig);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SENSITIVE_CONFIG_KEY.test(key) ? '[REDACTED]' : redactRadarSourceConfig(entry),
    ]),
  );
}

export function resolveRadarRuntimeEnvironment(env: NodeJS.ProcessEnv = process.env): RadarRuntimeEnvironment {
  const explicit = env.APP_ENV?.trim().toLowerCase();
  if (explicit === 'staging') return 'staging';
  if (explicit === 'production') return 'production';
  if (explicit === 'test') return 'test';
  if (env.NODE_ENV === 'production') return 'production';
  if (env.NODE_ENV === 'test') return 'test';
  return 'development';
}

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusMeters = 6_371_000;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
}

function pointInPolygon(longitude: number, latitude: number, polygon: unknown): boolean {
  if (!polygon || typeof polygon !== 'object') return false;
  const geoJson = polygon as { type?: unknown; coordinates?: unknown };
  if (geoJson.type !== 'Polygon' || !Array.isArray(geoJson.coordinates)) return false;
  const outerRing = geoJson.coordinates[0];
  if (!Array.isArray(outerRing) || outerRing.length < 4) return false;

  let inside = false;
  for (let index = 0, previous = outerRing.length - 1; index < outerRing.length; previous = index++) {
    const currentPoint = outerRing[index];
    const previousPoint = outerRing[previous];
    if (!Array.isArray(currentPoint) || !Array.isArray(previousPoint)) return false;
    const [currentLon, currentLat] = currentPoint.map(Number);
    const [previousLon, previousLat] = previousPoint.map(Number);
    if (![currentLon, currentLat, previousLon, previousLat].every(Number.isFinite)) return false;
    const intersects =
      (currentLat > latitude) !== (previousLat > latitude) &&
      longitude <
        ((previousLon - currentLon) * (latitude - currentLat)) /
          (previousLat - currentLat || Number.EPSILON) +
          currentLon;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function coverageEntryMatchesProperty(
  coverage: CoverageRecord,
  property: RadarCoverageProperty,
  now = new Date(),
): boolean | null {
  if (coverage.validFrom && coverage.validFrom > now) return false;
  if (coverage.validUntil && coverage.validUntil < now) return false;

  switch (coverage.coverageType) {
    case 'global':
      return true;
    case 'country':
      return normalized(coverage.countryCode) === normalized(property.countryCode ?? 'US');
    case 'state':
      return (
        normalized(coverage.countryCode) === normalized(property.countryCode ?? 'US') &&
        normalized(coverage.stateCode) === normalized(property.state)
      );
    case 'city':
      return (
        normalized(coverage.countryCode) === normalized(property.countryCode ?? 'US') &&
        normalized(coverage.stateCode) === normalized(property.state) &&
        normalized(coverage.cityName) === normalized(property.city)
      );
    case 'county':
      return (
        normalized(coverage.countryCode) === normalized(property.countryCode ?? 'US') &&
        normalized(coverage.countyFips) === normalized(property.countyFips)
      );
    case 'postal_code':
      return (
        normalized(coverage.countryCode) === normalized(property.countryCode ?? 'US') &&
        normalized(coverage.postalCode) === normalized(property.normalizedZipCode ?? property.zipCode)
      );
    case 'radius':
      if (
        coverage.centerLatitude == null ||
        coverage.centerLongitude == null ||
        coverage.radiusMeters == null ||
        property.latitude == null ||
        property.longitude == null
      ) return null;
      return haversineMeters(
        coverage.centerLatitude,
        coverage.centerLongitude,
        property.latitude,
        property.longitude,
      ) <= coverage.radiusMeters;
    case 'polygon':
      if (property.latitude == null || property.longitude == null) return null;
      return pointInPolygon(property.longitude, property.latitude, coverage.geometryGeoJson);
    default:
      return null;
  }
}

export class RadarSourceRegistryService {
  constructor(private readonly db: RegistryDb = prisma) {}

  async register(input: RadarSourceRegistrationInput): Promise<SafeRadarSourceDefinition> {
    const parsed = radarSourceRegistrationSchema.parse(input);
    const coverage = parsed.coverage.map((entry) => ({
      coverageType: entry.coverageType,
      countryCode: entry.countryCode ?? null,
      stateCode: entry.stateCode ?? null,
      cityName: entry.cityName ?? null,
      countyFips: entry.countyFips ?? null,
      postalCode: entry.postalCode ?? null,
      centerLatitude: entry.centerLatitude ?? null,
      centerLongitude: entry.centerLongitude ?? null,
      radiusMeters: entry.radiusMeters ?? null,
      geometryGeoJson: entry.geometryGeoJson ? jsonInput(entry.geometryGeoJson) : Prisma.JsonNull,
      priority: entry.priority,
      validFrom: entry.validFrom ?? null,
      validUntil: entry.validUntil ?? null,
    }));
    const definitionData = {
      family: parsed.family,
      sourceType: parsed.sourceType,
      name: parsed.name,
      provider: parsed.provider,
      adapterVersion: parsed.adapterVersion,
      contractVersion: parsed.contractVersion,
      isEnabled: parsed.isEnabled,
      environments: parsed.environments,
      scheduleCron: parsed.scheduleCron ?? null,
      freshnessSeconds: parsed.freshnessSeconds,
      supportedEventTypes: parsed.supportedEventTypes,
      coverageDescription: parsed.coverageDescription,
      configJson: jsonInput(parsed.configJson),
    };

    const source = await this.db.radarSourceDefinition.upsert({
      where: { key: parsed.key },
      create: {
        key: parsed.key,
        ...definitionData,
        health: {
          create: { status: parsed.isEnabled ? 'unknown' : 'disabled' },
        },
        coverage: { create: coverage },
      },
      update: {
        ...definitionData,
        health: {
          upsert: {
            create: { status: parsed.isEnabled ? 'unknown' : 'disabled' },
            update: {
              ...(!parsed.isEnabled ? { status: 'disabled' as const, message: 'Source is disabled' } : {}),
            },
          },
        },
        coverage: {
          deleteMany: {},
          create: coverage,
        },
      },
      include: { health: true, coverage: true },
    });
    return this.toSafeDefinition(source as SourceRecord);
  }

  async getByKey(key: string): Promise<SafeRadarSourceDefinition | null> {
    const source = await this.db.radarSourceDefinition.findUnique({
      where: { key },
      include: { health: true, coverage: true },
    });
    return source ? this.toSafeDefinition(source as SourceRecord) : null;
  }

  async list(): Promise<SafeRadarSourceDefinition[]> {
    const sources = await this.db.radarSourceDefinition.findMany({
      include: { health: true, coverage: true },
      orderBy: [{ family: 'asc' }, { key: 'asc' }],
    });
    return sources.map((source) => this.toSafeDefinition(source as SourceRecord));
  }

  executionDecision(
    source: Pick<SourceRecord, 'key' | 'provider' | 'sourceType' | 'isEnabled' | 'environments'>,
    triggerType: WorkerTriggerType,
    env: NodeJS.ProcessEnv = process.env,
  ): WorkerExecutionDecision {
    if (!source.isEnabled) return { allowed: false, reason: 'source definition is disabled' };
    const runtimeEnvironment = resolveRadarRuntimeEnvironment(env);
    if (!source.environments.includes(runtimeEnvironment)) {
      return { allowed: false, reason: `source is not enabled for ${runtimeEnvironment}` };
    }
    return evaluateWorkerExecution(
      source.key,
      triggerType,
      {
        impact: 'INTERNAL_WRITE',
        customerJob: 'STAY_AHEAD',
        defaultEnabledInBeta: true,
        supportsDryRun: true,
        supportsPropertyScope: true,
        ...(source.sourceType !== 'internal_derived' && source.sourceType !== 'manual_import'
          ? { externalProvider: source.provider }
          : {}),
        humanApprovalClass: 'NONE',
      },
      env,
    );
  }

  coverageDecision(
    source: SourceRecord,
    property: RadarCoverageProperty,
    now = new Date(),
  ): RadarSourceCoverageDecision {
    if (!source.isEnabled) {
      return this.coverageResult(source, 'disabled', 'Source is disabled', []);
    }
    const healthStatus = this.effectiveHealthStatus(source, now);
    if (healthStatus === 'failed' || healthStatus === 'stale') {
      return this.coverageResult(
        source,
        healthStatus,
        healthStatus === 'failed' ? 'The latest source run failed' : 'Source data is stale',
        [],
      );
    }
    const coverage = source.coverage ?? [];
    if (coverage.length === 0) {
      return this.coverageResult(source, 'unknown', 'No source coverage is configured', []);
    }

    const matches: string[] = [];
    let requiresGeography = false;
    for (const entry of coverage) {
      const result = coverageEntryMatchesProperty(entry, property, now);
      if (result === true) matches.push(entry.id);
      if (result === null) requiresGeography = true;
    }
    if (matches.length > 0) {
      return this.coverageResult(source, 'covered', source.coverageDescription, matches);
    }
    if (requiresGeography) {
      return this.coverageResult(source, 'unknown', 'Property geography is incomplete', []);
    }
    return this.coverageResult(source, 'not_covered', 'Source does not cover this property', []);
  }

  effectiveHealthStatus(source: SourceRecord, now = new Date()): string {
    if (!source.isEnabled) return 'disabled';
    if (!source.health) return 'unknown';
    if (source.health.status === 'failed' || source.health.status === 'degraded') {
      return source.health.status;
    }
    const freshnessAnchor = source.health.dataFreshThrough ?? source.health.lastSuccessAt;
    if (
      freshnessAnchor &&
      now.getTime() - freshnessAnchor.getTime() > source.freshnessSeconds * 1_000
    ) return 'stale';
    return source.health.status;
  }

  private toSafeDefinition(source: SourceRecord): SafeRadarSourceDefinition {
    const { configJson, ...definition } = source;
    return { ...definition, safeConfig: redactRadarSourceConfig(configJson) };
  }

  private coverageResult(
    source: SourceRecord,
    status: RadarSourceCoverageDecision['status'],
    detail: string,
    matchedCoverageIds: string[],
  ): RadarSourceCoverageDecision {
    return {
      status,
      sourceDefinitionId: source.id,
      sourceKey: source.key,
      detail,
      matchedCoverageIds,
    };
  }
}

export const radarSourceRegistryService = new RadarSourceRegistryService();
