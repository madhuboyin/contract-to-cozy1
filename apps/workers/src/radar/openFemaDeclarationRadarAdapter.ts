import {
  canonicalRadarObservationSchema,
  type CanonicalRadarObservation,
} from '@worker-shared/modules/homeEventRadar/contracts';
import {
  radarObservationFingerprint,
} from '@worker-shared/modules/homeEventRadar/domain/radarObservationIdentity';
import { isSafeRadarCanonicalUrl, type RadarSourceAdapter } from './adapterConformance';

export const OPEN_FEMA_RELEVANCE_DAYS = 548;

export type OpenFemaDeclaration = {
  id: string;
  hash: string;
  disasterNumber: number;
  declarationCode: string;
  state: string;
  declarationType: 'DR' | 'EM' | 'FM' | 'FS';
  declarationTitle: string;
  incidentType: string;
  declarationDate: string;
  incidentBeginDate: string;
  incidentEndDate: string | null;
  disasterCloseoutDate: string | null;
  lastRefresh: string;
  fipsStateCode: string;
  fipsCountyCode: string;
  designatedArea: string;
  individualAssistance: boolean;
  householdAssistance: boolean;
  publicAssistance: boolean;
  hazardMitigation: boolean;
  rawPayload: unknown;
};

export type OpenFemaAdapterContext = {
  sourceDefinitionId: string;
  observedAt: string;
};

function normalizedToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function openFemaCountyFips(record: OpenFemaDeclaration): string | null {
  if (!/^\d{2}$/.test(record.fipsStateCode) || !/^\d{3}$/.test(record.fipsCountyCode)) {
    return null;
  }
  return `${record.fipsStateCode}${record.fipsCountyCode}`;
}

export function isOpenFemaStatewide(record: OpenFemaDeclaration): boolean {
  return record.fipsCountyCode === '000'
    && record.designatedArea.trim().toLowerCase() === 'statewide';
}

function severity(record: OpenFemaDeclaration): CanonicalRadarObservation['severity'] {
  if (record.declarationType === 'DR' && (record.individualAssistance || record.householdAssistance)) {
    return 'moderate';
  }
  if (record.declarationType === 'DR' || record.declarationType === 'EM') return 'low';
  return 'info';
}

function declarationTypeLabel(value: OpenFemaDeclaration['declarationType']): string {
  switch (value) {
    case 'DR': return 'major disaster declaration';
    case 'EM': return 'emergency declaration';
    case 'FM': return 'fire management assistance declaration';
    case 'FS': return 'fire suppression authorization';
  }
}

function assistanceCopy(record: OpenFemaDeclaration): string {
  if (record.individualAssistance || record.householdAssistance) {
    return 'FEMA lists individual or household assistance for this designated area; eligibility is not guaranteed and must be confirmed through official channels.';
  }
  if (record.publicAssistance) {
    return 'This record lists public assistance, which generally supports eligible governments and organizations and does not by itself confirm homeowner assistance.';
  }
  if (record.hazardMitigation) {
    return 'This record lists hazard-mitigation support and does not by itself confirm homeowner assistance.';
  }
  return 'The declaration record does not currently list individual or household assistance for this designated area.';
}

function summary(record: OpenFemaDeclaration): string {
  return `FEMA issued a ${declarationTypeLabel(record.declarationType)} for ${record.designatedArea}, ${record.state}, related to ${record.incidentType.toLowerCase()}. This is recovery and assistance context, not an immediate hazard warning. ${assistanceCopy(record)}`;
}

export const openFemaDeclarationRadarAdapter: RadarSourceAdapter<
  OpenFemaDeclaration,
  OpenFemaAdapterContext
> = {
  normalize(record, context) {
    const countyFips = openFemaCountyFips(record);
    if (!countyFips) {
      throw new TypeError('OpenFEMA declaration is missing supported state/county FIPS geography');
    }
    if (record.fipsCountyCode === '000' && !isOpenFemaStatewide(record)) {
      throw new TypeError('OpenFEMA non-county designation cannot be broadened to state geography');
    }
    if (
      !record.id.trim()
      || !record.hash.trim()
      || !record.state.trim()
      || !record.designatedArea.trim()
      || !record.declarationTitle.trim()
    ) {
      throw new TypeError('OpenFEMA declaration is missing stable identity or display fields');
    }
    const canonicalUrl = `https://www.fema.gov/disaster/${record.disasterNumber}`;
    if (!isSafeRadarCanonicalUrl(canonicalUrl, ['www.fema.gov'])) {
      throw new TypeError('Unsafe FEMA canonical URL');
    }
    const observedAt = new Date(context.observedAt);
    const closeout = record.disasterCloseoutDate
      ? new Date(record.disasterCloseoutDate)
      : null;
    const lifecycleStatus = closeout && closeout.getTime() <= observedAt.getTime()
      ? 'resolved'
      : 'active';
    const relevanceExpiry = new Date(
      new Date(record.declarationDate).getTime() + OPEN_FEMA_RELEVANCE_DAYS * 86_400_000,
    );
    const expiresAt = lifecycleStatus === 'resolved'
      ? closeout!.toISOString()
      : relevanceExpiry.toISOString();
    const stateScope = isOpenFemaStatewide(record);
    // Disaster number + provider geography is the durable declaration-area
    // identity. OpenFEMA's row UUID remains evidence, but must not split the
    // lifecycle if FEMA republishes the same designation under a new row ID.
    const providerEventId = `openfema:${record.disasterNumber}:${countyFips}`;
    const observation = canonicalRadarObservationSchema.parse({
      schemaVersion: 1,
      sourceDefinitionId: context.sourceDefinitionId,
      providerEventId,
      providerRevision: `${record.lastRefresh}:${record.hash}`,
      sourceFamily: 'disaster',
      eventType: 'disaster_declaration',
      eventSubType: `${record.declarationType.toLowerCase()}_${normalizedToken(record.incidentType)}`,
      title: `${record.declarationTitle}: FEMA declaration for ${record.designatedArea}`.slice(0, 300),
      summary: summary(record),
      severity: severity(record),
      lifecycleStatus,
      effectiveAt: record.declarationDate,
      expiresAt,
      observedAt: context.observedAt,
      geography: stateScope
        ? {
            type: 'administrative_area',
            countryCode: 'US',
            level: 'state',
            name: record.state,
            code: record.state,
          }
        : {
            type: 'administrative_area',
            countryCode: 'US',
            level: 'county',
            name: record.designatedArea,
            code: countyFips,
          },
      canonicalUrl,
      deduplicationKeys: [
        providerEventId,
      ],
      rawPayload: {
        provider: 'FEMA OpenFEMA',
        dataset: 'DisasterDeclarationsSummaries-v2',
        disasterNumber: record.disasterNumber,
        declarationCode: record.declarationCode,
        declarationType: record.declarationType,
        declarationTitle: record.declarationTitle,
        incidentType: record.incidentType,
        declarationDate: record.declarationDate,
        incidentBeginDate: record.incidentBeginDate,
        incidentEndDate: record.incidentEndDate,
        disasterCloseoutDate: record.disasterCloseoutDate,
        lastRefresh: record.lastRefresh,
        state: record.state,
        fipsStateCode: record.fipsStateCode,
        fipsCountyCode: record.fipsCountyCode,
        designatedArea: record.designatedArea,
        assistance: {
          individual: record.individualAssistance,
          household: record.householdAssistance,
          public: record.publicAssistance,
          hazardMitigation: record.hazardMitigation,
        },
        response: record.rawPayload,
      },
    });
    radarObservationFingerprint(observation);
    return observation;
  },
};
