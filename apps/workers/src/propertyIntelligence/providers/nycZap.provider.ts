import { z } from 'zod';
import type {
  IntelligenceProviderAdapter,
  NormalizedIntelligenceObservation,
} from '@worker-shared/propertyIntelligence/propertyIntelligence.contracts';
import {
  NYC_ZAP_COUNTY_TO_BOROUGH,
  NYC_ZAP_DATASET_URL,
  NYC_ZAP_OBSERVATION_TYPE,
  NYC_ZAP_SOURCE_KEY,
  type NycZapPilotConfig,
} from '@worker-shared/propertyIntelligence/pilots/nycZapPilot';

const NYC_ZAP_RESOURCE_URL =
  'https://data.cityofnewyork.us/resource/hgx4-8ukb.json';
const PAGE_SIZE = 1000;
const MAX_RECORDS = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;

const rawRecordSchema = z.object({
  project_id: z.string().trim().min(1),
  project_name: z.string().trim().optional(),
  project_brief: z.string().trim().optional(),
  project_status: z.string().trim().optional(),
  public_status: z.string().trim().optional(),
  ulurp_non: z.string().trim().optional(),
  actions: z.string().trim().optional(),
  ulurp_numbers: z.string().trim().optional(),
  ceqr_type: z.string().trim().optional(),
  ceqr_number: z.string().trim().optional(),
  borough: z.string().trim().min(1),
  community_district: z.string().trim().optional(),
  current_milestone: z.string().trim().optional(),
  current_milestone_date: z.string().trim().optional(),
  current_envmilestone: z.string().trim().optional(),
  current_envmilestone_date: z.string().trim().optional(),
  app_filed_date: z.string().trim().optional(),
  noticed_date: z.string().trim().optional(),
  certified_referred: z.string().trim().optional(),
  approval_date: z.string().trim().optional(),
  completed_date: z.string().trim().optional(),
  dcp_visibility: z.string().trim().optional(),
}).passthrough();

export type NycZapRawRecord = z.infer<typeof rawRecordSchema>;

type FetchLike = typeof fetch;

const BOROUGH_TO_COUNTY = new Map(
  Object.entries(NYC_ZAP_COUNTY_TO_BOROUGH).map(([county, borough]) => [
    borough.toUpperCase(),
    county,
  ]),
);

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function latestDate(...values: Array<string | undefined>): Date | null {
  return values
    .map(parseDate)
    .filter((value): value is Date => value != null)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

export function nycZapLifecycle(record: NycZapRawRecord):
  NormalizedIntelligenceObservation['lifecycleStatus'] {
  const status = (
    `${record.project_status ?? ''} ${record.public_status ?? ''} `
    + `${record.current_milestone ?? ''}`
  ).toLowerCase();
  if (/(withdraw|terminat|disapprov|cancel)/.test(status)) return 'CANCELLED';
  if (record.completed_date || /\bcompleted\b/.test(status)) return 'COMPLETED';
  if (record.approval_date || /\bapproved\b/.test(status)) return 'APPROVED';
  if (
    record.certified_referred
    || /\b(certified|referred|public review|commission|council)\b/.test(status)
  ) return 'ACTIVE';
  if (
    record.app_filed_date
    || record.noticed_date
    || /\b(filed|noticed|active)\b/.test(status)
  ) return 'PROPOSED';
  return 'UNKNOWN';
}

export function normalizeNycZapRecord(
  candidate: unknown,
  checkedAt: Date,
  allowedCounties: readonly string[],
): NormalizedIntelligenceObservation | null {
  const parsed = rawRecordSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const record = parsed.data;
  if (
    record.dcp_visibility
    && record.dcp_visibility.toLowerCase() !== 'general public'
  ) return null;
  const county = BOROUGH_TO_COUNTY.get(record.borough.toUpperCase());
  if (!county || !allowedCounties.includes(county)) return null;

  const milestoneAt = latestDate(
    record.current_milestone_date,
    record.current_envmilestone_date,
    record.completed_date,
    record.approval_date,
    record.certified_referred,
    record.noticed_date,
    record.app_filed_date,
  );
  const title = record.project_name || `NYC planning project ${record.project_id}`;
  const officialStatus = [
    record.public_status,
    record.project_status,
    record.current_milestone,
  ].filter(Boolean).join(' · ') || 'Status not supplied';

  return {
    externalId: record.project_id,
    observationType: NYC_ZAP_OBSERVATION_TYPE,
    lifecycleStatus: nycZapLifecycle(record),
    observedAt: milestoneAt,
    effectiveFrom: milestoneAt,
    effectiveTo: null,
    latitude: null,
    longitude: null,
    geographyType: 'COUNTY',
    geographyKey: county,
    geometryJson: null,
    matchRadiusMiles: null,
    sourceUrl: NYC_ZAP_DATASET_URL,
    sourcePublishedAt: milestoneAt,
    lastVerifiedAt: checkedAt,
    factualPayload: {
      title,
      summary:
        record.project_brief
        || 'NYC Planning published a land-use application lifecycle record.',
      officialStatus,
      projectType: record.actions || record.ulurp_non || 'Land-use application',
      borough: record.borough,
      county,
      communityDistrict: record.community_district ?? null,
      currentMilestone: record.current_milestone ?? null,
      environmentalMilestone: record.current_envmilestone ?? null,
      ulurpNumbers: record.ulurp_numbers ?? null,
      ceqrType: record.ceqr_type ?? null,
      ceqrNumber: record.ceqr_number ?? null,
      datasetId: 'hgx4-8ukb',
      geographicBoundary:
        'County/borough-level source context; no exact project distance is claimed.',
    },
  };
}

function quotedSoql(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function providerUrl(boroughs: readonly string[], offset: number) {
  const params = new URLSearchParams({
    $limit: String(PAGE_SIZE),
    $offset: String(offset),
    $order: 'project_id ASC',
    $where:
      `borough in (${boroughs.map(quotedSoql).join(',')})`
      + " AND (dcp_visibility='General Public' OR dcp_visibility is null)",
  });
  return `${NYC_ZAP_RESOURCE_URL}?${params.toString()}`;
}

export class NycZapProviderAdapter implements IntelligenceProviderAdapter {
  readonly sourceKey = NYC_ZAP_SOURCE_KEY;
  readonly adapterVersion = 'nyc-zap-v1';

  constructor(
    private readonly config: Pick<NycZapPilotConfig, 'counties'>,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly appToken = process.env.NYC_OPEN_DATA_APP_TOKEN?.trim(),
  ) {}

  async fetch(_input: {
    checkedAfter: Date | null;
    environment: string;
  }) {
    const checkedThrough = new Date();
    const boroughs = this.config.counties.map(
      (county) => NYC_ZAP_COUNTY_TO_BOROUGH[county],
    );
    const observations: NormalizedIntelligenceObservation[] = [];
    let offset = 0;

    while (offset < MAX_RECORDS) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await this.fetchImpl(providerUrl(boroughs, offset), {
          headers: {
            Accept: 'application/json',
            ...(this.appToken ? { 'X-App-Token': this.appToken } : {}),
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        throw new Error(
          `NYC ZAP provider returned ${response.status} ${response.statusText}`.trim(),
        );
      }
      const payload = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error('NYC ZAP provider returned a non-array response.');
      }
      for (const candidate of payload) {
        const normalized = normalizeNycZapRecord(
          candidate,
          checkedThrough,
          this.config.counties,
        );
        if (normalized) observations.push(normalized);
      }
      if (payload.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    if (offset >= MAX_RECORDS) {
      throw new Error(
        `NYC ZAP pilot exceeded the ${MAX_RECORDS}-record safety limit.`,
      );
    }
    return { checkedThrough, observations };
  }
}
