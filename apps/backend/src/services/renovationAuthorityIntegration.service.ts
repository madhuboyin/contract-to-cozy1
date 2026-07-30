import { logger } from '../lib/logger';

export type RenovationAuthorityFamily = 'PERMIT' | 'TAX' | 'LICENSING' | 'ZONING';

export type AuthorityGuidanceResult = {
  configured: boolean;
  available: boolean;
  family: RenovationAuthorityFamily;
  advisoryLikelihood: 'LIKELY_APPLIES' | 'POSSIBLY_APPLIES' | 'LIKELY_DOES_NOT_APPLY' | 'UNKNOWN' | 'DATA_UNAVAILABLE';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNAVAILABLE';
  sourceLabel: string | null;
  sourceReferenceUrl: string | null;
  observedAt: Date | null;
  limitation: string;
  latencyMs: number | null;
  lastError: string | null;
  payload: Record<string, unknown> | null;
};

type SourceObservation = {
  family: RenovationAuthorityFamily;
  lastSuccessAt: Date | null;
  lastError: string | null;
  latencyMs: number | null;
};

const observations = new Map<RenovationAuthorityFamily, SourceObservation>();
const ALLOWED_LIKELIHOODS = new Set([
  'LIKELY_APPLIES',
  'POSSIBLY_APPLIES',
  'LIKELY_DOES_NOT_APPLY',
  'UNKNOWN',
  'DATA_UNAVAILABLE',
]);
const ALLOWED_CONFIDENCE = new Set(['HIGH', 'MEDIUM', 'LOW', 'UNAVAILABLE']);

function configFor(family: RenovationAuthorityFamily) {
  const prefix = `RENOVATION_${family}_AUTHORITY`;
  return {
    url: process.env[`${prefix}_URL`] ?? null,
    label: process.env[`${prefix}_LABEL`] ?? `${family.toLowerCase()} authority endpoint`,
    token: process.env[`${prefix}_TOKEN`] ?? null,
    coverage: process.env[`${prefix}_COVERAGE`] ?? 'UNSPECIFIED',
  };
}

export function getConfiguredAuthorityIntegrations() {
  return (['PERMIT', 'TAX', 'LICENSING', 'ZONING'] as const)
    .map(family => ({ family, ...configFor(family), observation: observations.get(family) ?? null }))
    .filter(item => Boolean(item.url));
}

function unavailable(
  family: RenovationAuthorityFamily,
  configured: boolean,
  limitation: string,
  lastError: string | null = null,
  latencyMs: number | null = null,
): AuthorityGuidanceResult {
  return {
    configured,
    available: false,
    family,
    advisoryLikelihood: 'DATA_UNAVAILABLE',
    confidence: 'UNAVAILABLE',
    sourceLabel: null,
    sourceReferenceUrl: null,
    observedAt: null,
    limitation,
    latencyMs,
    lastError,
    payload: null,
  };
}

export async function pollAuthorityGuidance(
  family: RenovationAuthorityFamily,
  input: {
    propertyId?: string;
    state?: string | null;
    county?: string | null;
    city?: string | null;
    postalCode?: string | null;
    scopeSummary?: string | null;
    renovationType?: string | null;
  },
): Promise<AuthorityGuidanceResult> {
  const config = configFor(family);
  if (!config.url) {
    return unavailable(
      family,
      false,
      `No live ${family.toLowerCase()} authority integration is configured for this environment.`,
    );
  }

  const startedAt = Date.now();
  try {
    const url = new URL(config.url);
    for (const [key, value] of Object.entries(input)) {
      if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`Authority endpoint returned HTTP ${response.status}`);
    const body = await response.json() as Record<string, unknown>;
    if (body.verified !== true) {
      throw new Error('Authority response did not assert verified=true');
    }
    const likelihood = typeof body.advisoryLikelihood === 'string'
      && ALLOWED_LIKELIHOODS.has(body.advisoryLikelihood)
      ? body.advisoryLikelihood as AuthorityGuidanceResult['advisoryLikelihood']
      : 'UNKNOWN';
    const confidence = typeof body.confidence === 'string'
      && ALLOWED_CONFIDENCE.has(body.confidence)
      ? body.confidence as AuthorityGuidanceResult['confidence']
      : 'MEDIUM';
    const observedAt = typeof body.observedAt === 'string' && !Number.isNaN(Date.parse(body.observedAt))
      ? new Date(body.observedAt)
      : new Date();
    const latencyMs = Date.now() - startedAt;
    observations.set(family, { family, lastSuccessAt: observedAt, lastError: null, latencyMs });
    return {
      configured: true,
      available: true,
      family,
      advisoryLikelihood: likelihood,
      confidence,
      sourceLabel: typeof body.sourceLabel === 'string' ? body.sourceLabel : config.label,
      // The configured adapter URL may be private infrastructure. Only expose
      // a public authority reference when the adapter explicitly supplies one.
      sourceReferenceUrl: typeof body.sourceReferenceUrl === 'string' ? body.sourceReferenceUrl : null,
      observedAt,
      limitation: typeof body.limitation === 'string'
        ? body.limitation
        : 'Live authority guidance is advisory until the homeowner records an official determination and evidence.',
      latencyMs,
      lastError: null,
      payload: body,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    const prior = observations.get(family);
    observations.set(family, {
      family,
      lastSuccessAt: prior?.lastSuccessAt ?? null,
      lastError: message,
      latencyMs,
    });
    logger.warn({ family, err: error }, '[RenovationAuthorityIntegration] live poll failed');
    return unavailable(
      family,
      true,
      'Live authority guidance is temporarily unavailable; the requirement remains unresolved.',
      message,
      latencyMs,
    );
  }
}
