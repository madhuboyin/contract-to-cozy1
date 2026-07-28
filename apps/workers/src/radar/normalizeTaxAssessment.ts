import {
  canonicalRadarObservationSchema,
  type CanonicalRadarObservation,
} from '@worker-shared/modules/homeEventRadar/contracts';
import type {
  RawTaxAssessmentRecord,
  TaxAssessmentDatePolicy,
  TaxAssessorDataSourceConfig,
} from '@worker-shared/services/taxAssessorAdapters/taxAssessmentTypes';

export const DEFAULT_TAX_EVENT_TTL_DAYS = 120;
export const MIN_TAX_EVENT_TTL_DAYS = 30;
export const MAX_TAX_EVENT_TTL_DAYS = 365;

type PropertyForNormalize = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  countyFips?: string | null;
};

type TaxNormalizeContext = {
  sourceDefinitionId: string;
  observedAt: string;
  canonicalAssessmentRecordId?: string;
};

function parseAssessedValue(raw?: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function ttlDays(dataSource: TaxAssessorDataSourceConfig): number {
  const config = dataSource.queryFilterJson;
  const raw = config && typeof config === 'object' && !Array.isArray(config)
    ? Number((config as Record<string, unknown>).eventTtlDays)
    : NaN;
  if (!Number.isInteger(raw)) return DEFAULT_TAX_EVENT_TTL_DAYS;
  return Math.min(MAX_TAX_EVENT_TTL_DAYS, Math.max(MIN_TAX_EVENT_TTL_DAYS, raw));
}

function safeDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function queryControls(
  dataSource: TaxAssessorDataSourceConfig,
): Record<string, unknown> {
  const config = dataSource.queryFilterJson;
  return config && typeof config === 'object' && !Array.isArray(config)
    ? config as Record<string, unknown>
    : {};
}

function effectiveDate(
  record: RawTaxAssessmentRecord,
  dataSource: TaxAssessorDataSourceConfig,
  observedAt: Date,
): Date {
  const policy = queryControls(dataSource).assessmentDatePolicy as
    | TaxAssessmentDatePolicy
    | undefined;
  if (policy === 'nyc_fiscal_year_start') {
    const taxYear = Number(record.taxYear);
    if (Number.isInteger(taxYear) && taxYear >= 2000 && taxYear <= 2200) {
      return new Date(Date.UTC(taxYear - 1, 6, 1));
    }
  }
  return safeDate(record.assessmentDate, observedAt);
}

function providerRevision(
  record: RawTaxAssessmentRecord,
  assessedValue: number | null,
  previousValue: number | null,
): string {
  return [
    record.taxYear ?? 'unknown-year',
    record.assessmentDate ?? 'unknown-date',
    assessedValue ?? 'unknown-current',
    previousValue ?? 'unknown-prior',
  ].join(':').slice(0, 256);
}

export function normalizeTaxAssessmentRecord(
  record: RawTaxAssessmentRecord,
  dataSource: TaxAssessorDataSourceConfig,
  property: PropertyForNormalize,
  context: TaxNormalizeContext,
): CanonicalRadarObservation {
  if (!['medium', 'high'].includes(record.matchConfidence)) {
    throw new Error('Tax assessment record lacks acceptable property-match confidence');
  }
  const observedAt = safeDate(context.observedAt, new Date());
  const effectiveAt = effectiveDate(record, dataSource, observedAt);
  const expiresAt = new Date(
    effectiveAt.getTime() + ttlDays(dataSource) * 24 * 60 * 60 * 1_000,
  );
  const assessedValue = parseAssessedValue(record.assessedValueRaw);
  const previousValue = parseAssessedValue(record.previousAssessedValueRaw);
  const changePct =
    assessedValue != null && previousValue != null && previousValue > 0
      ? ((assessedValue - previousValue) / previousValue) * 100
      : null;
  const title = record.taxYear
    ? `Tax reassessment notice for ${record.taxYear}`
    : 'Property tax reassessment notice';
  const summary = assessedValue != null
    ? `New assessed value: $${assessedValue.toLocaleString()}`
      + (
        changePct != null
          ? ` (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}% vs. prior assessment)`
          : ''
      )
    : `Tax reassessment notice recorded for parcel ${record.parcelId ?? property.address}.`;
  const severity: CanonicalRadarObservation['severity'] =
    changePct != null && changePct >= 15
      ? 'high'
      : changePct != null && changePct >= 5
        ? 'moderate'
        : 'low';
  const providerEventId = [
    'tax-assessor',
    dataSource.slug,
    record.externalId,
    property.id,
  ].join(':');
  const controls = queryControls(dataSource);

  return canonicalRadarObservationSchema.parse({
    schemaVersion: 1,
    sourceDefinitionId: context.sourceDefinitionId,
    providerEventId,
    providerRevision: providerRevision(record, assessedValue, previousValue),
    sourceFamily: 'tax',
    eventType: 'tax_reassessment',
    title,
    summary,
    severity,
    lifecycleStatus: expiresAt <= observedAt ? 'expired' : 'active',
    effectiveAt: effectiveAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    observedAt: observedAt.toISOString(),
    geography: {
      type: 'property',
      propertyId: property.id,
    },
    canonicalUrl: `${dataSource.baseUrl.replace(/\/+$/, '')}/resource/${dataSource.datasetId}`,
    deduplicationKeys: [
      `tax:${dataSource.slug}:${record.externalId}`,
      `property:${property.id}`,
    ],
    rawPayload: {
      parcelId: record.parcelId ?? null,
      assessedValue,
      previousValue,
      changePct,
      taxYear: record.taxYear ?? null,
      dataSourceId: dataSource.id,
      dataSourceSlug: dataSource.slug,
      canonicalAssessmentRecordId:
        context.canonicalAssessmentRecordId ?? null,
      matchConfidence: record.matchConfidence,
      matchMethod: record.matchMethod,
      situsAddress: record.situsAddress ?? null,
      situsPostalCode: record.situsPostalCode ?? null,
      propertyGeography: {
        city: property.city,
        state: property.state,
        zipCode: property.zipCode,
        countyFips: property.countyFips ?? null,
      },
      eventTtlDays: ttlDays(dataSource),
      assessmentStage:
        typeof controls.assessmentStage === 'string'
          ? controls.assessmentStage
          : null,
      assessedValueIsMarketValue: false,
      appealInformation: {
        officialUrl:
          typeof controls.appealInfoUrl === 'string'
            ? controls.appealInfoUrl
            : null,
        disclaimer:
          typeof controls.appealDisclaimer === 'string'
            ? controls.appealDisclaimer
            : 'Confirm filing windows and eligibility with the official assessor.',
      },
    },
  });
}
