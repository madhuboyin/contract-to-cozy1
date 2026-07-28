import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type {
  RawTaxAssessmentRecord,
  TaxAssessorDataSourceConfig,
} from '../taxAssessorAdapters/taxAssessmentTypes';
import type { PropertyForTaxFetch } from '../taxAssessmentFetch.service';

const MAX_MONEY = 1_000_000_000;

type PersistContext = {
  observedAt: Date;
  radarProviderEventId: string;
};

export type PersistedSourceAssessment = {
  assessmentRecordId: string;
  parcelMatchId: string;
  jurisdictionId: string;
  sourceUrl: string;
};

function sourceUrl(source: TaxAssessorDataSourceConfig): string {
  const base = source.baseUrl.replace(/\/+$/, '');
  return source.datasetId ? `${base}/resource/${source.datasetId}` : base;
}

function normalizedControls(source: TaxAssessorDataSourceConfig): Record<string, unknown> {
  return source.queryFilterJson
    && typeof source.queryFilterJson === 'object'
    && !Array.isArray(source.queryFilterJson)
    ? source.queryFilterJson as Record<string, unknown>
    : {};
}

function parseTaxYear(value?: string): number {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new Error('Official assessment lacks a valid tax year');
  }
  return year;
}

function parseMoney(value?: string): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_MONEY) {
    throw new Error('Official assessed value is invalid');
  }
  return parsed;
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function effectiveDate(
  record: RawTaxAssessmentRecord,
  source: TaxAssessorDataSourceConfig,
  taxYear: number,
): Date | null {
  if (normalizedControls(source).assessmentDatePolicy === 'nyc_fiscal_year_start') {
    return new Date(Date.UTC(taxYear - 1, 6, 1));
  }
  return parseDate(record.assessmentDate);
}

function assessmentStage(source: TaxAssessorDataSourceConfig):
  | 'UNKNOWN'
  | 'PRELIMINARY'
  | 'TENTATIVE'
  | 'CURRENT_ROLL'
  | 'FINAL'
  | 'CORRECTED' {
  const value = String(normalizedControls(source).assessmentStage ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]+/g, '_');
  return [
    'PRELIMINARY',
    'TENTATIVE',
    'CURRENT_ROLL',
    'FINAL',
    'CORRECTED',
  ].includes(value)
    ? value as Exclude<ReturnType<typeof assessmentStage>, 'UNKNOWN'>
    : 'UNKNOWN';
}

function jurisdictionData(source: TaxAssessorDataSourceConfig) {
  const key = source.normalizedCoverageKey;
  const county = /^US-([A-Z]{2})-COUNTY-(\d{5})$/.exec(key);
  if (county) {
    return {
      normalizedKey: key,
      stateCode: county[1],
      countyFips: county[2],
      municipality: null,
    };
  }
  const city = /^US-([A-Z]{2})-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(key);
  if (city) {
    return {
      normalizedKey: key,
      stateCode: city[1],
      countyFips: null,
      municipality: city[2].replace(/-/g, ' '),
    };
  }
  const state = /^US-([A-Z]{2})$/.exec(key);
  if (state) {
    return {
      normalizedKey: key,
      stateCode: state[1],
      countyFips: null,
      municipality: null,
    };
  }
  throw new Error(`Unsupported tax coverage key: ${key}`);
}

function matchConfidence(record: RawTaxAssessmentRecord): number {
  if (record.matchConfidence === 'high') return 0.95;
  if (record.matchConfidence === 'medium') return 0.75;
  throw new Error('Ambiguous or low-confidence property match suppressed');
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class PropertyTaxSourceIngestionService {
  constructor(private readonly db = prisma) {}

  async persist(
    record: RawTaxAssessmentRecord,
    source: TaxAssessorDataSourceConfig,
    property: PropertyForTaxFetch,
    context: PersistContext,
  ): Promise<PersistedSourceAssessment> {
    const confidence = matchConfidence(record);
    const taxYear = parseTaxYear(record.taxYear);
    const totalAssessedValue = parseMoney(record.assessedValueRaw);
    const stage = assessmentStage(source);
    const officialUrl = sourceUrl(source);
    const jurisdiction = jurisdictionData(source);
    const parcelIdentity = record.parcelId?.trim() || record.externalId.trim();
    if (!parcelIdentity) throw new Error('Official assessment lacks parcel identity');

    return this.db.$transaction(async (tx) => {
      const jurisdictionRow = await tx.propertyTaxJurisdiction.upsert({
        where: { normalizedKey: jurisdiction.normalizedKey },
        create: {
          ...jurisdiction,
          countryCode: 'US',
          status: 'COVERED',
        },
        update: {
          stateCode: jurisdiction.stateCode,
          countyFips: jurisdiction.countyFips,
          municipality: jurisdiction.municipality,
          status: 'COVERED',
        },
      });

      const parcelIngestKey = [
        'official-parcel',
        property.id,
        source.id,
        parcelIdentity,
      ].join(':');
      const existingParcelMatch = record.parcelId
        ? await tx.propertyTaxParcelMatch.findFirst({
            where: {
              propertyId: property.id,
              jurisdictionId: jurisdictionRow.id,
              parcelId: record.parcelId,
            },
          })
        : null;
      const parcelData = {
        dataSourceId: source.id,
        parcelId: record.parcelId ?? null,
        situsAddress: record.situsAddress ?? property.address,
        situsCity: property.city,
        situsState: property.state,
        situsPostalCode: record.situsPostalCode ?? property.zipCode,
        matchMethod: record.matchMethod === 'address_with_parcel_evidence'
          ? 'ADDRESS_WITH_PARCEL_EVIDENCE' as const
          : 'ADDRESS' as const,
        confidence,
        sourceExternalId: record.externalId,
        sourceUrl: officialUrl,
        matchedAt: context.observedAt,
      };
      const parcelMatch = existingParcelMatch
        ? await tx.propertyTaxParcelMatch.update({
            where: { id: existingParcelMatch.id },
            data: {
              ingestKey: existingParcelMatch.ingestKey ?? parcelIngestKey,
              ...parcelData,
              status: existingParcelMatch.status === 'HOMEOWNER_CONFIRMED'
                ? 'HOMEOWNER_CONFIRMED'
                : 'MATCHED',
            },
          })
        : await tx.propertyTaxParcelMatch.upsert({
            where: { ingestKey: parcelIngestKey },
            create: {
              ...parcelData,
              ingestKey: parcelIngestKey,
              propertyId: property.id,
              jurisdictionId: jurisdictionRow.id,
              status: 'MATCHED',
              evidenceJson: json({
                matchConfidence: record.matchConfidence,
                matchMethod: record.matchMethod,
                ambiguitySuppressedByAdapter: true,
              }),
            },
            update: {
              ...parcelData,
              status: 'MATCHED',
            },
          });

      const assessmentIngestKey = [
        'official-assessment',
        property.id,
        source.id,
        record.externalId,
        taxYear,
      ].join(':');
      const assessment = await tx.propertyTaxAssessmentRecord.upsert({
        where: { ingestKey: assessmentIngestKey },
        create: {
          ingestKey: assessmentIngestKey,
          radarProviderEventId: context.radarProviderEventId,
          propertyId: property.id,
          jurisdictionId: jurisdictionRow.id,
          parcelMatchId: parcelMatch.id,
          dataSourceId: source.id,
          taxYear,
          stage,
          sourceType: 'OFFICIAL_SOURCE',
          confidence: record.matchConfidence === 'high' ? 'VERIFIED' : 'HIGH',
          assessmentDate: parseDate(record.assessmentDate),
          effectiveDate: effectiveDate(record, source, taxYear),
          observedAt: context.observedAt,
          totalAssessedValue,
          sourceExternalId: record.externalId,
          sourceUrl: officialUrl,
          rawDataJson: json(record.rawData),
        },
        update: {
          radarProviderEventId: context.radarProviderEventId,
          parcelMatchId: parcelMatch.id,
          stage,
          status: 'ACTIVE',
          confidence: record.matchConfidence === 'high' ? 'VERIFIED' : 'HIGH',
          assessmentDate: parseDate(record.assessmentDate),
          effectiveDate: effectiveDate(record, source, taxYear),
          observedAt: context.observedAt,
          totalAssessedValue,
          sourceUrl: officialUrl,
          rawDataJson: json(record.rawData),
        },
      });

      const evidence: Array<[string, unknown]> = [
        ['parcelId', record.parcelId],
        ['stage', stage],
        ['totalAssessedValue', totalAssessedValue],
        ['assessmentDate', parseDate(record.assessmentDate)?.toISOString()],
      ];
      for (const [fieldKey, value] of evidence) {
        if (value === undefined || value === null) continue;
        const parent = fieldKey === 'parcelId'
          ? { parcelMatchId: parcelMatch.id, assessmentRecordId: null }
          : { parcelMatchId: null, assessmentRecordId: assessment.id };
        await tx.propertyTaxFieldEvidence.upsert({
          where: {
            ingestKey: `${assessmentIngestKey}:field:${fieldKey}`,
          },
          create: {
            ingestKey: `${assessmentIngestKey}:field:${fieldKey}`,
            ...parent,
            fieldKey,
            valueJson: json(value),
            sourceType: 'OFFICIAL_SOURCE',
            confidence: record.matchConfidence === 'high' ? 'VERIFIED' : 'HIGH',
            reviewStatus: 'VERIFIED',
            sourceDataSourceId: source.id,
            sourceExternalId: record.externalId,
            sourceUrl: officialUrl,
            observedAt: context.observedAt,
            effectiveAt: parseDate(record.assessmentDate),
          },
          update: {
            valueJson: json(value),
            confidence: record.matchConfidence === 'high' ? 'VERIFIED' : 'HIGH',
            reviewStatus: 'VERIFIED',
            observedAt: context.observedAt,
            effectiveAt: parseDate(record.assessmentDate),
            sourceUrl: officialUrl,
          },
        });
      }

      return {
        assessmentRecordId: assessment.id,
        parcelMatchId: parcelMatch.id,
        jurisdictionId: jurisdictionRow.id,
        sourceUrl: officialUrl,
      };
    });
  }
}

export const propertyTaxSourceIngestionService =
  new PropertyTaxSourceIngestionService();
