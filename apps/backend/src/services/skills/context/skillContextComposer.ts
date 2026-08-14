import { ROLE_RANK, resolvePropertyAccess } from '../../propertyAccess.service';
import type { SkillDefinition, VersionedSkillReference } from '../skill.contract';
import {
  getSkillContextProvider,
  skillContextProviderKey,
} from './skillContextProviderRegistry';
import {
  askSkillContextCompositionDurationSeconds,
  askSkillContextPayloadBytes,
  askSkillContextProviderDurationSeconds,
  askSkillContextProviderFanout,
  askSkillContextProviderTotal,
} from '../../../lib/metrics';
import type {
  ComposedSkillContext,
  ComposedSkillContextEntry,
  SkillContextAuthorization,
  SkillContextProviderDefinition,
  SkillContextProviderStatus,
} from './skillContext.contract';
import type { AskOperationId } from '../../ask/askOperationRegistry';

type ProviderResolver = (id: string, version: string) => SkillContextProviderDefinition | undefined;
type AuthorizeProperty = (userId: string, propertyId: string) => Promise<SkillContextAuthorization | null>;

export interface ComposeSkillContextInput {
  skill: SkillDefinition;
  operationId: AskOperationId;
  userId: string;
  propertyId: string;
  signal?: AbortSignal;
}

export interface SkillContextComposerDependencies {
  resolveProvider?: ProviderResolver;
  authorizeProperty?: AuthorizeProperty;
  providerEnabled?: (providerId: string) => boolean;
}

function emptyEntry(
  provider: SkillContextProviderDefinition | undefined,
  reference: VersionedSkillReference,
  required: boolean,
  status: SkillContextProviderStatus,
  detail?: string,
): ComposedSkillContextEntry {
  return {
    key: skillContextProviderKey(reference),
    required,
    status,
    provenance: provider ? {
      providerId: provider.id,
      providerVersion: provider.version,
      canonicalOwner: provider.canonicalOwner,
      sensitivity: provider.sensitivity,
      observedAt: null,
      sourceVersion: null,
    } : null,
    latencyMs: 0,
    serializedBytes: 0,
    entityCount: 0,
    factCount: 0,
    ...(detail ? { detail } : {}),
  };
}

function serializedSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
}

export async function composeSkillContext(
  input: ComposeSkillContextInput,
  dependencies: SkillContextComposerDependencies = {},
): Promise<ComposedSkillContext> {
  const compositionStartedAt = process.hrtime.bigint();
  const complete = (result: ComposedSkillContext): ComposedSkillContext => {
    const labels = { skill: input.skill.id, operation: input.operationId, status: result.status };
    askSkillContextCompositionDurationSeconds.observe(labels, Number(process.hrtime.bigint() - compositionStartedAt) / 1_000_000_000);
    askSkillContextPayloadBytes.observe(labels, result.totalSerializedBytes);
    askSkillContextProviderFanout.observe(labels, result.entries.length);
    return result;
  };
  const operation = input.skill.operations.find((candidate) => candidate.operationId === input.operationId);
  if (!operation) return complete({ status: 'BLOCKED', entries: [], values: {}, totalSerializedBytes: 0, totalEntities: 0, totalFacts: 0 });

  const required = operation.requiredContextProviders ?? [];
  const optional = operation.optionalContextProviders ?? [];
  const declarations = new Set([
    ...input.skill.requiredContextProviders,
    ...input.skill.optionalContextProviders,
  ].map(skillContextProviderKey));
  const requested = [...required.map((reference) => ({ reference, required: true })), ...optional.map((reference) => ({ reference, required: false }))];
  if (!requested.length) return complete({ status: 'READY', entries: [], values: {}, totalSerializedBytes: 0, totalEntities: 0, totalFacts: 0 });

  const resolveProvider = dependencies.resolveProvider ?? getSkillContextProvider;
  const authorizeProperty = dependencies.authorizeProperty ?? resolvePropertyAccess;
  const providerEnabled = dependencies.providerEnabled ?? (() => true);
  let authorizationPromise: Promise<SkillContextAuthorization | null> | null = null;
  const getAuthorization = () => authorizationPromise ??= authorizeProperty(input.userId, input.propertyId);
  const invocationCache = new Map<string, Promise<ComposedSkillContextEntry>>();
  const startedAt = Date.now();

  const invoke = ({ reference, required: isRequired }: typeof requested[number]): Promise<ComposedSkillContextEntry> => {
    const key = skillContextProviderKey(reference);
    const cached = invocationCache.get(key);
    if (cached) return cached.then((entry) => ({ ...entry, required: entry.required || isRequired }));

    const invocationStartedAt = process.hrtime.bigint();
    const promise = (async (): Promise<ComposedSkillContextEntry> => {
      const providerStartedAt = process.hrtime.bigint();
      const provider = resolveProvider(reference.id, reference.version);
      if (!declarations.has(key)) return emptyEntry(provider, reference, isRequired, 'UNAVAILABLE', 'Provider is not declared by this Skill.');
      if (!provider) return emptyEntry(undefined, reference, isRequired, 'UNAVAILABLE', 'Provider is not registered.');
      if (!providerEnabled(provider.id)) return emptyEntry(provider, reference, isRequired, 'UNAVAILABLE', 'Provider is disabled by an operational control.');
      if (!provider.supportedOperations.includes(input.operationId)) return emptyEntry(provider, reference, isRequired, 'NOT_APPLICABLE');
      const authorization = await getAuthorization();
      if (!authorization || (provider.minimumRole && ROLE_RANK[authorization.role] < ROLE_RANK[provider.minimumRole])) {
        return emptyEntry(provider, reference, isRequired, 'UNAUTHORIZED');
      }

      const remainingOverallMs = input.skill.contextBudget.maxOverallLatencyMs - (Date.now() - startedAt);
      const timeoutMs = Math.max(1, Math.min(provider.defaultTimeoutMs, input.skill.contextBudget.maxProviderLatencyMs, remainingOverallMs));
      const controller = new AbortController();
      const abortFromCaller = () => controller.abort(input.signal?.reason);
      input.signal?.addEventListener('abort', abortFromCaller, { once: true });
      let timeout: NodeJS.Timeout | undefined;
      let terminalStatus: SkillContextProviderStatus = 'UNAVAILABLE';
      try {
        const value = await Promise.race([
          provider.load({ ...input, signal: controller.signal }),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              controller.abort(new Error('Skill context provider timed out'));
              reject(Object.assign(new Error('Skill context provider timed out'), { code: 'SKILL_CONTEXT_TIMEOUT' }));
            }, timeoutMs);
          }),
        ]);
        const bytes = value.data === undefined ? 0 : serializedSize(value.data);
        const entityCount = value.entityCount ?? 0;
        const factCount = value.factCount ?? 0;
        const exceedsBudget = bytes > provider.maxSerializedBytes
          || bytes > input.skill.contextBudget.maxSerializedBytes
          || entityCount > input.skill.contextBudget.maxEntities
          || factCount > input.skill.contextBudget.maxFacts;
        if (exceedsBudget) {
          terminalStatus = 'BUDGET_EXCEEDED';
          return emptyEntry(provider, reference, isRequired, terminalStatus, 'Provider output exceeded the declared context budget.');
        }
        terminalStatus = value.status;
        return {
          key,
          required: isRequired,
          status: value.status,
          ...(value.data === undefined ? {} : { data: value.data }),
          provenance: {
            providerId: provider.id,
            providerVersion: provider.version,
            canonicalOwner: provider.canonicalOwner,
            sensitivity: provider.sensitivity,
            observedAt: value.observedAt ?? null,
            sourceVersion: value.sourceVersion ?? null,
          },
          latencyMs: 0,
          serializedBytes: bytes,
          entityCount,
          factCount,
          ...(value.detail ? { detail: value.detail } : {}),
        };
      } catch (error) {
        const timedOut = (error as Error & { code?: string }).code === 'SKILL_CONTEXT_TIMEOUT';
        terminalStatus = timedOut ? 'TIMED_OUT' : 'UNAVAILABLE';
        return emptyEntry(provider, reference, isRequired, terminalStatus);
      } finally {
        if (timeout) clearTimeout(timeout);
        input.signal?.removeEventListener('abort', abortFromCaller);
        askSkillContextProviderTotal.inc({ provider: provider.id, provider_version: provider.version, status: terminalStatus });
        askSkillContextProviderDurationSeconds.observe(
          { provider: provider.id, provider_version: provider.version },
          Number(process.hrtime.bigint() - providerStartedAt) / 1_000_000_000,
        );
      }
    })().then((entry) => ({
      ...entry,
      latencyMs: Number(process.hrtime.bigint() - invocationStartedAt) / 1_000_000,
    }));
    invocationCache.set(key, promise);
    return promise;
  };

  const entries = await Promise.all(requested.map(invoke));
  const deduplicatedEntries = [...new Map(entries.map((entry) => [entry.key, entry])).values()];
  let totalSerializedBytes = 0;
  let totalEntities = 0;
  let totalFacts = 0;
  const values: Record<string, unknown> = {};
  for (const entry of deduplicatedEntries) {
    const wouldExceedOverallBudget = totalSerializedBytes + entry.serializedBytes > input.skill.contextBudget.maxSerializedBytes
      || totalEntities + entry.entityCount > input.skill.contextBudget.maxEntities
      || totalFacts + entry.factCount > input.skill.contextBudget.maxFacts;
    if (entry.status === 'AVAILABLE' && wouldExceedOverallBudget) {
      entry.status = 'BUDGET_EXCEEDED';
      entry.data = undefined;
      entry.serializedBytes = 0;
      entry.entityCount = 0;
      entry.factCount = 0;
      entry.detail = 'Combined provider output exceeded the Skill context budget.';
    }
    totalSerializedBytes += entry.serializedBytes;
    totalEntities += entry.entityCount;
    totalFacts += entry.factCount;
    if (entry.status === 'AVAILABLE' && entry.data !== undefined) values[entry.key] = entry.data;
  }

  const unavailableRequired = deduplicatedEntries.some((entry) => entry.required && entry.status !== 'AVAILABLE');
  const degraded = deduplicatedEntries.some((entry) => entry.status !== 'AVAILABLE' && entry.status !== 'NOT_APPLICABLE');
  return complete({
    status: unavailableRequired ? 'BLOCKED' : degraded ? 'DEGRADED' : 'READY',
    entries: deduplicatedEntries,
    values,
    totalSerializedBytes,
    totalEntities,
    totalFacts,
  });
}
