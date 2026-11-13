// Provider boundary for the model-assisted route (reliability FRD FR-UND-*, FR-PRV-1/3/4, D3a, D6a). This file contains NO real provider. It defines the interface, the
// guard every provider call must pass through, and a scripted stub for the offline harness. The guard is what makes it safe to add a real provider later:
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

export const MODEL_CALL_BUDGET = Object.freeze({ maxTotalCalls: 4, maxTargetCalls: 3, perCallTimeoutMs: 1500, totalBudgetMs: 4000 });

export interface UnderstandingProvider { readonly name: string; plan(input: { readonly text: string; readonly signal: AbortSignal }): Promise<unknown> }
export type GuardOutcome =
  | { readonly kind: 'PLANNED'; readonly validation: PlanValidation; readonly sentText: string; readonly calls: number }
  | { readonly kind: 'REFUSED'; readonly reason: 'PROVIDER_TERMS_NOT_RECORDED' | 'NO_CALL_UNCLASSIFIABLE_IDENTIFIER' | 'NO_CALL_UNINTERPRETABLE_AFTER_MINIMISATION' }
  | { readonly kind: 'UNAVAILABLE'; readonly reason: 'TIMEOUT' | 'PROVIDER_ERROR' | 'SCHEMA_FAILURE'; readonly calls: number };

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
  const timer = setTimeout(() => controller.abort(), MODEL_CALL_BUDGET.perCallTimeoutMs);
  try {
    const raw = await Promise.race([
      input.provider.plan({ text: minimised.text, signal: controller.signal }),
      new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })))),
    ]);
    // The plan is validated against the MINIMISED text's words: a facet span is a phrase of the message, and placeholders are not routing words.
    const validation = validateRequestPlan(raw, { ...input.planContext, message: input.message });
    if (!validation.accepted.length && !validation.dropped.length) return { kind: 'UNAVAILABLE', reason: 'SCHEMA_FAILURE', calls: 1 };
    return { kind: 'PLANNED', validation, sentText: minimised.text, calls: 1 };
  } catch (error) {
    return { kind: 'UNAVAILABLE', reason: (error as Error)?.name === 'TimeoutError' ? 'TIMEOUT' : 'PROVIDER_ERROR', calls: 1 };
  } finally { clearTimeout(timer); }
}

/** A scripted provider for the offline harness and tests: returns what it is told, records what it was sent. It never leaves the process. */
export class ScriptedProvider implements UnderstandingProvider {
  readonly name = 'scripted-stub';
  readonly received: string[] = [];
  constructor(private readonly script: (text: string) => unknown | Promise<unknown>) {}
  async plan(input: { text: string; signal: AbortSignal }): Promise<unknown> { this.received.push(input.text); return this.script(input.text); }
}

/** Real provider adapter. It exposes only reviewed ids and descriptions; no home record values are included. */
export class GeminiUnderstandingProvider implements UnderstandingProvider {
  readonly name = 'gemini-structured-understanding';
  async plan(input: { text: string; signal: AbortSignal }): Promise<unknown> {
    const operations = Object.values(ASK_OPERATION_DEFINITIONS)
      .filter((definition) => definition.messageRoutable && definition.composableRead && !isWriteCapableOperation(definition.operationId))
      .map((definition) => ({ id: definition.operationId, description: definition.semantic.intentDescription }));
    const dataPoints = DATA_POINT_DEFINITIONS.map((point) => ({ id: point.id, description: point.label, domain: point.domain }));
    const raw = await geminiService.planAskUnderstanding({ text: input.text, operations, dataPoints, signal: input.signal });
    if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { facets?: unknown }).facets)) return raw;
    return { facets: (raw as { facets: Array<Record<string, unknown>> }).facets.map((facet) => ({
      span: facet.span,
      target: facet.kind === 'DATA_POINT'
        ? { kind: 'DATA_POINT', dataPointId: facet.dataPointId }
        : { kind: 'OPERATION', operationId: facet.operationId },
      entity: facet.entity ?? null,
      dependsOn: facet.dependsOn ?? [],
      confidence: facet.confidence,
    })) };
  }
}
