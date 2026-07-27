import { randomUUID } from 'node:crypto';
import {
  radarSourceRegistryService,
  resolveRadarRuntimeEnvironment,
} from '@worker-shared/modules/homeEventRadar/services/radarSourceRegistry.service';
import {
  radarSourceRunService,
} from '@worker-shared/modules/homeEventRadar/services/radarSourceRun.service';
import {
  radarIngestQueueService,
} from '@worker-shared/modules/homeEventRadar/queues/radarIngest.queue';
import type {
  RadarSourceRegistrationInput,
} from '@worker-shared/modules/homeEventRadar/contracts';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import { iterateAllProperties } from '../lib/paginateProperties';
import { logger, type AppLogger } from '../lib/logger';
import {
  OPEN_FEMA_RELEVANCE_DAYS,
  isOpenFemaStatewide,
  openFemaCountyFips,
  openFemaDeclarationRadarAdapter,
  type OpenFemaDeclaration,
} from '../radar/openFemaDeclarationRadarAdapter';

export const OPEN_FEMA_SOURCE_KEY = 'openfema-declarations';
export const OPEN_FEMA_ADAPTER_VERSION = 'openfema-declarations-v2';

const DEFAULT_ENDPOINT =
  'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries';
const PAGE_SIZE = 1_000;
const REQUEST_TIMEOUT_MS = 10_000;

type PropertyRow = {
  id: string;
  state?: string | null;
  countyFips?: string | null;
};

type StateFetchResult = {
  status: 'ok' | 'failed';
  records: OpenFemaDeclaration[];
  rejected: number;
  ignored: number;
  pages: number;
  runDate?: string;
  error?: string;
};

type OpenFemaDeps = {
  registry: Pick<typeof radarSourceRegistryService, 'register'>;
  runs: Pick<typeof radarSourceRunService, 'begin' | 'complete'>;
  ingestQueue: Pick<typeof radarIngestQueueService, 'enqueue'>;
  iterateAllProperties: typeof iterateAllProperties;
  fetchState(state: string, cutoff: Date, env: NodeJS.ProcessEnv): Promise<StateFetchResult>;
  logger: AppLogger;
  now(): Date;
  correlationId(): string;
  sleep(ms: number): Promise<void>;
  env: NodeJS.ProcessEnv;
};

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function boolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function optionalTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return isoTimestamp(value);
}

function declarationType(value: unknown): OpenFemaDeclaration['declarationType'] | null {
  return value === 'DR' || value === 'EM' || value === 'FM' || value === 'FS'
    ? value
    : null;
}

function parseDeclaration(input: unknown): OpenFemaDeclaration | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const disasterNumber = Number(record.disasterNumber);
  const parsedType = declarationType(record.declarationType);
  const declarationDate = isoTimestamp(record.declarationDate);
  const incidentBeginDate = isoTimestamp(record.incidentBeginDate);
  const lastRefresh = isoTimestamp(record.lastRefresh);
  const fipsStateCode = text(record, 'fipsStateCode');
  const fipsCountyCode = text(record, 'fipsCountyCode');
  if (
    !Number.isInteger(disasterNumber)
    || disasterNumber <= 0
    || !parsedType
    || !declarationDate
    || !incidentBeginDate
    || !lastRefresh
    || !/^\d{2}$/.test(fipsStateCode)
    || !/^\d{3}$/.test(fipsCountyCode)
  ) return null;
  const parsed: OpenFemaDeclaration = {
    id: text(record, 'id'),
    hash: text(record, 'hash'),
    disasterNumber,
    declarationCode: text(record, 'femaDeclarationString'),
    state: text(record, 'state').toUpperCase(),
    declarationType: parsedType,
    declarationTitle: text(record, 'declarationTitle'),
    incidentType: text(record, 'incidentType'),
    declarationDate,
    incidentBeginDate,
    incidentEndDate: optionalTimestamp(record.incidentEndDate),
    disasterCloseoutDate: optionalTimestamp(record.disasterCloseoutDate),
    lastRefresh,
    fipsStateCode,
    fipsCountyCode,
    designatedArea: text(record, 'designatedArea'),
    individualAssistance: boolean(record, 'iaProgramDeclared'),
    householdAssistance: boolean(record, 'ihProgramDeclared'),
    publicAssistance: boolean(record, 'paProgramDeclared'),
    hazardMitigation: boolean(record, 'hmProgramDeclared'),
    rawPayload: input,
  };
  return parsed.id
    && parsed.hash
    && /^[A-Z]{2}$/.test(parsed.state)
    && parsed.declarationTitle
    && parsed.incidentType
    && parsed.designatedArea
    ? parsed
    : null;
}

export function parseOpenFemaPayload(payload: unknown): {
  valid: boolean;
  records: OpenFemaDeclaration[];
  rejected: number;
  ignored: number;
  runDate?: string;
} {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, records: [], rejected: 0, ignored: 0 };
  }
  const envelope = payload as Record<string, unknown>;
  const rawRecords = envelope.DisasterDeclarationsSummaries;
  if (!Array.isArray(rawRecords)) {
    return { valid: false, records: [], rejected: 0, ignored: 0 };
  }
  const records: OpenFemaDeclaration[] = [];
  let rejected = 0;
  let ignored = 0;
  for (const rawRecord of rawRecords) {
    const record = parseDeclaration(rawRecord);
    if (!record) {
      rejected += 1;
      continue;
    }
    // County code 000 is also used for tribes and reservations. Only the
    // provider's literal Statewide designation may safely broaden to state.
    if (record.fipsCountyCode === '000' && !isOpenFemaStatewide(record)) {
      ignored += 1;
      continue;
    }
    records.push(record);
  }
  const metadata = envelope.metadata;
  const runDate = metadata && typeof metadata === 'object'
    ? isoTimestamp((metadata as Record<string, unknown>).rundate) ?? undefined
    : undefined;
  return { valid: true, records, rejected, ignored, runDate };
}

async function fetchPage(
  endpoint: string,
  state: string,
  cutoff: Date,
  skip: number,
): Promise<{ parsed?: ReturnType<typeof parseOpenFemaPayload>; error?: string }> {
  const url = new URL(endpoint);
  url.searchParams.set('$top', String(PAGE_SIZE));
  url.searchParams.set('$skip', String(skip));
  url.searchParams.set('$orderby', 'declarationDate desc');
  url.searchParams.set(
    '$filter',
    `state eq '${state}' and declarationDate ge '${cutoff.toISOString()}'`,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ContractToCozy-HomeEventRadar/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) return { error: `OpenFEMA HTTP ${response.status}` };
    const contentType = response.headers.get('content-type') ?? '';
    if (!/json/i.test(contentType)) return { error: 'OpenFEMA returned a non-JSON response' };
    const parsed = parseOpenFemaPayload(await response.json());
    return parsed.valid
      ? { parsed }
      : { error: 'OpenFEMA returned an invalid DisasterDeclarationsSummaries envelope' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchOpenFemaState(
  state: string,
  cutoff: Date,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StateFetchResult> {
  if (!/^[A-Z]{2}$/.test(state)) {
    return {
      status: 'failed',
      records: [],
      rejected: 0,
      ignored: 0,
      pages: 0,
      error: `Invalid state code ${state}`,
    };
  }
  const endpoint = env.OPEN_FEMA_DECLARATIONS_URL?.trim() || DEFAULT_ENDPOINT;
  const records: OpenFemaDeclaration[] = [];
  let rejected = 0;
  let ignored = 0;
  let pages = 0;
  let runDate: string | undefined;
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await fetchPage(endpoint, state, cutoff, skip);
    if (!page.parsed) {
      return {
        status: 'failed',
        records,
        rejected,
        ignored,
        pages,
        runDate,
        error: page.error ?? 'OpenFEMA request failed',
      };
    }
    pages += 1;
    records.push(...page.parsed.records);
    rejected += page.parsed.rejected;
    ignored += page.parsed.ignored;
    runDate = page.parsed.runDate ?? runDate;
    const providerRows = page.parsed.records.length
      + page.parsed.rejected
      + page.parsed.ignored;
    if (providerRows < PAGE_SIZE) break;
  }
  return { status: 'ok', records, rejected, ignored, pages, runDate };
}

export function openFemaSourceRegistration(env: NodeJS.ProcessEnv): RadarSourceRegistrationInput {
  return {
    key: OPEN_FEMA_SOURCE_KEY,
    family: 'disaster',
    sourceType: 'disaster_provider',
    name: 'OpenFEMA disaster declarations',
    provider: 'FEMA OpenFEMA',
    adapterVersion: OPEN_FEMA_ADAPTER_VERSION,
    contractVersion: 1,
    isEnabled: true,
    environments: [resolveRadarRuntimeEnvironment(env)],
    scheduleCron: '17 */6 * * *',
    freshnessSeconds: 12 * 60 * 60,
    supportedEventTypes: ['disaster_declaration'],
    coverageDescription:
      'United States county/state disaster designations matched by canonical state and county FIPS',
    configJson: {
      endpoint: env.OPEN_FEMA_DECLARATIONS_URL?.trim() || DEFAULT_ENDPOINT,
      dataset: 'DisasterDeclarationsSummaries',
      datasetVersion: 'v2',
      relevanceDays: OPEN_FEMA_RELEVANCE_DAYS,
      pageSize: PAGE_SIZE,
      geographyPolicy: 'exact-county-fips-or-literal-statewide-v1',
      copyPolicy: 'recovery-context-not-hazard-alert-v1',
    },
    coverage: [{ coverageType: 'country', countryCode: 'US' }],
  };
}

const defaultDeps: OpenFemaDeps = {
  registry: radarSourceRegistryService,
  runs: radarSourceRunService,
  ingestQueue: radarIngestQueueService,
  iterateAllProperties,
  fetchState: fetchOpenFemaState,
  logger,
  now: () => new Date(),
  correlationId: randomUUID,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  env: process.env,
};

export async function openFemaDeclarationsJob(
  opts?: { dryRun?: boolean; propertyId?: string },
  deps: OpenFemaDeps = defaultDeps,
) {
  const dryRun = opts?.dryRun === true;
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[OpenFemaDeclarations] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const startedAt = deps.now();
  const cutoff = new Date(startedAt.getTime() - OPEN_FEMA_RELEVANCE_DAYS * 86_400_000);
  const smokeCorrelationId = opts?.propertyId
    ? generateSmokeCorrelationId('openfema-declarations')
    : undefined;
  const source = dryRun
    ? { id: 'openfema-dry-run', key: OPEN_FEMA_SOURCE_KEY }
    : await deps.registry.register(openFemaSourceRegistration(deps.env));
  const correlationId = smokeCorrelationId ?? `openfema:${deps.correlationId()}`;
  const begun = dryRun
    ? { runnable: true, reason: 'dry run', run: { id: 'openfema-dry-run' } }
    : await deps.runs.begin({
        sourceKey: source.key,
        correlationId,
        triggerType: 'scheduled',
        startedAt,
        metadataJson: {
          provider: 'openfema',
          cutoff: cutoff.toISOString(),
          ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
          ...(smokeCorrelationId ? { smokeCorrelationId } : {}),
        },
      }, deps.env);
  if (!begun.runnable) {
    return {
      createdOrUpdated: 0,
      failed: 0,
      queued: 0,
      sourceRunStatus: 'skipped',
      smokeCorrelationId,
    };
  }

  const propertiesByState = new Map<string, Set<string>>();
  let propertiesEvaluated = 0;
  for await (const property of deps.iterateAllProperties()) {
    const candidate = property as PropertyRow;
    if (opts?.propertyId && candidate.id !== opts.propertyId) continue;
    const state = candidate.state?.trim().toUpperCase() ?? '';
    if (!/^[A-Z]{2}$/.test(state)) continue;
    const countyFips = candidate.countyFips?.trim() ?? '';
    const counties = propertiesByState.get(state) ?? new Set<string>();
    if (/^\d{5}$/.test(countyFips)) counties.add(countyFips);
    propertiesByState.set(state, counties);
    propertiesEvaluated += 1;
  }

  const matched = new Map<string, OpenFemaDeclaration>();
  let statesSucceeded = 0;
  let statesFailed = 0;
  let pagesFetched = 0;
  let providerRejected = 0;
  let providerIgnored = 0;
  let freshestRunDate: Date | undefined;
  for (const [state, countyFips] of propertiesByState) {
    const result = await deps.fetchState(state, cutoff, deps.env);
    pagesFetched += result.pages;
    providerRejected += result.rejected;
    providerIgnored += result.ignored;
    if (result.status === 'failed') {
      statesFailed += 1;
      deps.logger.warn(
        { state, error: result.error },
        '[OpenFemaDeclarations] State declaration fetch failed',
      );
      continue;
    }
    statesSucceeded += 1;
    if (result.runDate) {
      const parsedRunDate = new Date(result.runDate);
      if (!freshestRunDate || parsedRunDate.getTime() < freshestRunDate.getTime()) {
        // Source freshness is bounded by the oldest successful state page.
        freshestRunDate = parsedRunDate;
      }
    }
    for (const record of result.records) {
      const fullCountyFips = openFemaCountyFips(record);
      const matches = isOpenFemaStatewide(record)
        || (fullCountyFips !== null && countyFips.has(fullCountyFips));
      if (matches) {
        const key = `openfema:${record.disasterNumber}:${fullCountyFips}`;
        const existing = matched.get(key);
        if (
          !existing
          || new Date(record.lastRefresh).getTime() > new Date(existing.lastRefresh).getTime()
        ) {
          matched.set(key, record);
        }
      }
    }
    await deps.sleep(100);
  }

  let createdOrUpdated = 0;
  let normalizationRejected = 0;
  for (const record of matched.values()) {
    try {
      const observation = await openFemaDeclarationRadarAdapter.normalize(record, {
        sourceDefinitionId: source.id,
        observedAt: startedAt.toISOString(),
      });
      if (!dryRun) {
        await deps.ingestQueue.enqueue({
          observation,
          sourceRunId: begun.run.id,
          correlationId,
          enqueuedAt: deps.now().toISOString(),
          smokeCorrelationId,
        });
      }
      createdOrUpdated += 1;
    } catch (error) {
      normalizationRejected += 1;
      deps.logger.error(
        { err: error, providerRecordId: record.id },
        '[OpenFemaDeclarations] Canonical observation rejected',
      );
    }
  }
  const observationsRejected = providerRejected + normalizationRejected;

  let sourceRunStatus: 'success' | 'successful_empty' | 'partial' | 'failed' | 'skipped';
  if (propertiesEvaluated === 0) sourceRunStatus = 'skipped';
  else if (statesSucceeded === 0) sourceRunStatus = 'failed';
  else if (matched.size > 0 && normalizationRejected >= matched.size) sourceRunStatus = 'failed';
  else if (statesFailed > 0 || observationsRejected > 0) sourceRunStatus = 'partial';
  else if (matched.size === 0) sourceRunStatus = 'successful_empty';
  else sourceRunStatus = 'success';

  if (!dryRun) {
    const errorMessage = sourceRunStatus === 'failed'
      ? statesSucceeded === 0
        ? `All ${statesFailed} OpenFEMA state requests failed`
        : 'All matched OpenFEMA observations were rejected'
      : sourceRunStatus === 'partial'
        ? `${statesFailed} state request(s) failed and ${observationsRejected} record(s) were rejected`
        : sourceRunStatus === 'skipped'
          ? 'No properties with usable state geography were evaluated'
          : undefined;
    await deps.runs.complete(begun.run.id, {
      status: sourceRunStatus,
      finishedAt: deps.now(),
      dataFreshThrough: statesSucceeded > 0 ? freshestRunDate ?? startedAt : undefined,
      observationsReceived: matched.size,
      observationsRejected,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsResolved: 0,
      propertiesEvaluated,
      errorCode: errorMessage
        ? sourceRunStatus === 'failed'
          ? statesSucceeded === 0 ? 'OPEN_FEMA_FETCH_FAILED' : 'OPEN_FEMA_OBSERVATIONS_REJECTED'
          : sourceRunStatus === 'partial' ? 'OPEN_FEMA_PARTIAL' : 'NO_PROPERTY_STATES'
        : undefined,
      errorMessage,
      metadataJson: {
        provider: 'openfema',
        statesQueried: propertiesByState.size,
        statesSucceeded,
        statesFailed,
        pagesFetched,
        matchedDeclarations: matched.size,
        providerRejected,
        providerIgnored,
        observationsQueued: createdOrUpdated,
        relevanceDays: OPEN_FEMA_RELEVANCE_DAYS,
      },
    });
  }

  return {
    createdOrUpdated,
    failed: statesFailed + observationsRejected,
    queued: dryRun ? 0 : createdOrUpdated,
    sourceRunStatus: dryRun ? 'dry_run' : sourceRunStatus,
    propertiesEvaluated,
    statesQueried: propertiesByState.size,
    statesSucceeded,
    statesFailed,
    pagesFetched,
    matchedDeclarations: matched.size,
    rejected: observationsRejected,
    ignored: providerIgnored,
    smokeCorrelationId,
  };
}
