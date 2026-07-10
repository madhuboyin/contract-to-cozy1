import type { CanonicalRadarSignal } from './radar.types';
import type {
  RawTaxAssessmentRecord,
  TaxAssessorDataSourceConfig,
} from '../../../backend/src/services/taxAssessorAdapters/taxAssessmentTypes';

type PropertyForNormalize = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

function buildDedupeKey(dataSource: TaxAssessorDataSourceConfig, record: RawTaxAssessmentRecord): string {
  return ['tax-assessor', dataSource.slug, record.externalId].join('|');
}

function parseAssessedValue(raw?: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const val = parseFloat(cleaned);
  return Number.isFinite(val) ? val : null;
}

export function normalizeTaxAssessmentRecord(
  record: RawTaxAssessmentRecord,
  dataSource: TaxAssessorDataSourceConfig,
  property: PropertyForNormalize,
): CanonicalRadarSignal {
  const assessedValue = parseAssessedValue(record.assessedValueRaw);
  const previousValue = parseAssessedValue(record.previousAssessedValueRaw);
  const changePct =
    assessedValue != null && previousValue != null && previousValue > 0
      ? ((assessedValue - previousValue) / previousValue) * 100
      : null;

  const title = record.taxYear
    ? `Tax reassessment notice for ${record.taxYear}`
    : `Tax reassessment notice for ${property.address}`;

  const summary =
    assessedValue != null
      ? `New assessed value: $${assessedValue.toLocaleString()}` +
        (changePct != null ? ` (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}% vs. prior assessment)` : '')
      : `Tax reassessment notice recorded for parcel ${record.parcelId ?? property.address}.`;

  // Larger assessment jumps warrant more attention — mirrors the severity
  // tiering convention used elsewhere in the radar pipeline.
  const severity: CanonicalRadarSignal['severity'] =
    changePct != null && changePct >= 15 ? 'high' : changePct != null && changePct >= 5 ? 'medium' : 'low';

  const startAt = record.assessmentDate
    ? new Date(record.assessmentDate).toISOString()
    : new Date().toISOString();

  return {
    eventType: 'tax_reassessment',
    eventSubType: null,
    title,
    summary,
    sourceType: 'tax_assessor_feed',
    sourceRef: record.externalId,
    severity,
    startAt,
    endAt: null,
    locationType: 'property',
    locationKey: property.id,
    geoJson: null,
    payloadJson: {
      parcelId: record.parcelId ?? null,
      assessedValue,
      previousValue,
      changePct,
      taxYear: record.taxYear ?? null,
      dataSourceSlug: dataSource.slug,
      property: {
        id: property.id,
        address: property.address,
        city: property.city,
        state: property.state,
        zipCode: property.zipCode,
      },
    },
    dedupeKey: buildDedupeKey(dataSource, record),
    status: 'active',
  };
}
