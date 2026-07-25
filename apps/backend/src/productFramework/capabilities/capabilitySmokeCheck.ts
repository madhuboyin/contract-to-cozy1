import { z } from 'zod';
import {
  CapabilityCatalogSchema,
  type CapabilityCatalog,
} from './capabilityCatalog.service';
import {
  CapabilitySuggestionResponseSchema,
  type CapabilitySuggestionResponse,
} from './capabilityExplanationBuilder';
import type { ToolCapabilityRegistry } from './capabilityRegistry';

const CapabilityIdSchema = z.string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);

export const CapabilitySmokeScenarioSchema = z.object({
  name: z.string().trim().min(1).max(120),
  propertyId: z.string().trim().min(1).max(120),
  expectedCapabilityIds: z.array(CapabilityIdSchema).default([]),
  forbiddenCapabilityIds: z.array(CapabilityIdSchema).default([]),
  minimumHomeSuggestions: z.number().int().min(0).max(3).default(0),
  minimumPropertySuggestions: z.number().int().min(0).max(3).default(0),
}).strict().superRefine((scenario, ctx) => {
  const forbidden = new Set(scenario.forbiddenCapabilityIds);
  for (const capabilityId of scenario.expectedCapabilityIds) {
    if (forbidden.has(capabilityId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['expectedCapabilityIds'],
        message: `${capabilityId} cannot be both expected and forbidden.`,
      });
    }
  }
});

export const CapabilitySmokeConfigSchema = z.object({
  contractVersion: z.literal('capability-smoke-v1'),
  unauthorizedPropertyId: z.string().trim().min(1).max(120),
  requireRealUserLaunchMode: z.boolean().default(true),
  requireReleaseReady: z.boolean().default(true),
  scenarios: z.array(CapabilitySmokeScenarioSchema).min(3).max(20),
}).strict().superRefine((config, ctx) => {
  const names = new Set<string>();
  const propertyIds = new Set<string>();
  config.scenarios.forEach((scenario, index) => {
    if (names.has(scenario.name)) {
      ctx.addIssue({
        code: 'custom',
        path: ['scenarios', index, 'name'],
        message: 'Scenario names must be unique.',
      });
    }
    if (propertyIds.has(scenario.propertyId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['scenarios', index, 'propertyId'],
        message: 'Representative property IDs must be unique.',
      });
    }
    if (scenario.propertyId === config.unauthorizedPropertyId) {
      ctx.addIssue({
        code: 'custom',
        path: ['unauthorizedPropertyId'],
        message: 'The unauthorized property cannot be a representative property.',
      });
    }
    names.add(scenario.name);
    propertyIds.add(scenario.propertyId);
  });
});

export type CapabilitySmokeConfig = z.infer<typeof CapabilitySmokeConfigSchema>;
export type CapabilitySmokeScenario =
  z.infer<typeof CapabilitySmokeScenarioSchema>;

const AvailabilityEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.object({
    releaseMode: z.enum(['INTERNAL_BETA', 'REAL_USER_LAUNCH']),
    releaseReady: z.boolean(),
    releaseBlockers: z.array(z.string()),
    registryVersion: z.string().trim().min(1),
    configurationValid: z.boolean(),
    rolloutKeyParity: z.object({
      valid: z.boolean(),
      missingKeys: z.array(z.string()),
      unknownKeys: z.array(z.string()),
    }),
  }).passthrough(),
});

const CatalogEnvelopeSchema = z.object({
  success: z.literal(true),
  data: CapabilityCatalogSchema,
});

const SuggestionEnvelopeSchema = z.object({
  success: z.literal(true),
  data: CapabilitySuggestionResponseSchema,
});

export type CapabilitySmokeFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface CapabilitySmokeScenarioReport {
  name: string;
  propertyId: string;
  catalogCapabilityCount: number;
  homeSuggestionCount: number;
  propertySuggestionCount: number;
  observedCapabilityIds: string[];
}

export interface CapabilitySmokeReport {
  contractVersion: 'capability-smoke-report-v1';
  status: 'PASS';
  baseUrl: string;
  registryVersion: string;
  checkedAt: string;
  smokeCorrelationId: string;
  requestCount: number;
  unauthorizedPropertyProbe: 'PASS';
  scenarios: CapabilitySmokeScenarioReport[];
}

function smokeBaseUrl(value: string): URL {
  const url = new URL(value);
  const isLocal =
    url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || url.hostname === '::1';
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
    throw new Error(
      'Capability smoke base URL must use HTTPS, except for localhost.',
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      'Capability smoke base URL cannot contain credentials, query, or fragment.',
    );
  }
  return url;
}

function endpoint(baseUrl: URL, path: string): URL {
  return new URL(path, `${baseUrl.toString().replace(/\/+$/, '')}/`);
}

function privateCacheHeader(response: Response, requireNoStore: boolean): void {
  const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? '';
  if (!cacheControl.includes('private')) {
    throw new Error('Capability response is missing private cache control.');
  }
  if (requireNoStore && !cacheControl.includes('no-store')) {
    throw new Error('Capability suggestion response is missing no-store cache control.');
  }
  const vary = response.headers.get('vary')?.toLowerCase() ?? '';
  if (!vary.includes('authorization') || !vary.includes('cookie')) {
    throw new Error(
      'Capability response must vary by Authorization and Cookie.',
    );
  }
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(
      `Capability smoke endpoint returned non-JSON content (${response.status}).`,
    );
  }
}

async function authenticatedGet(input: {
  baseUrl: URL;
  token: string;
  path: string;
  fetcher: CapabilitySmokeFetch;
  expectedStatus?: number;
  requirePrivateCache?: boolean;
  requireNoStore?: boolean;
  smokeCorrelationId: string;
}): Promise<{ response: Response; body: unknown }> {
  const response = await input.fetcher(endpoint(input.baseUrl, input.path), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${input.token}`,
      'X-Capability-Smoke-Run': input.smokeCorrelationId,
    },
    redirect: 'error',
  });
  const expectedStatus = input.expectedStatus ?? 200;
  if (response.status !== expectedStatus) {
    throw new Error(
      `Capability smoke GET ${input.path} returned ${response.status}; expected ${expectedStatus}.`,
    );
  }
  if (input.requirePrivateCache) {
    privateCacheHeader(response, input.requireNoStore ?? false);
  }
  return { response, body: await responseBody(response) };
}

function canonicalCatalog(input: {
  catalog: CapabilityCatalog;
  propertyId: string;
  registry: ToolCapabilityRegistry;
  expectedRegistryVersion: string;
}): Map<string, number> {
  if (input.catalog.propertyId !== input.propertyId) {
    throw new Error(
      `Catalog property mismatch for ${input.propertyId}.`,
    );
  }
  if (input.catalog.registryVersion !== input.expectedRegistryVersion) {
    throw new Error(
      `Catalog registry version mismatch for ${input.propertyId}.`,
    );
  }
  if (input.catalog.workflowContextIncluded) {
    throw new Error('Representative homeowner catalog included workflow-only context.');
  }
  const versions = new Map<string, number>();
  for (const item of input.catalog.capabilities) {
    const definition = input.registry.getById(item.id);
    if (!definition || definition.version !== item.version) {
      throw new Error(`Catalog contains a stale or unknown capability: ${item.id}.`);
    }
    if (item.workflowOnly) {
      throw new Error(`Catalog exposed workflow-only capability: ${item.id}.`);
    }
    if (versions.has(item.id)) {
      throw new Error(`Catalog contains duplicate capability: ${item.id}.`);
    }
    versions.set(item.id, item.version);
  }
  return versions;
}

function validateSuggestions(input: {
  response: CapabilitySuggestionResponse;
  surface: 'HOME' | 'PROPERTY';
  propertyId: string;
  catalogVersions: ReadonlyMap<string, number>;
  registry: ToolCapabilityRegistry;
  registryVersion: string;
}): string[] {
  if (input.response.surface !== input.surface) {
    throw new Error(
      `${input.surface} smoke response returned ${input.response.surface}.`,
    );
  }
  if (input.response.registryVersion !== input.registryVersion) {
    throw new Error(
      `${input.surface} registry version differs from availability.`,
    );
  }
  const ids: string[] = [];
  const suggestionIds = new Set<string>();
  for (const suggestion of input.response.suggestions) {
    const definition = input.registry.getById(suggestion.capabilityId);
    if (
      !definition
      || definition.version !== suggestion.manifestVersion
      || input.catalogVersions.get(suggestion.capabilityId)
        !== suggestion.manifestVersion
    ) {
      throw new Error(
        `${input.surface} returned stale, unknown, or unavailable capability: ${suggestion.capabilityId}.`,
      );
    }
    if (suggestion.contextVersion !== input.response.contextVersion) {
      throw new Error(
        `${input.surface} returned mixed context versions for ${suggestion.capabilityId}.`,
      );
    }
    if (suggestionIds.has(suggestion.suggestionId)) {
      throw new Error(
        `${input.surface} returned duplicate suggestion ${suggestion.suggestionId}.`,
      );
    }
    const expectedRank = ids.length + 1;
    if (suggestion.rank !== expectedRank) {
      throw new Error(
        `${input.surface} suggestion ranks are not contiguous from one.`,
      );
    }
    if (definition.destination.routeTemplate.includes('[id]')) {
      const propertySegment = encodeURIComponent(input.propertyId);
      if (!suggestion.launch.href.includes(`/${propertySegment}/`)) {
        throw new Error(
          `${input.surface} launch path lost property context for ${suggestion.capabilityId}.`,
        );
      }
    }
    suggestionIds.add(suggestion.suggestionId);
    ids.push(suggestion.capabilityId);
  }
  return ids;
}

function assertScenarioExpectations(input: {
  scenario: CapabilitySmokeScenario;
  homeIds: readonly string[];
  propertyIds: readonly string[];
}): string[] {
  if (input.homeIds.length < input.scenario.minimumHomeSuggestions) {
    throw new Error(
      `${input.scenario.name} returned fewer HOME suggestions than required.`,
    );
  }
  if (input.propertyIds.length < input.scenario.minimumPropertySuggestions) {
    throw new Error(
      `${input.scenario.name} returned fewer PROPERTY suggestions than required.`,
    );
  }
  const observed = new Set([...input.homeIds, ...input.propertyIds]);
  for (const capabilityId of input.scenario.expectedCapabilityIds) {
    if (!observed.has(capabilityId)) {
      throw new Error(
        `${input.scenario.name} did not surface expected capability ${capabilityId}.`,
      );
    }
  }
  for (const capabilityId of input.scenario.forbiddenCapabilityIds) {
    if (observed.has(capabilityId)) {
      throw new Error(
        `${input.scenario.name} surfaced forbidden capability ${capabilityId}.`,
      );
    }
  }
  return [...observed].sort();
}

export async function runCapabilitySmokeCheck(input: {
  baseUrl: string;
  token: string;
  config: CapabilitySmokeConfig;
  registry: ToolCapabilityRegistry;
  fetcher?: CapabilitySmokeFetch;
  now?: () => Date;
}): Promise<CapabilitySmokeReport> {
  const config = CapabilitySmokeConfigSchema.parse(input.config);
  const baseUrl = smokeBaseUrl(input.baseUrl);
  const token = input.token.trim();
  if (!token) throw new Error('Capability smoke bearer token is required.');
  for (const scenario of config.scenarios) {
    for (const capabilityId of [
      ...scenario.expectedCapabilityIds,
      ...scenario.forbiddenCapabilityIds,
    ]) {
      if (!input.registry.getById(capabilityId)) {
        throw new Error(
          `${scenario.name} references unknown capability ${capabilityId}.`,
        );
      }
    }
  }
  const fetcher = input.fetcher ?? fetch;
  const checkedAt = (input.now ?? (() => new Date()))();
  const smokeCorrelationId =
    `capability-smoke:${checkedAt.toISOString().replace(/[^a-zA-Z0-9._:-]/g, '-')}`;
  let requestCount = 0;
  const get = async (
    request: Omit<
      Parameters<typeof authenticatedGet>[0],
      'baseUrl' | 'token' | 'fetcher' | 'smokeCorrelationId'
    >,
  ) => {
    requestCount += 1;
    return authenticatedGet({
      ...request,
      baseUrl,
      token,
      fetcher,
      smokeCorrelationId,
    });
  };

  const availabilityResult = await get({
    path: '/api/tool-discovery/availability',
  });
  const availability = AvailabilityEnvelopeSchema.parse(
    availabilityResult.body,
  ).data;
  if (availability.registryVersion !== input.registry.version) {
    throw new Error(
      'Deployed capability registry version differs from the smoke runner.',
    );
  }
  if (!availability.configurationValid || !availability.rolloutKeyParity.valid) {
    throw new Error('Capability discovery configuration or rollout parity is invalid.');
  }
  if (
    config.requireRealUserLaunchMode
    && availability.releaseMode !== 'REAL_USER_LAUNCH'
  ) {
    throw new Error('Capability discovery is not in real-user launch mode.');
  }
  if (config.requireReleaseReady && !availability.releaseReady) {
    throw new Error(
      `Capability release controls are blocked: ${availability.releaseBlockers.join(', ') || 'UNKNOWN'}.`,
    );
  }

  const reports: CapabilitySmokeScenarioReport[] = [];
  for (const scenario of config.scenarios) {
    const propertyId = encodeURIComponent(scenario.propertyId);
    const catalogResult = await get({
      path: `/api/tool-capabilities?propertyId=${propertyId}`,
      requirePrivateCache: true,
    });
    const catalog = CatalogEnvelopeSchema.parse(catalogResult.body).data;
    const catalogVersions = canonicalCatalog({
      catalog,
      propertyId: scenario.propertyId,
      registry: input.registry,
      expectedRegistryVersion: availability.registryVersion,
    });

    const homeResult = await get({
      path: `/api/properties/${propertyId}/capability-suggestions?surface=HOME&limit=3`,
      requirePrivateCache: true,
      requireNoStore: true,
    });
    const homeResponse = SuggestionEnvelopeSchema.parse(homeResult.body).data;
    const homeIds = validateSuggestions({
      response: homeResponse,
      surface: 'HOME',
      propertyId: scenario.propertyId,
      catalogVersions,
      registry: input.registry,
      registryVersion: availability.registryVersion,
    });

    const propertyResult = await get({
      path: `/api/properties/${propertyId}/capability-suggestions?surface=PROPERTY&limit=3`,
      requirePrivateCache: true,
      requireNoStore: true,
    });
    const propertyResponse =
      SuggestionEnvelopeSchema.parse(propertyResult.body).data;
    const propertyIds = validateSuggestions({
      response: propertyResponse,
      surface: 'PROPERTY',
      propertyId: scenario.propertyId,
      catalogVersions,
      registry: input.registry,
      registryVersion: availability.registryVersion,
    });

    reports.push({
      name: scenario.name,
      propertyId: scenario.propertyId,
      catalogCapabilityCount: catalog.capabilities.length,
      homeSuggestionCount: homeIds.length,
      propertySuggestionCount: propertyIds.length,
      observedCapabilityIds: assertScenarioExpectations({
        scenario,
        homeIds,
        propertyIds,
      }),
    });
  }

  const unauthorizedId = encodeURIComponent(config.unauthorizedPropertyId);
  await get({
    path: `/api/tool-capabilities?propertyId=${unauthorizedId}`,
    expectedStatus: 404,
  });
  await get({
    path: `/api/properties/${unauthorizedId}/capability-suggestions?surface=HOME&limit=3`,
    expectedStatus: 404,
  });

  return {
    contractVersion: 'capability-smoke-report-v1',
    status: 'PASS',
    baseUrl: baseUrl.origin,
    registryVersion: availability.registryVersion,
    checkedAt: checkedAt.toISOString(),
    smokeCorrelationId,
    requestCount,
    unauthorizedPropertyProbe: 'PASS',
    scenarios: reports,
  };
}
