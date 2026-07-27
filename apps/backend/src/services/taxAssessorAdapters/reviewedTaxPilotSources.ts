import type {
  TaxAssessorDataSourceConfig,
} from './taxAssessmentTypes';

export type ReviewedTaxPilotSource = Omit<
  TaxAssessorDataSourceConfig,
  'id'
>;

/**
 * HER-604's first reviewed production-shaped source.
 *
 * The NYC Department of Finance dataset is citywide, but this pilot is
 * deliberately constrained to Bronx Tax Class 1 properties (`boro=2`) so the
 * monitored-property acceptance set stays homogeneous. The worker flag remains
 * off until an allowlisted Bronx property dry run succeeds.
 */
export const NYC_DOF_BRONX_TAX_CLASS_1_PILOT: ReviewedTaxPilotSource = {
  name: 'NYC DOF Bronx Tax Class 1 assessment roll',
  slug: 'nyc-dof-bronx-tax-class-1',
  status: 'ACTIVE',
  adapterType: 'SOCRATA',
  baseUrl: 'https://data.cityofnewyork.us',
  datasetId: '8y4t-faws',
  apiKeyEnvVar: null,
  coverageType: 'CITY',
  normalizedCoverageKey: 'US-NY-bronx',
  fieldMappingJson: {
    parid: 'externalId',
    curacttot: 'assessedValueRaw',
    pyacttot: 'previousAssessedValueRaw',
    year: 'taxYear',
    housenum_lo: 'situsHouseNumber',
    street_name: 'situsStreetName',
    zip_code: 'situsPostalCode',
  },
  queryFilterJson: {
    addressNumberColumn: 'housenum_lo',
    addressStreetColumn: 'street_name',
    postalCodeColumn: 'zip_code',
    parcelIdFromExternalId: true,
    latestTaxYearOnly: true,
    boro: '2',
    rectype: '1',
    curtaxclass: '1',
    eventTtlDays: 365,
    assessmentDatePolicy: 'nyc_fiscal_year_start',
    assessmentStage: 'current_roll',
    appealInfoUrl:
      'https://www.nyc.gov/site/finance/property/property-assessments.page',
    appealDisclaimer:
      'Assessment values are not sale prices. Filing windows and eligibility must be confirmed with NYC Department of Finance.',
  },
};

export const REVIEWED_TAX_PILOT_SOURCES: readonly ReviewedTaxPilotSource[] = [
  NYC_DOF_BRONX_TAX_CLASS_1_PILOT,
];

export function reviewedTaxPilotRuntimeConfig(
  source: ReviewedTaxPilotSource,
  id = `reviewed-tax-pilot:${source.slug}`,
): TaxAssessorDataSourceConfig {
  return { id, ...source };
}
