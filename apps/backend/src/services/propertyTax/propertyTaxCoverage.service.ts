import { prisma } from '../../lib/prisma';
import { taxCoverageKey } from '../taxAssessmentFetch.service';

const FRESHNESS_WINDOW_MS = 8 * 24 * 60 * 60 * 1_000;

function officialUrl(source: { baseUrl: string; datasetId: string | null }): string {
  const base = source.baseUrl.replace(/\/+$/, '');
  return source.datasetId ? `${base}/resource/${source.datasetId}` : base;
}

function controls(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export class PropertyTaxCoverageService {
  constructor(private readonly db = prisma) {}

  async getForProperty(propertyId: string, userId: string, now = new Date()) {
    const property = await this.db.property.findFirst({
      where: { id: propertyId, homeownerProfile: { userId } },
      select: {
        id: true,
        city: true,
        state: true,
        countyFips: true,
      },
    });
    if (!property) throw new Error('Property not found');

    const orderedKeys = (['CITY', 'COUNTY', 'STATE'] as const)
      .map((coverageType) => taxCoverageKey(coverageType, property))
      .filter((key): key is string => Boolean(key));
    const sources = await this.db.taxAssessorDataSource.findMany({
      where: { normalizedCoverageKey: { in: orderedKeys } },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        coverageType: true,
        normalizedCoverageKey: true,
        baseUrl: true,
        datasetId: true,
        queryFilterJson: true,
        lastFetchAt: true,
        lastFetchError: true,
        totalAssessmentsFetched: true,
      },
    });
    const byKey = new Map(sources.map((source) => [
      source.normalizedCoverageKey,
      source,
    ]));
    const source = orderedKeys
      .map((key) => byKey.get(key))
      .find((candidate) => candidate?.status === 'ACTIVE')
      ?? orderedKeys.map((key) => byKey.get(key)).find(Boolean)
      ?? null;

    if (!source) {
      return {
        status: 'UNCONFIGURED' as const,
        freshness: 'NEVER_FETCHED' as const,
        coverageKeys: orderedKeys,
        source: null,
        lastGoodAssessment: null,
      };
    }

    const lastGood = await this.db.propertyTaxAssessmentRecord.findFirst({
      where: {
        propertyId,
        dataSourceId: source.id,
        sourceType: 'OFFICIAL_SOURCE',
        status: { in: ['ACTIVE', 'CONFLICTED'] },
      },
      orderBy: [{ taxYear: 'desc' }, { observedAt: 'desc' }],
      select: {
        id: true,
        taxYear: true,
        stage: true,
        observedAt: true,
        effectiveDate: true,
        sourceExternalId: true,
        sourceUrl: true,
        radarProviderEventId: true,
        parcelMatch: {
          select: {
            parcelId: true,
            matchMethod: true,
            confidence: true,
          },
        },
      },
    });
    const unavailable = source.status === 'INACTIVE';
    const degraded = ['ERROR', 'RATE_LIMITED'].includes(source.status)
      || Boolean(source.lastFetchError);
    const stale = !source.lastFetchAt
      || now.getTime() - source.lastFetchAt.getTime() > FRESHNESS_WINDOW_MS;
    const config = controls(source.queryFilterJson);
    const freshness = degraded
      ? 'DEGRADED'
      : !source.lastFetchAt
        ? 'NEVER_FETCHED'
        : stale
          ? 'STALE'
          : 'FRESH';

    return {
      status: degraded
        ? 'DEGRADED' as const
        : unavailable
          ? 'UNAVAILABLE' as const
          : source.status === 'ACTIVE'
          ? 'COVERED' as const
          : 'DEGRADED' as const,
      freshness,
      coverageKeys: orderedKeys,
      source: {
        id: source.id,
        name: source.name,
        slug: source.slug,
        status: source.status,
        coverageType: source.coverageType,
        normalizedCoverageKey: source.normalizedCoverageKey,
        officialUrl: officialUrl(source),
        lastFetchAt: source.lastFetchAt?.toISOString() ?? null,
        lastFetchError: source.lastFetchError,
        totalAssessmentsFetched: source.totalAssessmentsFetched,
        assessmentStage:
          typeof config.assessmentStage === 'string'
            ? config.assessmentStage
            : null,
        pilotConstraints: {
          borough: typeof config.boro === 'string' ? config.boro : null,
          recordType: typeof config.rectype === 'string' ? config.rectype : null,
          taxClass: typeof config.curtaxclass === 'string'
            ? config.curtaxclass
            : null,
        },
        appealInformation: {
          officialUrl: typeof config.appealInfoUrl === 'string'
            ? config.appealInfoUrl
            : null,
          disclaimer: typeof config.appealDisclaimer === 'string'
            ? config.appealDisclaimer
            : null,
        },
      },
      lastGoodAssessment: lastGood
        ? {
            id: lastGood.id,
            taxYear: lastGood.taxYear,
            stage: lastGood.stage,
            observedAt: lastGood.observedAt.toISOString(),
            effectiveDate: lastGood.effectiveDate?.toISOString() ?? null,
            sourceExternalId: lastGood.sourceExternalId,
            sourceUrl: lastGood.sourceUrl,
            radarProviderEventId: lastGood.radarProviderEventId,
            parcelId: lastGood.parcelMatch?.parcelId ?? null,
            matchMethod: lastGood.parcelMatch?.matchMethod ?? null,
            matchConfidence:
              lastGood.parcelMatch?.confidence?.toNumber() ?? null,
          }
        : null,
    };
  }
}

export const propertyTaxCoverageService = new PropertyTaxCoverageService();
