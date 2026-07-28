import { validateCoveragePreflightTarget } from './coverageLoadPreflight.service';

export const COVERAGE_MUTATION_PREFLIGHT_VERSION =
  'coverage-mutation-preflight-v1' as const;

type MutationResponse = {
  status: number;
  body: unknown;
};

export type CoverageMutationRequester = (
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
) => Promise<MutationResponse>;

export type CoverageMutationPreflightConfig = {
  baseUrl: string;
  allowedHost: string;
  targetClass: 'LOCAL' | 'STAGING';
  propertyId: string;
  unauthorizedPropertyId: string;
  comparisonId: string;
  handoffRequestId: string;
  recipientId: string;
  disclosureVersion: string;
  contactEmail: string;
  concurrency: number;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nested(value: unknown, ...keys: string[]) {
  let current: unknown = value;
  for (const key of keys) {
    current = object(current)?.[key];
  }
  return current;
}

function successStatus(status: number) {
  return status >= 200 && status < 300;
}

export function validateCoverageMutationConfig(
  config: CoverageMutationPreflightConfig,
) {
  const target = validateCoveragePreflightTarget(config);
  for (const [name, value] of [
    ['COVERAGE_MUTATION_PROPERTY_ID', config.propertyId],
    ['COVERAGE_MUTATION_UNAUTHORIZED_PROPERTY_ID', config.unauthorizedPropertyId],
    ['COVERAGE_MUTATION_COMPARISON_ID', config.comparisonId],
    ['COVERAGE_MUTATION_HANDOFF_REQUEST_ID', config.handoffRequestId],
    ['COVERAGE_MUTATION_RECIPIENT_ID', config.recipientId],
    ['COVERAGE_MUTATION_DISCLOSURE_VERSION', config.disclosureVersion],
    ['COVERAGE_MUTATION_CONTACT_EMAIL', config.contactEmail],
  ]) {
    if (!value.trim()) throw new Error(`${name} is required.`);
  }
  if (config.propertyId === config.unauthorizedPropertyId) {
    throw new Error('The authorized and unauthorized property ids must differ.');
  }
  if (
    !Number.isInteger(config.concurrency) ||
    config.concurrency < 2 ||
    config.concurrency > 20
  ) {
    throw new Error('COVERAGE_MUTATION_CONCURRENCY must be between 2 and 20.');
  }
  return target;
}

export async function runCoverageMutationPreflight(
  config: CoverageMutationPreflightConfig,
  requester: CoverageMutationRequester,
  now = new Date(),
) {
  const { hostname } = validateCoverageMutationConfig(config);
  const authorizationProbe = await requester(
    'GET',
    `/api/properties/${encodeURIComponent(config.unauthorizedPropertyId)}/insurance-history`,
  );
  const authorizationDenied =
    authorizationProbe.status === 403 || authorizationProbe.status === 404;

  const decisionResponses = await Promise.all(
    Array.from({ length: config.concurrency }, () => requester(
      'POST',
      `/api/properties/${encodeURIComponent(config.propertyId)}/coverage-comparisons/${encodeURIComponent(config.comparisonId)}/decision`,
      {
        decision: 'KEEP',
        rationale: 'Staging idempotency preflight.',
      },
    )),
  );
  const decisionIds = new Set(
    decisionResponses
      .map((response) => nested(response.body, 'data', 'decision', 'id'))
      .filter((value): value is string => typeof value === 'string'),
  );
  const homeEventIds = new Set(
    decisionResponses
      .map((response) => nested(response.body, 'data', 'homeEvent', 'id'))
      .filter((value): value is string => typeof value === 'string'),
  );
  const decisionIdempotent =
    decisionResponses.every(({ status }) => successStatus(status)) &&
    decisionIds.size === 1 &&
    homeEventIds.size === 1;

  const handoffBody = {
    requestId: config.handoffRequestId,
    recipientId: config.recipientId,
    disclosureVersion: config.disclosureVersion,
    source: 'COVERAGE_COMPARISON',
    purpose: 'Staging idempotency and fulfillment-control preflight.',
    preferredContact: 'EMAIL',
    contactEmail: config.contactEmail,
    coverageComparisonId: config.comparisonId,
    consent: {
      dataSharing: true,
      disclosuresAccepted: true,
      email: true,
      sms: false,
      phone: false,
    },
  };
  const handoffResponses = await Promise.all(
    Array.from({ length: config.concurrency }, () => requester(
      'POST',
      `/api/properties/${encodeURIComponent(config.propertyId)}/insurance-handoff/requests`,
      handoffBody,
    )),
  );
  const handoffIds = new Set(
    handoffResponses
      .map((response) => nested(response.body, 'data', 'request', 'id'))
      .filter((value): value is string => typeof value === 'string'),
  );
  const handoffIdempotent =
    handoffResponses.every(({ status }) => successStatus(status)) &&
    handoffIds.size === 1 &&
    handoffIds.has(config.handoffRequestId);
  const withdrawalResponse = handoffIdempotent
    ? await requester(
        'POST',
        `/api/properties/${encodeURIComponent(config.propertyId)}/insurance-handoff/requests/${encodeURIComponent(config.handoffRequestId)}/withdraw`,
        {},
      )
    : null;
  const handoffWithdrawn =
    withdrawalResponse !== null &&
    successStatus(withdrawalResponse.status) &&
    nested(withdrawalResponse.body, 'data', 'request', 'status') === 'WITHDRAWN';

  const passed =
    authorizationDenied &&
    decisionIdempotent &&
    handoffIdempotent &&
    handoffWithdrawn;
  return {
    contractVersion: COVERAGE_MUTATION_PREFLIGHT_VERSION,
    checkedAt: now.toISOString(),
    passed,
    target: {
      class: config.targetClass,
      hostname,
      productionTarget: false,
    },
    profile: {
      concurrency: config.concurrency,
      dedicatedTestDataRequired: true,
    },
    checks: {
      unauthorizedPropertyDenied: authorizationDenied,
      unauthorizedPropertyStatus: authorizationProbe.status,
      decision: {
        successfulResponses: decisionResponses.filter(({ status }) =>
          successStatus(status)).length,
        oneDecisionId: decisionIds.size === 1,
        oneHomeEventId: homeEventIds.size === 1,
        idempotent: decisionIdempotent,
      },
      handoff: {
        successfulResponses: handoffResponses.filter(({ status }) =>
          successStatus(status)).length,
        oneRequestId: handoffIds.size === 1,
        requestedIdPreserved: handoffIds.has(config.handoffRequestId),
        idempotent: handoffIdempotent,
        withdrawnAfterCheck: handoffWithdrawn,
      },
    },
    privacy: {
      authorizationValueLogged: false,
      responseBodiesLogged: false,
      propertyIdsLogged: false,
      contactValueLogged: false,
    },
  };
}
