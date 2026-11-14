// Provider boundary for the model-assisted route (reliability FRD FR-UND-*, FR-PRV-1/3/4, D3a, D6a). It defines the interface, the
// guard every provider call must pass through, the production Gemini adapter, and a scripted offline stub:
//   1. refused unless the owner has recorded and approved the provider terms (D3a) -- there is no default, it is an explicit input;
//   2. the text sent is the MINIMISED text (FR-PRV-1); a no-call minimiser outcome means no call at all (FR-PRV-3); the raw message never reaches the provider;
//   3. the call budget (D6a: at most 4 calls, per-call and total timeouts) is enforced here, and the provider's answer is only ever a RAW PLAN that must pass
//      deterministic validation (requestPlan.ts) before anything runs.
import { minimizePrompt, type KnownName } from '../privacy/promptMinimizer';
import { validateRequestPlan, type PlanValidation, type PlanContext } from './requestPlan';
import { ASK_OPERATION_DEFINITIONS } from '../askOperationRegistry';
import { DATA_POINT_DEFINITIONS } from '../dataPoint/dataPointCatalogue';
import { isWriteCapableOperation } from '../support/writeCapability';
import { geminiService } from '../../gemini.service';
import { z } from 'zod';

// D6a (decided 2026-11-11): routing hard budget 4 s; stage one <= 1.5 s, each target call <= 2.5 s (concurrent, so the budget holds); S_max = 3 target calls, 1 + S_max = 4 calls at most. `perCallTimeoutMs` is the limit of a
// single-call route, and the whole-call guard of a provider that makes one call.
export const MODEL_CALL_BUDGET = Object.freeze({ maxTotalCalls: 4, maxTargetCalls: 3, perCallTimeoutMs: 1500, stageOneTimeoutMs: 1500, targetCallTimeoutMs: 2500, totalBudgetMs: 4000 });
/** A model facet below this confidence is not run (it is reported as a part that could not be matched), the same floor the deterministic decomposition uses. */
export const MODEL_FACET_MIN_CONFIDENCE = 0.5;
/**
 * PROVISIONAL confidence for a candidate the model returned without a plan confidence: the model's own self-assessment, mapped conservatively. It is NOT a calibrated probability (FR-CAL: calibration needs the sealed
 * evaluation, which does not exist); it only stops a LOW self-assessment from being run as if it were as sure as a HIGH one, and it is moot until the understanding stratum is certified.
 */
export const provisionalCandidateConfidence = (selfAssessment: unknown): number => (selfAssessment === 'HIGH' ? 0.7 : selfAssessment === 'MEDIUM' ? 0.5 : 0.3);
export const SINGLE_STAGE_CANDIDATE_LIMIT = 120;

const ProviderCandidateSchema = z.object({
  kind: z.enum(['OPERATION', 'DATA_POINT']), operationId: z.string().optional(), dataPointId: z.string().optional(),
  entityRef: z.string().nullable().optional(), parameters: z.record(z.string(), z.unknown()).default({}),
  requiredSlots: z.array(z.string()).max(12).default([]),
  evidence: z.object({ jobMatch: z.enum(['DIRECT', 'PARTIAL', 'NONE']), itemNamed: z.boolean() }).strict(),
}).strict();
const ProviderUnderstandingSchema = z.object({
  disposition: z.enum(['MATCH', 'NONE_FITS', 'INSUFFICIENT_TEXT']),
  candidates: z.array(ProviderCandidateSchema).max(3), slots: z.record(z.string(), z.unknown()),
  selfAssessment: z.enum(['HIGH', 'MEDIUM', 'LOW']), requestPlan: z.object({ facets: z.array(z.record(z.string(), z.unknown())).max(32) }).strict().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.disposition === 'MATCH') !== (value.candidates.length > 0)) ctx.addIssue({ code: 'custom', path: ['candidates'], message: 'MATCH requires candidates; non-MATCH requires none.' });
  value.candidates.forEach((candidate, index) => {
    if (candidate.kind === 'OPERATION' && !candidate.operationId) ctx.addIssue({ code: 'custom', path: ['candidates', index, 'operationId'], message: 'operationId is required.' });
    if (candidate.kind === 'DATA_POINT' && !candidate.dataPointId) ctx.addIssue({ code: 'custom', path: ['candidates', index, 'dataPointId'], message: 'dataPointId is required.' });
    if (candidate.kind === 'OPERATION' && candidate.dataPointId) ctx.addIssue({ code: 'custom', path: ['candidates', index, 'dataPointId'], message: 'dataPointId is not allowed for an operation.' });
    if (candidate.kind === 'DATA_POINT' && candidate.operationId) ctx.addIssue({ code: 'custom', path: ['candidates', index, 'operationId'], message: 'operationId is not allowed for a data point.' });
  });
});

export interface UnderstandingProvider {
  readonly name: string;
  readonly lastCallCount?: number;
  /** Target-stage domains beyond S_max that were not searched (FR-UND-13 step 3): reported, never a reason to fail the turn. */
  readonly lastDomainOverflow?: number;
  /** The longest this provider may take for one plan() call. Defaults to one call's budget; a provider that makes several calls states its own (each call is bounded inside it). */
  readonly timeoutBudgetMs?: number;
  plan(input: {
    readonly text: string;
    readonly signal: AbortSignal;
    readonly eligibleOperationIds?: ReadonlySet<string>;
    readonly eligibleDataPointIds?: ReadonlySet<string>;
  }): Promise<unknown>;
}
export type GuardOutcome =
  | { readonly kind: 'PLANNED'; readonly validation: PlanValidation; readonly sentText: string; readonly calls: number; readonly domainOverflow?: number }
  | { readonly kind: 'REFUSED'; readonly reason: 'PROVIDER_TERMS_NOT_RECORDED' | 'NO_CALL_UNCLASSIFIABLE_IDENTIFIER' | 'NO_CALL_UNINTERPRETABLE_AFTER_MINIMISATION' }
  /** FR-UND-12: the model answered and said NONE_FITS or INSUFFICIENT_TEXT. These are outcomes of their own, not a schema failure and not an outage. */
  | { readonly kind: 'NO_MATCH'; readonly disposition: 'NONE_FITS' | 'INSUFFICIENT_TEXT'; readonly calls: number }
  /** `stage` is set when the failure happened in a named stage of the two-stage path (STAGE1_UNAVAILABLE / STAGE2_UNAVAILABLE). */
  | { readonly kind: 'UNAVAILABLE'; readonly reason: 'TIMEOUT' | 'PROVIDER_ERROR' | 'SCHEMA_FAILURE'; readonly calls: number; readonly stage?: 'STAGE1' | 'STAGE2' };

export interface GuardedPlanInput {
  readonly message: string;
  readonly knownNames?: readonly KnownName[];
  readonly provider: UnderstandingProvider;
  /** D3a: true only when the provider's retention, no-training and regional-processing terms have been recorded and approved by the owner. */
  readonly providerTermsRecorded: boolean;
  readonly planContext: Omit<PlanContext, 'message'>;
}

export async function guardedPlan(input: GuardedPlanInput): Promise<GuardOutcome> {
  if (!input.providerTermsRecorded) return { kind: 'REFUSED', reason: 'PROVIDER_TERMS_NOT_RECORDED' };
  const minimised = minimizePrompt(input.message, input.knownNames ?? []);
  if (minimised.noCall) return { kind: 'REFUSED', reason: minimised.noCall === 'UNCLASSIFIABLE_IDENTIFIER' ? 'NO_CALL_UNCLASSIFIABLE_IDENTIFIER' : 'NO_CALL_UNINTERPRETABLE_AFTER_MINIMISATION' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.provider.timeoutBudgetMs ?? MODEL_CALL_BUDGET.perCallTimeoutMs);
  try {
    const raw = await Promise.race([
      input.provider.plan({
        text: minimised.text, signal: controller.signal,
        eligibleOperationIds: input.planContext.eligibleOperationIds,
        eligibleDataPointIds: input.planContext.eligibleDataPointIds,
      }),
      new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })))),
    ]);
    // FR-UND-12: a valid NONE_FITS / INSUFFICIENT_TEXT reply is its own outcome; it must not reach plan validation, where an empty plan reads as a schema failure.
    if (raw && typeof raw === 'object' && Array.isArray((raw as { facets?: unknown }).facets) && (raw as { facets: unknown[] }).facets.length === 0) {
      const disposition = (raw as { disposition?: unknown }).disposition;
      if (disposition === 'NONE_FITS' || disposition === 'INSUFFICIENT_TEXT') return { kind: 'NO_MATCH', disposition, calls: input.provider.lastCallCount ?? 1 };
    }
    // The plan is validated against the MINIMISED text's words: a facet span is a phrase of the message, and placeholders are not routing words.
    const validation = validateRequestPlan(raw, { ...input.planContext, message: input.message });
    if (!validation.accepted.length && !validation.dropped.length) return { kind: 'UNAVAILABLE', reason: 'SCHEMA_FAILURE', calls: input.provider.lastCallCount ?? 1 };
    return { kind: 'PLANNED', validation, sentText: minimised.text, calls: input.provider.lastCallCount ?? 1, domainOverflow: input.provider.lastDomainOverflow ?? 0 };
  } catch (error) {
    const stage = (error as { stage?: unknown })?.stage;
    return { kind: 'UNAVAILABLE', reason: (error as Error)?.name === 'TimeoutError' ? 'TIMEOUT' : 'PROVIDER_ERROR', calls: input.provider.lastCallCount ?? 1, ...(stage === 'STAGE1' || stage === 'STAGE2' ? { stage } : {}) };
  } finally { clearTimeout(timer); }
}

/** A scripted provider for the offline harness and tests: returns what it is told, records what it was sent. It never leaves the process. */
export class ScriptedProvider implements UnderstandingProvider {
  readonly name = 'scripted-stub';
  readonly received: string[] = [];
  constructor(private readonly script: (text: string) => unknown | Promise<unknown>) {}
  async plan(input: { text: string; signal: AbortSignal }): Promise<unknown> { this.received.push(input.text); return this.script(input.text); }
}

/** One model call under its own timeout, linked to the caller's abort signal; a timeout is a TimeoutError carrying the stage it happened in (FR-UND-13: STAGE1_UNAVAILABLE / STAGE2_UNAVAILABLE). */
function boundedCall<T>(parent: AbortSignal, ms: number, stage: 'STAGE1' | 'STAGE2' | null, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController(); const onAbort = () => controller.abort(); parent.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('model call timed out'), { name: 'TimeoutError', ...(stage ? { stage } : {}) })); }, ms); });
  return Promise.race([run(controller.signal), timeout]).finally(() => { if (timer) clearTimeout(timer); parent.removeEventListener('abort', onAbort); });
}

/** Real provider adapter. It exposes only reviewed ids and descriptions; no home record values are included. */
export class GeminiUnderstandingProvider implements UnderstandingProvider {
  readonly name = 'gemini-structured-understanding';
  lastCallCount = 0;
  lastDomainOverflow = 0;
  /** Up to 1 + S_max calls run inside one plan(); each is bounded by its own stage timeout below, and the whole is bounded by the routing budget (D6a). */
  readonly timeoutBudgetMs = MODEL_CALL_BUDGET.totalBudgetMs;
  async plan(input: { text: string; signal: AbortSignal; eligibleOperationIds?: ReadonlySet<string>; eligibleDataPointIds?: ReadonlySet<string> }): Promise<unknown> {
    const operationCatalogue = Object.values(ASK_OPERATION_DEFINITIONS)
      .filter((definition) => (!input.eligibleOperationIds || input.eligibleOperationIds.has(definition.operationId))
        && definition.messageRoutable && !definition.safetyClass.endsWith('_BOUNDARY'))
      .map((definition) => ({ id: definition.operationId, description: `${isWriteCapableOperation(definition.operationId) ? '[PREVIEW ONLY] ' : ''}${definition.semantic.intentDescription}`, domain: `operation:${definition.family}` }));
    const dataPointCatalogue = DATA_POINT_DEFINITIONS
      .filter((point) => !input.eligibleDataPointIds || input.eligibleDataPointIds.has(point.id))
      .map((point) => ({ id: point.id, description: point.label, domain: point.domain }));
    let raw: unknown;
    this.lastDomainOverflow = 0;
    if (operationCatalogue.length + dataPointCatalogue.length <= SINGLE_STAGE_CANDIDATE_LIMIT) {
      this.lastCallCount = 1;
      raw = await boundedCall(input.signal, MODEL_CALL_BUDGET.perCallTimeoutMs, null, (signal) => geminiService.planAskUnderstanding({ text: input.text, operations: operationCatalogue.map(({ domain: _domain, ...entry }) => entry), dataPoints: dataPointCatalogue, signal }));
    } else {
      const domainIds = [...new Set([...operationCatalogue.map((entry) => entry.domain), ...dataPointCatalogue.map((entry) => entry.domain)])].sort();
      const tagStage = (stage: 'STAGE1' | 'STAGE2') => (error: unknown): never => { throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stage }); };
      const stageOne = await boundedCall(input.signal, MODEL_CALL_BUDGET.stageOneTimeoutMs, 'STAGE1', (signal) => geminiService.selectAskUnderstandingDomains({ text: input.text, domains: domainIds.map((id) => ({ id, description: id.replace(/^operation:/, '').replace(/_/g, ' ').toLowerCase() })), signal })).catch(tagStage('STAGE1')) as { disposition?: string; domains?: Array<{ domainId?: string }> };
      this.lastCallCount = 1;
      if (stageOne.disposition !== 'MATCH') return { disposition: stageOne.disposition, candidates: [], slots: {}, selfAssessment: 'LOW', requestPlan: null };
      const selected = [...new Set((stageOne.domains ?? []).map((entry) => entry.domainId).filter((id): id is string => domainIds.includes(id ?? '')))];
      // FR-UND-13 step 3: more domains than S_max target calls is not an outage. The first S_max domains, in the model's rank order, are searched and the remainder is counted (reported only when independently confirmed).
      const searched = selected.slice(0, MODEL_CALL_BUDGET.maxTargetCalls);
      this.lastDomainOverflow = selected.length - searched.length;
      this.lastCallCount += searched.length;
      const parts = await Promise.all(searched.map((domain) => boundedCall(input.signal, MODEL_CALL_BUDGET.targetCallTimeoutMs, 'STAGE2', (signal) => geminiService.planAskUnderstanding({
        text: input.text,
        operations: operationCatalogue.filter((entry) => entry.domain === domain).map(({ domain: _domain, ...entry }) => entry),
        dataPoints: dataPointCatalogue.filter((entry) => entry.domain === domain),
        signal,
      })).catch(tagStage('STAGE2')) as Promise<{ disposition?: string; selfAssessment?: string; candidates?: Array<Record<string, unknown>>; requestPlan?: { facets?: Array<Record<string, unknown>> } | null }>));
      const facets: Array<Record<string, unknown>> = []; const candidates: Array<Record<string, unknown>> = [];
      for (const part of parts) {
        const offset = facets.length;
        const planned = part.requestPlan?.facets ?? [];
        for (const facet of planned) facets.push({ ...facet, dependsOn: Array.isArray(facet.dependsOn) ? facet.dependsOn.map((value) => Number(value) + offset) : [] });
        // A domain that matched with a candidate but no request plan still contributes its best candidate: nothing a searched domain found is dropped because another domain also answered.
        if (!planned.length && part.disposition === 'MATCH' && part.candidates?.length) facets.push({ ...part.candidates[0], span: input.text, dependsOn: [], confidence: provisionalCandidateConfidence(part.selfAssessment) });
        candidates.push(...(part.candidates ?? []));
      }
      const order = ['LOW', 'MEDIUM', 'HIGH']; const weakest = parts.map((part) => (order.includes(part.selfAssessment ?? '') ? part.selfAssessment! : 'LOW')).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? 'LOW';
      const uniqueCandidates = [...new Map(candidates.map((candidate) => [`${candidate.kind}:${candidate.operationId ?? candidate.dataPointId ?? ''}`, candidate])).values()];
      raw = { disposition: facets.length || uniqueCandidates.length ? 'MATCH' : 'NONE_FITS', candidates: uniqueCandidates.slice(0, 3), slots: {}, selfAssessment: weakest, requestPlan: { facets } };
    }
    if (!raw || typeof raw !== 'object') return raw;
    const parsedResponse = ProviderUnderstandingSchema.safeParse(raw);
    if (!parsedResponse.success) return raw;
    const response = parsedResponse.data;
    if (response.disposition !== 'MATCH') return { facets: [], disposition: response.disposition };
    const proposed: Array<Record<string, unknown>> = Array.isArray(response.requestPlan?.facets) && response.requestPlan!.facets!.length
      ? response.requestPlan!.facets!
      : (response.candidates ?? []).slice(0, 1).map((candidate) => ({ ...candidate, span: input.text, dependsOn: [], confidence: provisionalCandidateConfidence(response.selfAssessment) } as Record<string, unknown>));
    return { facets: proposed.map((facet) => ({
      span: facet.span,
      target: facet.kind === 'DATA_POINT'
        ? { kind: 'DATA_POINT', dataPointId: facet.dataPointId, entityRef: facet.entityRef ?? null, parameters: facet.parameters ?? {}, requiredSlots: facet.requiredSlots ?? [], ...(facet.evidence ? { evidence: facet.evidence } : {}) }
        : { kind: 'OPERATION', operationId: facet.operationId, ...(facet.evidence ? { evidence: facet.evidence } : {}) },
      entity: facet.entity ?? null,
      dependsOn: facet.dependsOn ?? [],
      confidence: facet.confidence,
    })) };
  }
}
