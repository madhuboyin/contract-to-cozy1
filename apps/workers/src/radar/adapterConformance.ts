import { isIP } from 'node:net';
import {
  canonicalRadarObservationSchema,
  normalizedGeographySchema,
  type CanonicalRadarObservation,
} from '@worker-shared/modules/homeEventRadar/contracts';
import {
  radarObservationFingerprint,
  radarRevisionIdentity,
} from '@worker-shared/modules/homeEventRadar/domain/radarObservationIdentity';

export type RadarSourceAdapter<Raw, Context> = {
  normalize(raw: Raw, context: Context): CanonicalRadarObservation | Promise<CanonicalRadarObservation>;
};

type AdapterCase<Raw, Context> = {
  name: string;
  raw: Raw;
  context: Context;
};

export type RadarAdapterConformanceDefinition<Raw, Context> = {
  adapterName: string;
  adapter: RadarSourceAdapter<Raw, Context>;
  validCase: AdapterCase<Raw, Context>;
  revisionCase: {
    initial: AdapterCase<Raw, Context>;
    revised: AdapterCase<Raw, Context>;
  };
  resolutionCase: AdapterCase<Raw, Context>;
  supersessionCase: AdapterCase<Raw, Context> & {
    expectedStatus: 'updated' | 'retracted';
  };
  invalidCases: Array<AdapterCase<Raw, Context>>;
  allowedCanonicalUrlHosts: string[];
};

export type RadarAdapterConformanceReport = {
  adapterName: string;
  checks: string[];
};

export class RadarAdapterConformanceError extends Error {
  constructor(
    readonly adapterName: string,
    readonly failures: string[],
  ) {
    super(`${adapterName} failed Radar adapter conformance:\n- ${failures.join('\n- ')}`);
    this.name = 'RadarAdapterConformanceError';
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = octets;
  return a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
}

export function isSafeRadarCanonicalUrl(value: string, allowedHosts: readonly string[]): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
      .replace(/\.$/, '');
    const allowlist = new Set(allowedHosts.map((host) => host.toLowerCase().replace(/\.$/, '')));
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port !== '' && url.port !== '443')
    ) return false;
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
    const ipVersion = isIP(hostname);
    if (ipVersion === 4 && isPrivateIpv4(hostname)) return false;
    if (ipVersion === 6) {
      const normalized = hostname;
      if (
        normalized === '::1' ||
        normalized === '::' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        /^fe[89ab]/.test(normalized)
      ) return false;
    }
    return allowlist.has(hostname);
  } catch {
    return false;
  }
}

function assertUtcTimestamp(value: string | null | undefined, field: string): void {
  if (value == null) return;
  if (new Date(value).toISOString() !== value) {
    throw new Error(`${field} must be normalized to UTC ISO-8601`);
  }
}

async function normalizeValid<Raw, Context>(
  adapter: RadarSourceAdapter<Raw, Context>,
  testCase: AdapterCase<Raw, Context>,
  allowedHosts: readonly string[],
): Promise<CanonicalRadarObservation> {
  const observation = canonicalRadarObservationSchema.parse(
    await adapter.normalize(testCase.raw, testCase.context),
  );
  assertUtcTimestamp(observation.effectiveAt, 'effectiveAt');
  assertUtcTimestamp(observation.expiresAt, 'expiresAt');
  assertUtcTimestamp(observation.observedAt, 'observedAt');
  normalizedGeographySchema.parse(observation.geography);
  // Fingerprinting also proves that raw evidence is deterministic JSON rather
  // than a circular, BigInt, function, or otherwise non-persistable payload.
  radarObservationFingerprint(observation);
  if (
    observation.canonicalUrl &&
    !isSafeRadarCanonicalUrl(observation.canonicalUrl, allowedHosts)
  ) {
    throw new Error(`canonicalUrl host/protocol is not allowlisted: ${observation.canonicalUrl}`);
  }
  return observation;
}

export async function runRadarAdapterConformance<Raw, Context>(
  definition: RadarAdapterConformanceDefinition<Raw, Context>,
): Promise<RadarAdapterConformanceReport> {
  const checks: string[] = [];
  const failures: string[] = [];
  const check = async (name: string, operation: () => Promise<void>) => {
    try {
      await operation();
      checks.push(name);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  await check('valid canonical observation, UTC dates, safe URL, and geography', async () => {
    await normalizeValid(
      definition.adapter,
      definition.validCase,
      definition.allowedCanonicalUrlHosts,
    );
  });

  await check('stable exact-source event identity', async () => {
    const first = await normalizeValid(
      definition.adapter,
      definition.validCase,
      definition.allowedCanonicalUrlHosts,
    );
    const second = await normalizeValid(
      definition.adapter,
      definition.validCase,
      definition.allowedCanonicalUrlHosts,
    );
    if (
      first.sourceDefinitionId !== second.sourceDefinitionId ||
      first.providerEventId !== second.providerEventId
    ) {
      throw new Error('normalizing the same provider input changed exact-source identity');
    }
  });

  await check('material revision preserves event identity and changes revision identity', async () => {
    const initial = await normalizeValid(
      definition.adapter,
      definition.revisionCase.initial,
      definition.allowedCanonicalUrlHosts,
    );
    const revised = await normalizeValid(
      definition.adapter,
      definition.revisionCase.revised,
      definition.allowedCanonicalUrlHosts,
    );
    if (
      initial.sourceDefinitionId !== revised.sourceDefinitionId ||
      initial.providerEventId !== revised.providerEventId
    ) {
      throw new Error('a provider revision changed exact-source event identity');
    }
    if (radarRevisionIdentity(initial) === radarRevisionIdentity(revised)) {
      throw new Error('a material provider revision did not change revision identity');
    }
  });

  await check(`resolution mapping: ${definition.resolutionCase.name}`, async () => {
    const observation = await normalizeValid(
      definition.adapter,
      definition.resolutionCase,
      definition.allowedCanonicalUrlHosts,
    );
    if (observation.lifecycleStatus !== 'resolved') {
      throw new Error(`expected resolved, received ${observation.lifecycleStatus}`);
    }
  });

  await check(`supersession mapping: ${definition.supersessionCase.name}`, async () => {
    const observation = await normalizeValid(
      definition.adapter,
      definition.supersessionCase,
      definition.allowedCanonicalUrlHosts,
    );
    if (observation.lifecycleStatus !== definition.supersessionCase.expectedStatus) {
      throw new Error(
        `expected ${definition.supersessionCase.expectedStatus}, received ${observation.lifecycleStatus}`,
      );
    }
  });

  if (definition.invalidCases.length === 0) {
    failures.push('invalid payload rejection: at least one invalid provider case is required');
  }
  for (const invalidCase of definition.invalidCases) {
    await check(`invalid payload rejection: ${invalidCase.name}`, async () => {
      try {
        await definition.adapter.normalize(invalidCase.raw, invalidCase.context);
      } catch {
        return;
      }
      throw new Error('adapter returned successfully instead of rejecting invalid provider input');
    });
  }

  if (failures.length > 0) {
    throw new RadarAdapterConformanceError(definition.adapterName, failures);
  }
  return { adapterName: definition.adapterName, checks };
}
