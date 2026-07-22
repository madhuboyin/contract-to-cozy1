// apps/workers/src/jobs/ingestTaxAssessmentEvents.job.ts
//
// Real property tax reassessment ingestion, via Socrata county open-data
// portals (apps/backend/src/services/taxAssessorAdapters/socrataTaxAdapter.ts).
// First real (non-QA-dummy) provider integration into the Home Event Radar
// unified ingestion layer -- see homeEventRadarMatcher.service.ts's
// promoteRadarEventToIncident for how high-impact events surface as
// Incidents + guidance journeys.
//
// Coverage is opt-in per jurisdiction: only properties whose city+state
// resolve to a configured, ACTIVE TaxAssessorDataSource row are fetched.
// Properties in unconfigured jurisdictions are silently skipped -- this is
// expected, not an error, until more counties are onboarded.

import { iterateAllProperties } from '../lib/paginateProperties';
import {
  taxAssessmentFetchService,
  PropertyForTaxFetch,
} from '@worker-shared/services/taxAssessmentFetch.service';
import { normalizeTaxAssessmentRecord } from '../radar/normalizeTaxAssessment';
import { upsertCanonicalRadarEvent } from '../radar/upsertCanonicalRadarEvent';
import { runMatchingForEvent } from '@worker-shared/services/homeEventRadarMatcher.service';
import { logger } from '../lib/logger';

async function loadPropertiesForTaxFetch(): Promise<PropertyForTaxFetch[]> {
  const properties: PropertyForTaxFetch[] = [];

  for await (const property of iterateAllProperties()) {
    if (!property.address || !property.city || !property.state || !property.zipCode) continue;
    properties.push({
      id: property.id,
      address: property.address,
      city: property.city,
      state: property.state,
      zipCode: property.zipCode,
    });
  }

  return properties;
}

export async function ingestTaxAssessmentEventsJob(): Promise<{
  jurisdictionsFetched: number;
  rawRecords: number;
  canonicalUpserts: number;
  matched: number;
  skipped: number;
}> {
  const properties = await loadPropertiesForTaxFetch();

  if (properties.length === 0) {
    logger.info('[TAX-ASSESSMENT-INGEST] No eligible properties found. Skipping.');
    return { jurisdictionsFetched: 0, rawRecords: 0, canonicalUpserts: 0, matched: 0, skipped: 0 };
  }

  const fetchResults = await taxAssessmentFetchService.fetchForProperties(properties);

  let rawRecords = 0;
  let canonicalUpserts = 0;
  let matched = 0;
  let skipped = 0;

  for (const { property, dataSource, records } of fetchResults) {
    rawRecords += records.length;

    for (const record of records) {
      try {
        const canonical = normalizeTaxAssessmentRecord(record, dataSource, property);
        const event = await upsertCanonicalRadarEvent(canonical);
        canonicalUpserts += 1;

        const matchResult = await runMatchingForEvent(event.id, [property.id]);
        matched += matchResult.matched;
        skipped += matchResult.skipped;
      } catch (err) {
        logger.error(
          { propertyId: property.id, externalId: record.externalId, err },
          '[TAX-ASSESSMENT-INGEST] Failed to process record',
        );
        skipped++;
      }
    }
  }

  const result = {
    jurisdictionsFetched: fetchResults.length,
    rawRecords,
    canonicalUpserts,
    matched,
    skipped,
  };

  logger.info({ data: result }, '[TAX-ASSESSMENT-INGEST] result');
  return result;
}
