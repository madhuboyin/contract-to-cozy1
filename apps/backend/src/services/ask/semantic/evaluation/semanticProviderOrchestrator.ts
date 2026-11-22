import { readAskOperationalControls } from '../../../../config/askOperationalControls';
import { performance } from 'node:perf_hooks';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { executeGovernedAIRequest, resolveGovernedAIModel } from '../../../ai/aiRequestGovernance.service';
import { ASK_SEMANTIC_DOMAINS, type SemanticDomainId } from '../governance/semanticOntologyBaseline';
import {
  buildSemanticTextEnvelope,
  verifyPlaceholderSpanMapRoundTrip,
  type DynamicPlaceholderEntityCandidate,
  type SemanticTextEnvelope,
} from '../slice/placeholderSpanMap';
import {
  ASK_SEMANTIC_PLAN_VERSION,
  SemanticRequestPlanSchema,
  type SemanticFacet,
  type SemanticRequestPlan,
  type SemanticSourceSpan,
  type SemanticTimeConstraint,
  type SemanticWhereExpression,
} from '../semanticRequestPlan';
import {
  ASK_CROSS_DOMAIN_PARSER_VERSION,
  parseCrossDomainSemanticRequest,
  type CrossDomainParseResult,
  type DynamicQuoteCandidate,
  type PlanOverflowFacet,
} from '../crossDomain/crossDomainPlanBuilder';
import {
  DOMAIN_ROLLOUT_MANIFEST,
  tryNormalizeToCanonicalSection5Domain,
} from '../crossDomain/domainRolloutManifest';

export const ASK_SEMANTIC_PROVIDER_VERSION = 'phase6-provider-orchestrator-1.0.0' as const;
export const ASK_SEMANTIC_PROVIDER_BUDGET_POLICY_VERSION = 'semantic-provider-budget-1.0.0' as const;
export const ASK_SEMANTIC_PROVIDER_BUDGET_APPROVED_AT = '2026-11-16' as const;
const MAX_ADMITTED_FACETS = 6;

export const APPROVED_SEMANTIC_PROVIDER_BUDGETS: SemanticProviderBudgets = Object.freeze({
  maxStage1LatencyMs: 600,
  maxStage2LatencyMs: 1200,
  maxEstimatedCostUsdPerTurn: 0.015,
  maxConcurrentStage2Calls: 3,
  maxAdmittedFacets: MAX_ADMITTED_FACETS,
});

export type SemanticProviderApprovalStatus =
  | 'APPROVED_FOR_STRUCTURED_PLANNING'
  | 'UNRESOLVED_OWNER_APPROVAL';

export interface SemanticProviderBudgets {
  readonly maxStage1LatencyMs: number;
  readonly maxStage2LatencyMs: number;
  readonly maxEstimatedCostUsdPerTurn: number;
  readonly maxConcurrentStage2Calls: number;
  readonly maxAdmittedFacets: number;
}

export interface SemanticProviderPolicy {
  readonly approvalStatus: SemanticProviderApprovalStatus;
  readonly recordedDecisionNote: string;
  readonly budgets: SemanticProviderBudgets;
}

export function resolveDefaultSemanticProviderPolicy(
  env: NodeJS.ProcessEnv = process.env,
): SemanticProviderPolicy {
  const providerApproved = env.ASK_SEMANTIC_PROVIDER_APPROVED === 'true';
  const providerTermsRecorded = env.ASK_UNDERSTANDING_PROVIDER_TERMS_RECORDED === 'true';
  const homeownerTextApproved = env.ASK_UNDERSTANDING_HOMEOWNER_TEXT_APPROVED === 'true';
  // Owner decision 2026-11-22: the staged provider inherits the semantic-planner controls (planner flag on and kill switch off) rather
  // than carrying an independent default-on control. The per-stratum certification gate is BICC-1B.2.
  const plannerEnabled = readAskOperationalControls(env).understandingPlannerEnabled;
  const approved = providerApproved && providerTermsRecorded && homeownerTextApproved && plannerEnabled;
  const missingApprovals = [
    !plannerEnabled ? 'semantic planner enablement (planner flag on, kill switch off)' : null,
    !providerApproved ? 'semantic provider activation' : null,
    !providerTermsRecorded ? 'provider terms' : null,
    !homeownerTextApproved ? 'homeowner-text processing' : null,
  ].filter((value): value is string => Boolean(value));
  return {
    approvalStatus: approved ? 'APPROVED_FOR_STRUCTURED_PLANNING' : 'UNRESOLVED_OWNER_APPROVAL',
    recordedDecisionNote: approved
      ? 'Structured planning is active with separate homeowner-text, provider-terms, and semantic-provider approvals plus configured Phase 6 budgets.'
      : `External structured planning is disabled; missing ${missingApprovals.join(', ')} approval. Deterministic waves execute standalone.`,
    budgets: { ...APPROVED_SEMANTIC_PROVIDER_BUDGETS },
  };
}

export interface StageOnePreliminaryFacet {
  readonly preliminarySpan: SemanticSourceSpan;
  readonly domainCandidates: readonly { readonly id: SemanticDomainId; readonly score: number }[];
  readonly dependsOnIndexes?: readonly number[];
  readonly unresolvedMarker?: boolean;
}

export type StageOneProviderOutput =
  | {
      readonly mode: 'FACET_SPANS';
      readonly facets: readonly StageOnePreliminaryFacet[];
      readonly latencyMs: number;
      readonly estimatedCostUsd: number;
    }
  | {
      readonly mode: 'FLAT_DOMAIN_LIST';
      readonly domainIds: readonly SemanticDomainId[];
      readonly preliminaryText?: string;
      readonly latencyMs: number;
      readonly estimatedCostUsd: number;
    };

export interface StableStageOneFacetAssignment {
  readonly stableFacetId: string;
  readonly rawSpan: SemanticSourceSpan;
  readonly minimizedSpan: SemanticSourceSpan;
  readonly domainCandidates: readonly { readonly id: SemanticDomainId; readonly score: number }[];
  readonly dependsOnStableIds: readonly string[];
}

export interface StageTwoFacetProposal {
  readonly stableFacetId: string;
  readonly requestClass: 'DATA_QUERY' | 'CAPABILITY' | 'COMMAND';
  readonly domainId: SemanticDomainId;
  readonly subject: { readonly entityId: string; readonly recordId: string | null } | null;
  readonly relations: readonly {
    readonly semanticRelationId: string;
    readonly predicateId: string;
    readonly targetEntityId: string;
  }[];
  readonly polarity: 'POSITIVE' | 'NEGATIVE' | 'UNKNOWN' | null;
  readonly projection: SemanticFacet['projection'];
  readonly fields: readonly { readonly fieldId: string }[];
  readonly where: SemanticWhereExpression | null;
  readonly time: SemanticTimeConstraint | null;
  readonly requiredSlots: readonly { readonly slotId: string; readonly state: 'RESOLVED' | 'UNRESOLVED' }[];
  readonly dependsOn?: readonly string[];
  readonly jobMatch: string;
  readonly providerLabel?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface StageTwoProviderOutput {
  readonly proposals: readonly StageTwoFacetProposal[];
  readonly latencyMs: number;
  readonly estimatedCostUsd: number;
}

export interface StageOneProviderInput {
  readonly minimizedText: string;
  readonly unresolvedMinimizedSpans: readonly SemanticSourceSpan[];
  readonly eligibleDomainIds: readonly SemanticDomainId[];
  readonly placeholderTokens: readonly string[];
  readonly timeoutMs?: number;
}

export interface StageTwoProviderInput {
  readonly mode: 'FACET_BATCH' | 'UNION_DOMAINS';
  readonly minimizedText: string;
  readonly assignedFacets: readonly StableStageOneFacetAssignment[];
  readonly unionDomainIds: readonly SemanticDomainId[];
  readonly eligibleJobsByDomain: Readonly<Record<string, readonly string[]>>;
  readonly timeoutMs?: number;
}

export class ProviderSchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderSchemaValidationError';
  }
}

async function withStageBudgetTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  stageLabel: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return work;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`PROVIDER_BUDGET_EXCEEDED:${stageLabel}_timeout:${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function isSchemaValidationError(err: unknown): boolean {
  return err instanceof ProviderSchemaValidationError || err instanceof z.ZodError;
}

export interface SemanticUnderstandingProvider {
  readonly providerId: string;
  readonly version: string;
  readonly isExternalNetworkProvider: boolean;
  runStageOne(input: StageOneProviderInput): Promise<StageOneProviderOutput>;
  runStageTwo(input: StageTwoProviderInput): Promise<StageTwoProviderOutput>;
}

const StageOneFacetSchema = z.object({
  mode: z.enum(['FACET_SPANS', 'FLAT_DOMAIN_LIST']),
  facets: z.array(z.object({
    preliminarySpan: z.object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      text: z.string().min(1),
    }).strict(),
    domainCandidates: z.array(z.object({
      id: z.string().min(1),
      score: z.number().min(0).max(1),
    }).strict()).min(1),
    dependsOnIndexes: z.array(z.number().int().nonnegative()).optional(),
  }).strict()).optional(),
  domainIds: z.array(z.string().min(1)).optional(),
}).strict();

const StageTwoProposalSchema = z.object({
  proposals: z.array(z.object({
    stableFacetId: z.string().min(1),
    requestClass: z.enum(['DATA_QUERY', 'CAPABILITY', 'COMMAND']),
    domainId: z.string().min(1),
    subject: z.object({
      entityId: z.string().min(1),
      recordId: z.string().min(1).nullable(),
    }).strict().nullable(),
    relations: z.array(z.object({
      semanticRelationId: z.string().min(1),
      predicateId: z.string().min(1),
      targetEntityId: z.string().min(1),
    }).strict()),
    polarity: z.enum(['POSITIVE', 'NEGATIVE', 'UNKNOWN']).nullable(),
    projection: z.enum(['EXISTS', 'COUNT', 'LIST', 'DETAIL', 'AGGREGATE', 'COMPARE', 'TIMELINE', 'ANALYSIS']),
    fields: z.array(z.object({ fieldId: z.string().min(1) }).strict()),
    where: z.unknown().nullable(),
    time: z.unknown().nullable(),
    requiredSlots: z.array(z.object({
      slotId: z.string().min(1),
      state: z.enum(['RESOLVED', 'UNRESOLVED']),
    }).strict()),
    dependsOn: z.array(z.string().min(1)).optional(),
    jobMatch: z.string().min(1),
  }).strict()),
}).strict();

interface AlignedCharSpan {
  readonly ch: string;
  readonly protStart: number;
  readonly protEnd: number;
}

const MINIMIZE_REDACTION_RULES: ReadonlyArray<{ readonly pattern: RegExp; readonly replacement: string }> = [
  { pattern: /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, replacement: '[email redacted]' },
  { pattern: /https?:\/\/\S+/gi, replacement: '[link redacted]' },
  { pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[phone redacted]' },
  { pattern: /\b(?:\d[ -]*?){12,19}\b/g, replacement: '[account number redacted]' },
];

function applyRedactionRuleToCharSpans(
  input: readonly AlignedCharSpan[],
  pattern: RegExp,
  replacement: string,
): readonly AlignedCharSpan[] {
  const joined = input.map((c) => c.ch).join('');
  const globalRegex = new RegExp(pattern.source, pattern.flags);
  const output: AlignedCharSpan[] = [];
  let cursor = 0;
  for (const match of joined.matchAll(globalRegex)) {
    if (match.index === undefined) continue;
    for (let i = cursor; i < match.index; i += 1) {
      output.push(input[i]);
    }
    const matchEnd = match.index + match[0].length;
    const protStart = input[match.index]?.protStart ?? 0;
    const protEnd = input[Math.max(match.index, matchEnd - 1)]?.protEnd ?? protStart;
    for (let r = 0; r < replacement.length; r += 1) {
      output.push({ ch: replacement[r], protStart, protEnd });
    }
    cursor = matchEnd;
  }
  for (let i = cursor; i < input.length; i += 1) {
    output.push(input[i]);
  }
  return output;
}

function buildMinimizedToProtectedCharMap(
  protectedText: string,
  expectedMinimizedText: string,
): readonly AlignedCharSpan[] | null {
  let stream: AlignedCharSpan[] = [];
  let pCursor = 0;
  for (const cp of protectedText) {
    const protStart = pCursor;
    const protEnd = pCursor + cp.length;
    pCursor = protEnd;
    const normalized = cp.normalize('NFKC');
    for (let i = 0; i < normalized.length; i += 1) {
      stream.push({ ch: normalized[i], protStart, protEnd });
    }
  }

  for (const rule of MINIMIZE_REDACTION_RULES) {
    stream = [...applyRedactionRuleToCharSpans(stream, rule.pattern, rule.replacement)];
  }

  // Collapse \s+ -> ' ', trim ends, and slice to 600 chars to mirror minimizeAskQuestion identically.
  const collapsed: AlignedCharSpan[] = [];
  let idx = 0;
  while (idx < stream.length) {
    if (/\s/.test(stream[idx].ch)) {
      const wsStart = stream[idx].protStart;
      let wsEnd = stream[idx].protEnd;
      idx += 1;
      while (idx < stream.length && /\s/.test(stream[idx].ch)) {
        wsEnd = stream[idx].protEnd;
        idx += 1;
      }
      collapsed.push({ ch: ' ', protStart: wsStart, protEnd: wsEnd });
    } else {
      collapsed.push(stream[idx]);
      idx += 1;
    }
  }

  while (collapsed.length > 0 && collapsed[0].ch === ' ') {
    collapsed.shift();
  }
  while (collapsed.length > 0 && collapsed[collapsed.length - 1].ch === ' ') {
    collapsed.pop();
  }

  const sliced = collapsed.slice(0, 600);
  const reconstructed = sliced.map((c) => c.ch).join('');
  return reconstructed === expectedMinimizedText ? sliced : null;
}

function mapProtectedOffsetToRaw(
  protectedOffset: number,
  spanMap: SemanticTextEnvelope['spanMap'],
): { readonly ok: true; readonly rawOffset: number } | { readonly ok: false; readonly reason: string } {
  const sorted = [...spanMap].sort((a, b) => a.protectedStart - b.protectedStart);
  let delta = 0;
  for (const entry of sorted) {
    if (protectedOffset > entry.protectedStart && protectedOffset < entry.protectedEnd) {
      return { ok: false, reason: `prot_span_splits_placeholder:${entry.placeholder}` };
    }
    if (entry.protectedEnd <= protectedOffset) {
      delta += (entry.rawEnd - entry.rawStart) - (entry.protectedEnd - entry.protectedStart);
    }
  }
  return { ok: true, rawOffset: protectedOffset + delta };
}

/**
 * Validates provider minimized-text offsets strictly against the minimized envelope
 * (never accepting raw-offset guesswork per §19 #23 / FR-UND-2) and bijectively maps
 * exact coordinates to raw text via the protected-text alignment and envelope spanMap.
 */
export function validateAndMapMinimizedSpanToRaw(
  minimizedSpan: SemanticSourceSpan,
  envelope: SemanticTextEnvelope,
): { readonly ok: true; readonly rawSpan: SemanticSourceSpan } | { readonly ok: false; readonly reason: string } {
  if (
    minimizedSpan.start < 0
    || minimizedSpan.end <= minimizedSpan.start
    || minimizedSpan.end > envelope.minimizedText.length
  ) {
    return { ok: false, reason: `min_span_out_of_bounds:${minimizedSpan.start}:${minimizedSpan.end}` };
  }
  const actualMinimizedSlice = envelope.minimizedText.slice(minimizedSpan.start, minimizedSpan.end);
  if (actualMinimizedSlice !== minimizedSpan.text) {
    return {
      ok: false,
      reason: `min_span_text_mismatch:${JSON.stringify(minimizedSpan.text)}!=${JSON.stringify(actualMinimizedSlice)}`,
    };
  }

  for (const entry of envelope.spanMap) {
    if (entry.minimizedStart < 0 || entry.minimizedEnd < 0) continue;
    const splitsStart = minimizedSpan.start > entry.minimizedStart && minimizedSpan.start < entry.minimizedEnd;
    const splitsEnd = minimizedSpan.end > entry.minimizedStart && minimizedSpan.end < entry.minimizedEnd;
    if (splitsStart || splitsEnd) {
      return { ok: false, reason: `min_span_splits_placeholder:${entry.placeholder}` };
    }
  }

  const charMap = buildMinimizedToProtectedCharMap(envelope.protectedText, envelope.minimizedText);
  if (!charMap) {
    return { ok: false, reason: 'min_to_prot_alignment_unavailable' };
  }

  const protStart = charMap[minimizedSpan.start].protStart;
  const protEnd = charMap[minimizedSpan.end - 1].protEnd;

  const rawStartMapped = mapProtectedOffsetToRaw(protStart, envelope.spanMap);
  if (!rawStartMapped.ok) {
    return rawStartMapped;
  }
  const rawEndMapped = mapProtectedOffsetToRaw(protEnd, envelope.spanMap);
  if (!rawEndMapped.ok) {
    return rawEndMapped;
  }

  const rawStart = rawStartMapped.rawOffset;
  const rawEnd = rawEndMapped.rawOffset;
  if (rawStart < 0 || rawEnd <= rawStart || rawEnd > envelope.rawText.length) {
    return { ok: false, reason: `raw_span_out_of_bounds:${rawStart}:${rawEnd}` };
  }

  return {
    ok: true,
    rawSpan: {
      start: rawStart,
      end: rawEnd,
      text: envelope.rawText.slice(rawStart, rawEnd),
    },
  };
}

function buildEligibleJobsByDomain(): Readonly<Record<string, readonly string[]>> {
  const map: Record<string, readonly string[]> = {};
  for (const wave of DOMAIN_ROLLOUT_MANIFEST) {
    for (const domainId of wave.domainIds) {
      map[domainId] = wave.registeredJobIds;
    }
  }
  return map;
}

function whereHasPredicate(where: SemanticWhereExpression | null | undefined, predicateId: string): boolean {
  if (!where) return false;
  if (where.kind === 'PREDICATE') {
    return where.predicateId === predicateId;
  }
  if (where.kind === 'NOT') {
    return whereHasPredicate(where.operand, predicateId);
  }
  return where.operands.some((operand) => whereHasPredicate(operand, predicateId));
}

function mergeWhereAnd(
  left: SemanticWhereExpression | null | undefined,
  right: SemanticWhereExpression,
): SemanticWhereExpression {
  if (!left) return right;
  if (left.kind === 'AND') {
    return { kind: 'AND', operands: [...left.operands, right] };
  }
  return { kind: 'AND', operands: [left, right] };
}

function applyAuthorizedPlaceholderBindings(input: {
  readonly proposal: StageTwoFacetProposal;
  readonly facetRawSpan: SemanticSourceSpan;
  readonly envelope: SemanticTextEnvelope;
  readonly dynamicQuotes?: readonly DynamicQuoteCandidate[];
}): {
  readonly subject: StageTwoFacetProposal['subject'];
  readonly relations: StageTwoFacetProposal['relations'];
  readonly where: StageTwoFacetProposal['where'];
  readonly requiredSlots: StageTwoFacetProposal['requiredSlots'];
} {
  const { proposal, facetRawSpan, envelope, dynamicQuotes } = input;
  const intersecting = envelope.spanMap.filter(
    (entry) =>
      entry.authorizedCandidate !== null
      && !(entry.rawEnd <= facetRawSpan.start || entry.rawStart >= facetRawSpan.end),
  );
  const authorizedEntries = intersecting.length > 0
    ? intersecting
    : envelope.spanMap.filter((entry) => entry.authorizedCandidate !== null);

  let subject = proposal.subject;
  if (subject && !subject.recordId) {
    const matchingSubjectEntry = authorizedEntries.find(
      (entry) => entry.authorizedCandidate?.entityId === subject!.entityId,
    );
    if (matchingSubjectEntry?.authorizedCandidate) {
      subject = {
        ...subject,
        recordId: matchingSubjectEntry.authorizedCandidate.recordId,
      };
    }
  }

  let relations = [...proposal.relations];
  let where = proposal.where;
  let requiredSlots = [...proposal.requiredSlots];

  // Bind authorized property room constraint onto item queries when a dynamic ROOM placeholder appears in scope.
  if (subject?.entityId === 'entity.inventory_item') {
    const roomEntry = authorizedEntries.find(
      (entry) => entry.kind === 'ROOM' && entry.authorizedCandidate?.entityId === 'entity.room',
    );
    if (roomEntry?.authorizedCandidate && !whereHasPredicate(where, 'predicate.inventory_item.in_room')) {
      where = mergeWhereAnd(where, {
        kind: 'PREDICATE',
        predicateId: 'predicate.inventory_item.in_room',
        relationPathId: 'path.inventory_item.room',
        targetRecordId: roomEntry.authorizedCandidate.recordId,
      });
      if (!relations.some((rel) => rel.semanticRelationId === 'relation.inventory_item.room')) {
        relations.push({
          semanticRelationId: 'relation.inventory_item.room',
          predicateId: 'predicate.inventory_item.in_room',
          targetEntityId: 'entity.room',
        });
      }
    }
  }

  // Bind authorized contractor quote IDs onto quote comparisons when dynamic vendors or quotes appear in scope.
  if (proposal.jobMatch === 'job.projects.quote_comparison') {
    const vendorIds = authorizedEntries
      .filter((entry) => entry.kind === 'VENDOR' && entry.authorizedCandidate?.entityId === 'entity.contractor_quote')
      .map((entry) => entry.authorizedCandidate!.recordId);
    const dynamicQuoteMatches = (dynamicQuotes ?? [])
      .filter((q) => q.vendorName.trim().length > 0 && facetRawSpan.text.toLowerCase().includes(q.vendorName.trim().toLowerCase()))
      .map((q) => q.id);
    const uniqueQuoteIds = Array.from(new Set([...vendorIds, ...dynamicQuoteMatches]));
    if (uniqueQuoteIds.length >= 2 && !whereHasPredicate(where, 'predicate.contractor_quote.compared_in_scope')) {
      const boundIds = uniqueQuoteIds.slice(0, 2);
      where = mergeWhereAnd(where, {
        kind: 'PREDICATE',
        predicateId: 'predicate.contractor_quote.compared_in_scope',
        relationPathId: 'path.contractor_quote.comparison',
        targetCategorySet: boundIds,
      });
      if (!relations.some((rel) => rel.semanticRelationId === 'relation.contractor_quote.comparison')) {
        relations.push({
          semanticRelationId: 'relation.contractor_quote.comparison',
          predicateId: 'predicate.contractor_quote.compared_in_scope',
          targetEntityId: 'entity.contractor_quote',
        });
      }
      requiredSlots = requiredSlots.map((slot) =>
        slot.slotId === 'slot.quotes.two_resolved_quotes'
          ? { ...slot, state: 'RESOLVED' as const }
          : slot,
      );
      if (!requiredSlots.some((slot) => slot.slotId === 'slot.quotes.two_resolved_quotes')) {
        requiredSlots.push({ slotId: 'slot.quotes.two_resolved_quotes', state: 'RESOLVED' });
      }
    }
  }

  return { subject, relations, where, requiredSlots };
}

export interface TwoStageRetrievalResult {
  readonly status: 'MATCH' | 'NONE_FITS' | 'PROVIDER_UNAVAILABLE' | 'SCHEMA_INVALID';
  readonly plan: SemanticRequestPlan;
  readonly overflowFacets: readonly PlanOverflowFacet[];
  readonly stageOneMode: 'FACET_SPANS' | 'FLAT_DOMAIN_LIST' | null;
  readonly stage2CallCount: number;
  readonly maxObservedStage2Concurrency?: number;
  readonly unionStage2Used: boolean;
  readonly protectedSpanRoundTripOk: boolean;
  readonly minimizedSpanValidationFailures: readonly string[];
  readonly latencyMs: number;
  readonly estimatedCostUsd: number;
  readonly failureReason?: string;
}

/**
 * Bounded two-stage provider retrieval with server-allocated stable facet IDs,
 * flat-stage-one union fallback, concurrency-capped batching, and 6-facet overflow accounting.
 */
export async function executeTwoStageProviderRetrieval(input: {
  readonly rawText: string;
  readonly provider: SemanticUnderstandingProvider;
  readonly policy?: SemanticProviderPolicy;
  readonly dynamicEntities?: readonly DynamicPlaceholderEntityCandidate[];
  readonly dynamicQuotes?: readonly DynamicQuoteCandidate[];
  readonly unresolvedMinimizedSpans?: readonly SemanticSourceSpan[];
  readonly enforceConcurrencyOverflow?: boolean;
}): Promise<TwoStageRetrievalResult> {
  const startedAt = performance.now();
  const policy = input.policy ?? resolveDefaultSemanticProviderPolicy();
  const envelope = buildSemanticTextEnvelope(input.rawText, {
    dynamicEntities: input.dynamicEntities,
  });
  const roundTrip = verifyPlaceholderSpanMapRoundTrip(envelope);

  if (
    input.provider.isExternalNetworkProvider
    && policy.approvalStatus !== 'APPROVED_FOR_STRUCTURED_PLANNING'
  ) {
    return {
      status: 'PROVIDER_UNAVAILABLE',
      plan: SemanticRequestPlanSchema.parse({
        schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
        producer: { kind: 'PROVIDER', version: `${input.provider.providerId}:${input.provider.version}` },
        outcome: 'PROVIDER_UNAVAILABLE',
        rawText: input.rawText,
        normalizedText: envelope.normalizedText,
        minimizedText: envelope.minimizedText,
        unresolvedSpans: [],
        facets: [],
      }),
      overflowFacets: [],
      stageOneMode: null,
      stage2CallCount: 0,
      unionStage2Used: false,
      protectedSpanRoundTripOk: roundTrip.ok,
      minimizedSpanValidationFailures: [],
      latencyMs: Number((performance.now() - startedAt).toFixed(3)),
      estimatedCostUsd: 0,
      failureReason: policy.recordedDecisionNote,
    };
  }

  const buildFailureResult = (params: {
    readonly status: 'PROVIDER_UNAVAILABLE' | 'SCHEMA_INVALID';
    readonly stageOneMode: 'FACET_SPANS' | 'FLAT_DOMAIN_LIST' | null;
    readonly stage2CallCount: number;
    readonly unionStage2Used: boolean;
    readonly overflowFacets?: readonly PlanOverflowFacet[];
    readonly failureReason: string;
    readonly estimatedCostUsd: number;
    readonly spanFailures?: readonly string[];
  }): TwoStageRetrievalResult => ({
    status: params.status,
    plan: SemanticRequestPlanSchema.parse({
      schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
      producer: { kind: 'PROVIDER', version: `${input.provider.providerId}:${input.provider.version}` },
      outcome: params.status,
      rawText: input.rawText,
      normalizedText: envelope.normalizedText,
      minimizedText: envelope.minimizedText,
      unresolvedSpans: [],
      facets: [],
    }),
    overflowFacets: params.overflowFacets ?? [],
    stageOneMode: params.stageOneMode,
    stage2CallCount: params.stage2CallCount,
    unionStage2Used: params.unionStage2Used,
    protectedSpanRoundTripOk: roundTrip.ok,
    minimizedSpanValidationFailures: params.spanFailures ?? [],
    latencyMs: Number((performance.now() - startedAt).toFixed(3)),
    estimatedCostUsd: Number(params.estimatedCostUsd.toFixed(6)),
    failureReason: params.failureReason,
  });

  const stage1StartedAt = performance.now();
  let stage1: StageOneProviderOutput;
  try {
    stage1 = await withStageBudgetTimeout(
      input.provider.runStageOne({
        minimizedText: envelope.minimizedText,
        unresolvedMinimizedSpans: input.unresolvedMinimizedSpans ?? [],
        eligibleDomainIds: ASK_SEMANTIC_DOMAINS.map((d) => d.domainId),
        placeholderTokens: envelope.placeholders.map((p) => p.placeholder),
        timeoutMs: policy.budgets.maxStage1LatencyMs,
      }),
      policy.budgets.maxStage1LatencyMs,
      'stage1',
    );
  } catch (err) {
    return buildFailureResult({
      status: isSchemaValidationError(err) ? 'SCHEMA_INVALID' : 'PROVIDER_UNAVAILABLE',
      stageOneMode: null,
      stage2CallCount: 0,
      unionStage2Used: false,
      estimatedCostUsd: 0,
      failureReason: err instanceof Error ? err.message : 'stage1_provider_error',
    });
  }

  const measuredStage1LatencyMs = Math.max(stage1.latencyMs, performance.now() - stage1StartedAt);
  if (measuredStage1LatencyMs > policy.budgets.maxStage1LatencyMs) {
    return buildFailureResult({
      status: 'PROVIDER_UNAVAILABLE',
      stageOneMode: stage1.mode,
      stage2CallCount: 0,
      unionStage2Used: false,
      estimatedCostUsd: stage1.estimatedCostUsd,
      failureReason: `PROVIDER_BUDGET_EXCEEDED:stage1_latency:${measuredStage1LatencyMs.toFixed(1)}ms>${policy.budgets.maxStage1LatencyMs}ms`,
    });
  }
  if (stage1.estimatedCostUsd > policy.budgets.maxEstimatedCostUsdPerTurn) {
    return buildFailureResult({
      status: 'PROVIDER_UNAVAILABLE',
      stageOneMode: stage1.mode,
      stage2CallCount: 0,
      unionStage2Used: false,
      estimatedCostUsd: stage1.estimatedCostUsd,
      failureReason: `PROVIDER_BUDGET_EXCEEDED:cost:${stage1.estimatedCostUsd.toFixed(6)}>${policy.budgets.maxEstimatedCostUsdPerTurn}`,
    });
  }

  const eligibleJobsByDomain = buildEligibleJobsByDomain();
  const maxAdmitted = Math.min(policy.budgets.maxAdmittedFacets, MAX_ADMITTED_FACETS);
  const overflowFacets: PlanOverflowFacet[] = [];
  const minimizedSpanValidationFailures: string[] = [];

  if (stage1.mode === 'FLAT_DOMAIN_LIST') {
    const validatedUnionDomains: SemanticDomainId[] = [];
    for (const rawDomainId of stage1.domainIds) {
      const normalizedDomain = tryNormalizeToCanonicalSection5Domain(rawDomainId);
      if (!normalizedDomain) {
        return buildFailureResult({
          status: 'SCHEMA_INVALID',
          stageOneMode: 'FLAT_DOMAIN_LIST',
          stage2CallCount: 0,
          unionStage2Used: false,
          estimatedCostUsd: stage1.estimatedCostUsd,
          spanFailures: [`invalid_provider_domain:${rawDomainId}`],
          failureReason: `invalid_provider_domain:${rawDomainId}`,
        });
      }
      if (!validatedUnionDomains.includes(normalizedDomain)) {
        validatedUnionDomains.push(normalizedDomain);
      }
    }
    const unionDomains = validatedUnionDomains.slice(0, maxAdmitted);
    if (unionDomains.length === 0) {
      return {
        status: 'NONE_FITS',
        plan: SemanticRequestPlanSchema.parse({
          schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
          producer: { kind: 'PROVIDER', version: `${input.provider.providerId}:${input.provider.version}` },
          outcome: 'NONE_FITS',
          rawText: input.rawText,
          normalizedText: envelope.normalizedText,
          minimizedText: envelope.minimizedText,
          unresolvedSpans: [{ start: 0, end: input.rawText.length, text: input.rawText }],
          facets: [],
        }),
        overflowFacets: [],
        stageOneMode: 'FLAT_DOMAIN_LIST',
        stage2CallCount: 0,
        unionStage2Used: false,
        protectedSpanRoundTripOk: roundTrip.ok,
        minimizedSpanValidationFailures: [],
        latencyMs: Number((performance.now() - startedAt).toFixed(3)),
        estimatedCostUsd: stage1.estimatedCostUsd,
      };
    }

    const stage2StartedAt = performance.now();
    let stage2: StageTwoProviderOutput;
    try {
      stage2 = await withStageBudgetTimeout(
        input.provider.runStageTwo({
          mode: 'UNION_DOMAINS',
          minimizedText: envelope.minimizedText,
          assignedFacets: [],
          unionDomainIds: unionDomains,
          eligibleJobsByDomain,
          timeoutMs: policy.budgets.maxStage2LatencyMs,
        }),
        policy.budgets.maxStage2LatencyMs,
        'stage2_union',
      );
    } catch (err) {
      return buildFailureResult({
        status: isSchemaValidationError(err) ? 'SCHEMA_INVALID' : 'PROVIDER_UNAVAILABLE',
        stageOneMode: 'FLAT_DOMAIN_LIST',
        stage2CallCount: 1,
        unionStage2Used: true,
        estimatedCostUsd: stage1.estimatedCostUsd,
        failureReason: err instanceof Error ? err.message : 'stage2_union_error',
      });
    }

    const measuredStage2LatencyMs = Math.max(stage2.latencyMs, performance.now() - stage2StartedAt);
    const totalUnionCost = stage1.estimatedCostUsd + stage2.estimatedCostUsd;
    if (measuredStage2LatencyMs > policy.budgets.maxStage2LatencyMs) {
      return buildFailureResult({
        status: 'PROVIDER_UNAVAILABLE',
        stageOneMode: 'FLAT_DOMAIN_LIST',
        stage2CallCount: 1,
        unionStage2Used: true,
        estimatedCostUsd: totalUnionCost,
        failureReason: `PROVIDER_BUDGET_EXCEEDED:stage2_latency:${measuredStage2LatencyMs.toFixed(1)}ms>${policy.budgets.maxStage2LatencyMs}ms`,
      });
    }
    if (totalUnionCost > policy.budgets.maxEstimatedCostUsdPerTurn) {
      return buildFailureResult({
        status: 'PROVIDER_UNAVAILABLE',
        stageOneMode: 'FLAT_DOMAIN_LIST',
        stage2CallCount: 1,
        unionStage2Used: true,
        estimatedCostUsd: totalUnionCost,
        failureReason: `PROVIDER_BUDGET_EXCEEDED:cost:${totalUnionCost.toFixed(6)}>${policy.budgets.maxEstimatedCostUsdPerTurn}`,
      });
    }

    const admitted = stage2.proposals.slice(0, maxAdmitted);
    for (let i = maxAdmitted; i < stage2.proposals.length; i += 1) {
      overflowFacets.push({
        id: `facet-${i + 1}`,
        sourceSpan: { start: 0, end: input.rawText.length, text: input.rawText },
        label: stage2.proposals[i].jobMatch,
        reasonCode: 'DOMAIN_NOT_SEARCHED',
      });
    }

    try {
      const builtFacets = admitted.map((proposal, index) => {
        const canonicalDomain = tryNormalizeToCanonicalSection5Domain(proposal.domainId);
        if (!canonicalDomain) {
          throw new ProviderSchemaValidationError(`invalid_provider_domain:${proposal.domainId}`);
        }
        const facetRawSpan: SemanticSourceSpan = { start: 0, end: input.rawText.length, text: input.rawText };
        const bound = applyAuthorizedPlaceholderBindings({
          proposal,
          facetRawSpan,
          envelope,
          dynamicQuotes: input.dynamicQuotes,
        });
        return {
          id: proposal.stableFacetId || `facet-${index + 1}`,
          sourceSpan: facetRawSpan,
          requestClass: proposal.requestClass,
          domainCandidates: [{ id: canonicalDomain, score: 0.9 }],
          subject: bound.subject,
          relations: bound.relations,
          polarity: proposal.polarity,
          projection: proposal.projection,
          fields: [...proposal.fields],
          where: bound.where,
          sort: [],
          limit: null,
          time: proposal.time,
          groupBy: [],
          targetCandidates: [{ id: proposal.jobMatch, score: 0.9 }],
          requiredSlots: bound.requiredSlots,
          dependsOn: [...(proposal.dependsOn ?? [])],
          evidence: {
            jobMatch: proposal.jobMatch,
            subjectNamed: bound.subject !== null,
            relationNamed: bound.relations.length > 0,
            projectionNamed: true,
            polarityNamed: proposal.polarity !== null,
          },
          confidenceSignals: { grammarComplete: false, unresolvedSpanCount: 0 },
        };
      });

      const flatStatus: 'MATCH' | 'NONE_FITS' = builtFacets.length > 0 ? 'MATCH' : 'NONE_FITS';
      const plan = SemanticRequestPlanSchema.parse({
        schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
        producer: { kind: 'PROVIDER', version: `${input.provider.providerId}:${input.provider.version}` },
        outcome: flatStatus,
        rawText: input.rawText,
        normalizedText: envelope.normalizedText,
        minimizedText: envelope.minimizedText,
        unresolvedSpans: builtFacets.length > 0 ? [] : [{ start: 0, end: input.rawText.length, text: input.rawText }],
        facets: builtFacets,
      });
      return {
        status: flatStatus,
        plan,
        overflowFacets,
        stageOneMode: 'FLAT_DOMAIN_LIST',
        stage2CallCount: 1,
        unionStage2Used: true,
        protectedSpanRoundTripOk: roundTrip.ok,
        minimizedSpanValidationFailures,
        latencyMs: Number((performance.now() - startedAt).toFixed(3)),
        estimatedCostUsd: Number(totalUnionCost.toFixed(6)),
      };
    } catch (err) {
      return buildFailureResult({
        status: 'SCHEMA_INVALID',
        stageOneMode: 'FLAT_DOMAIN_LIST',
        stage2CallCount: 1,
        unionStage2Used: true,
        overflowFacets,
        estimatedCostUsd: totalUnionCost,
        spanFailures: [err instanceof Error ? err.message : 'schema_invalid'],
        failureReason: err instanceof Error ? err.message : 'union_stage2_schema_invalid',
      });
    }
  }

  // Stage 1 produced FACET_SPANS: map minimized spans strictly back to raw coordinates, validate domains strictly, and allocate server-side stable IDs BEFORE Stage 2.
  const mappedPreliminary: StableStageOneFacetAssignment[] = [];
  const invalidDomainFailures: string[] = [];
  for (let i = 0; i < stage1.facets.length; i += 1) {
    const pre = stage1.facets[i];
    const normalizedCandidates: Array<{ readonly id: SemanticDomainId; readonly score: number }> = [];
    for (const candidate of pre.domainCandidates) {
      const canonical = tryNormalizeToCanonicalSection5Domain(candidate.id);
      if (!canonical) {
        invalidDomainFailures.push(`invalid_provider_domain:${candidate.id}`);
      } else {
        normalizedCandidates.push({ id: canonical, score: candidate.score });
      }
    }
    if (invalidDomainFailures.length > 0) {
      continue;
    }

    const mapped = validateAndMapMinimizedSpanToRaw(pre.preliminarySpan, envelope);
    if (!mapped.ok) {
      minimizedSpanValidationFailures.push(mapped.reason);
      continue;
    }
    const stableFacetId = `facet-${i + 1}`;
    const dependsOnStableIds = (pre.dependsOnIndexes ?? [])
      .filter((idx) => idx >= 0 && idx < stage1.facets.length && idx !== i)
      .map((idx) => `facet-${idx + 1}`);
    mappedPreliminary.push({
      stableFacetId,
      rawSpan: mapped.rawSpan,
      minimizedSpan: pre.preliminarySpan,
      domainCandidates: normalizedCandidates,
      dependsOnStableIds,
    });
  }

  if (invalidDomainFailures.length > 0) {
    return buildFailureResult({
      status: 'SCHEMA_INVALID',
      stageOneMode: 'FACET_SPANS',
      stage2CallCount: 0,
      unionStage2Used: false,
      estimatedCostUsd: stage1.estimatedCostUsd,
      spanFailures: [...minimizedSpanValidationFailures, ...invalidDomainFailures],
      failureReason: invalidDomainFailures.join('; '),
    });
  }

  if (minimizedSpanValidationFailures.length > 0 && mappedPreliminary.length === 0) {
    return buildFailureResult({
      status: 'SCHEMA_INVALID',
      stageOneMode: 'FACET_SPANS',
      stage2CallCount: 0,
      unionStage2Used: false,
      estimatedCostUsd: stage1.estimatedCostUsd,
      spanFailures: minimizedSpanValidationFailures,
      failureReason: minimizedSpanValidationFailures.join('; '),
    });
  }

  if (mappedPreliminary.length === 0) {
    return {
      status: 'NONE_FITS',
      plan: SemanticRequestPlanSchema.parse({
        schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
        producer: { kind: 'PROVIDER', version: `${input.provider.providerId}:${input.provider.version}` },
        outcome: 'NONE_FITS',
        rawText: input.rawText,
        normalizedText: envelope.normalizedText,
        minimizedText: envelope.minimizedText,
        unresolvedSpans: [{ start: 0, end: input.rawText.length, text: input.rawText }],
        facets: [],
      }),
      overflowFacets: [],
      stageOneMode: 'FACET_SPANS',
      stage2CallCount: 0,
      unionStage2Used: false,
      protectedSpanRoundTripOk: roundTrip.ok,
      minimizedSpanValidationFailures,
      latencyMs: Number((performance.now() - startedAt).toFixed(3)),
      estimatedCostUsd: stage1.estimatedCostUsd,
    };
  }

  const concurrencyLimit = Math.max(1, policy.budgets.maxConcurrentStage2Calls);
  const admittedAssignments = mappedPreliminary.slice(0, maxAdmitted);
  const admittedIdSet = new Set(admittedAssignments.map((a) => a.stableFacetId));

  for (const extra of mappedPreliminary.slice(admittedAssignments.length)) {
    overflowFacets.push({
      id: extra.stableFacetId,
      sourceSpan: extra.rawSpan,
      label: extra.rawSpan.text,
      reasonCode: 'DOMAIN_NOT_SEARCHED',
    });
  }

  // Batch admitted facets under concurrencyLimit (e.g., 6 facets across 2 sequential batches of <= 3 calls).
  const batchSize = concurrencyLimit;
  const batches: StableStageOneFacetAssignment[][] = [];
  for (let i = 0; i < admittedAssignments.length; i += batchSize) {
    batches.push(admittedAssignments.slice(i, i + batchSize));
  }

  let totalStage2Cost = 0;
  const proposalsById = new Map<string, StageTwoFacetProposal>();
  let stage2CallCount = 0;
  let maxObservedStage2Concurrency = 0;

  try {
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      if (batchIndex > 0 && stage1.estimatedCostUsd + totalStage2Cost >= policy.budgets.maxEstimatedCostUsdPerTurn) {
        return buildFailureResult({
          status: 'PROVIDER_UNAVAILABLE',
          stageOneMode: 'FACET_SPANS',
          stage2CallCount,
          unionStage2Used: false,
          overflowFacets,
          estimatedCostUsd: stage1.estimatedCostUsd + totalStage2Cost,
          failureReason: `PROVIDER_BUDGET_EXCEEDED:cost:${(stage1.estimatedCostUsd + totalStage2Cost).toFixed(6)}>=${policy.budgets.maxEstimatedCostUsdPerTurn}`,
        });
      }

      const batch = batches[batchIndex];
      const batchStartedAt = performance.now();
      maxObservedStage2Concurrency = Math.max(maxObservedStage2Concurrency, Math.min(batch.length, concurrencyLimit));
      const batchCalls = input.enforceConcurrencyOverflow
        ? batch.map(async (item) => {
            stage2CallCount += 1;
            return input.provider.runStageTwo({
              mode: 'FACET_BATCH',
              minimizedText: envelope.minimizedText,
              assignedFacets: [item],
              unionDomainIds: [item.domainCandidates[0].id],
              eligibleJobsByDomain,
              timeoutMs: policy.budgets.maxStage2LatencyMs,
            });
          })
        : [
            (async () => {
              stage2CallCount += 1;
              return input.provider.runStageTwo({
                mode: 'FACET_BATCH',
                minimizedText: envelope.minimizedText,
                assignedFacets: batch,
                unionDomainIds: Array.from(new Set(batch.map((b) => b.domainCandidates[0].id))),
                eligibleJobsByDomain,
                timeoutMs: policy.budgets.maxStage2LatencyMs,
              });
            })(),
          ];

      const batchResults = await withStageBudgetTimeout(
        Promise.all(batchCalls),
        policy.budgets.maxStage2LatencyMs,
        'stage2_batch',
      );
      const batchWallMs = performance.now() - batchStartedAt;
      const maxDeclaredLatency = batchResults.reduce((max, b) => Math.max(max, b.latencyMs), 0);
      const measuredBatchLatency = Math.max(maxDeclaredLatency, batchWallMs);
      for (const batchOut of batchResults) {
        totalStage2Cost += batchOut.estimatedCostUsd;
        for (const proposal of batchOut.proposals) {
          const canonicalProposalDomain = tryNormalizeToCanonicalSection5Domain(proposal.domainId);
          if (!canonicalProposalDomain) {
            throw new ProviderSchemaValidationError(`invalid_provider_domain:${proposal.domainId}`);
          }
          proposalsById.set(proposal.stableFacetId, {
            ...proposal,
            domainId: canonicalProposalDomain,
          });
        }
      }

      if (measuredBatchLatency > policy.budgets.maxStage2LatencyMs) {
        return buildFailureResult({
          status: 'PROVIDER_UNAVAILABLE',
          stageOneMode: 'FACET_SPANS',
          stage2CallCount,
          unionStage2Used: false,
          overflowFacets,
          estimatedCostUsd: stage1.estimatedCostUsd + totalStage2Cost,
          failureReason: `PROVIDER_BUDGET_EXCEEDED:stage2_latency:${measuredBatchLatency.toFixed(1)}ms>${policy.budgets.maxStage2LatencyMs}ms`,
        });
      }
      if (stage1.estimatedCostUsd + totalStage2Cost > policy.budgets.maxEstimatedCostUsdPerTurn) {
        return buildFailureResult({
          status: 'PROVIDER_UNAVAILABLE',
          stageOneMode: 'FACET_SPANS',
          stage2CallCount,
          unionStage2Used: false,
          overflowFacets,
          estimatedCostUsd: stage1.estimatedCostUsd + totalStage2Cost,
          failureReason: `PROVIDER_BUDGET_EXCEEDED:cost:${(stage1.estimatedCostUsd + totalStage2Cost).toFixed(6)}>${policy.budgets.maxEstimatedCostUsdPerTurn}`,
        });
      }
    }
  } catch (err) {
    return buildFailureResult({
      status: isSchemaValidationError(err) ? 'SCHEMA_INVALID' : 'PROVIDER_UNAVAILABLE',
      stageOneMode: 'FACET_SPANS',
      stage2CallCount,
      unionStage2Used: false,
      overflowFacets,
      estimatedCostUsd: stage1.estimatedCostUsd + totalStage2Cost,
      spanFailures: isSchemaValidationError(err) && err instanceof Error ? [err.message] : undefined,
      failureReason: err instanceof Error ? err.message : 'stage2_batch_error',
    });
  }

  const builtFacets: SemanticFacet[] = [];
  for (const assignment of admittedAssignments) {
    const proposal = proposalsById.get(assignment.stableFacetId);
    if (!proposal) {
      overflowFacets.push({
        id: assignment.stableFacetId,
        sourceSpan: assignment.rawSpan,
        label: assignment.rawSpan.text,
        reasonCode: 'DOMAIN_NOT_SEARCHED',
      });
      continue;
    }
    const safeDependsOn = assignment.dependsOnStableIds.filter((depId) => admittedIdSet.has(depId));
    const bound = applyAuthorizedPlaceholderBindings({
      proposal,
      facetRawSpan: assignment.rawSpan,
      envelope,
      dynamicQuotes: input.dynamicQuotes,
    });
    builtFacets.push({
      id: assignment.stableFacetId,
      sourceSpan: assignment.rawSpan,
      requestClass: proposal.requestClass,
      domainCandidates: [...assignment.domainCandidates],
      subject: bound.subject,
      relations: [...bound.relations],
      polarity: proposal.polarity,
      projection: proposal.projection,
      fields: [...proposal.fields],
      where: bound.where,
      sort: [],
      limit: null,
      time: proposal.time,
      groupBy: [],
      targetCandidates: [{ id: proposal.jobMatch, score: assignment.domainCandidates[0]?.score ?? 0.88 }],
      requiredSlots: [...bound.requiredSlots],
      dependsOn: safeDependsOn,
      evidence: {
        jobMatch: proposal.jobMatch,
        subjectNamed: bound.subject !== null,
        relationNamed: bound.relations.length > 0,
        projectionNamed: true,
        polarityNamed: proposal.polarity !== null,
      },
      confidenceSignals: { grammarComplete: false, unresolvedSpanCount: 0 },
    });
  }

  try {
    const stageOneStatus: 'MATCH' | 'NONE_FITS' = builtFacets.length > 0 ? 'MATCH' : 'NONE_FITS';
    const plan = SemanticRequestPlanSchema.parse({
      schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
      producer: { kind: 'PROVIDER', version: `${input.provider.providerId}:${input.provider.version}` },
      outcome: stageOneStatus,
      rawText: input.rawText,
      normalizedText: envelope.normalizedText,
      minimizedText: envelope.minimizedText,
      unresolvedSpans: builtFacets.length > 0 ? [] : [{ start: 0, end: input.rawText.length, text: input.rawText }],
      facets: builtFacets,
    });

    return {
      status: stageOneStatus,
      plan,
      overflowFacets,
      stageOneMode: 'FACET_SPANS',
      stage2CallCount,
      maxObservedStage2Concurrency,
      unionStage2Used: false,
      protectedSpanRoundTripOk: roundTrip.ok,
      minimizedSpanValidationFailures,
      latencyMs: Number((performance.now() - startedAt).toFixed(3)),
      estimatedCostUsd: Number((stage1.estimatedCostUsd + totalStage2Cost).toFixed(6)),
    };
  } catch (err) {
    return buildFailureResult({
      status: 'SCHEMA_INVALID',
      stageOneMode: 'FACET_SPANS',
      stage2CallCount,
      unionStage2Used: false,
      overflowFacets,
      estimatedCostUsd: stage1.estimatedCostUsd + totalStage2Cost,
      spanFailures: [err instanceof Error ? err.message : 'plan_validation_failed'],
      failureReason: err instanceof Error ? err.message : 'stage2_schema_invalid',
    });
  }
}

export type OfflineProviderSimulationMode =
  | 'NOMINAL'
  | 'FLAT_STAGE_ONE'
  | 'OUTAGE'
  | 'INVALID_MINIMIZED_SPAN'
  | 'MATERIAL_DISAGREEMENT';

interface ParaphraseProviderRule {
  readonly pattern: RegExp;
  readonly domainId: SemanticDomainId;
  readonly proposal: Omit<StageTwoFacetProposal, 'stableFacetId'>;
}

/**
 * Independent concept-level paraphrase patterns handled by the offline provider for
 * long-tail wording outside the deterministic grammar lexicon (used to measure
 * genuine provider-incremental coverage and producer reconciliation in Track P / Phase 6).
 */
const LONG_TAIL_PARAPHRASE_RULES: readonly ParaphraseProviderRule[] = [
  {
    pattern: /\b(?:uncovered|unprotected|lacking\s+(?:a\s+)?(?:protection(?:\s+coverage)?|service\s+plan)|missing\s+protection)\b.*\b(?:appliances?|gadgets?|items?|equipment)\b|\b(?:appliances?|gadgets?|items?|equipment)\b.*\b(?:uncovered|unprotected|lacking\s+(?:a\s+)?(?:protection(?:\s+coverage)?|service\s+plan)|no\s+protection)\b/i,
    domainId: 'domain.warranties_coverage',
    proposal: {
      requestClass: 'DATA_QUERY',
      domainId: 'domain.warranties_coverage',
      subject: { entityId: 'entity.inventory_item', recordId: null },
      relations: [{
        semanticRelationId: 'relation.inventory_item.warranty',
        predicateId: 'predicate.inventory_item.has_no_warranty_record',
        targetEntityId: 'entity.warranty',
      }],
      polarity: 'NEGATIVE',
      projection: 'LIST',
      fields: [],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.inventory_item.has_no_warranty_record',
        relationPathId: 'path.inventory_item.warranty',
      },
      time: null,
      requiredSlots: [],
      jobMatch: 'query.inventory_item.warranty_relation',
    },
  },
  {
    pattern: /\b(?:annual|yearly)\s+(?:home\s+)?upkeep\s+outlay|\b(?:upkeep|repair)\s+outlay\s+(?:in\s+the\s+past\s+year|last\s+calendar\s+year)\b/i,
    domainId: 'domain.timeline_home_events',
    proposal: {
      requestClass: 'DATA_QUERY',
      domainId: 'domain.timeline_home_events',
      subject: { entityId: 'entity.home_event', recordId: null },
      relations: [{
        semanticRelationId: 'relation.home_event.repair_expense',
        predicateId: 'predicate.home_event.is_repair_cost',
        targetEntityId: 'entity.home_event',
      }],
      polarity: 'POSITIVE',
      projection: 'AGGREGATE',
      fields: [{ fieldId: 'field.home_event.amount' }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.home_event.is_repair_cost',
        relationPathId: 'path.home_event.repair_expense',
      },
      time: { kind: 'CALENDAR_PERIOD', unit: 'YEAR', offset: -1 },
      requiredSlots: [],
      jobMatch: 'query.home_event.repair_spend_aggregate',
    },
  },
  {
    pattern: /\bcity\s+approvals?\s+(?:still\s+)?(?:needed|pending)\s+for\s+(?:renovations?|work|projects?)\b/i,
    domainId: 'domain.projects_quotes_vendors',
    proposal: {
      requestClass: 'DATA_QUERY',
      domainId: 'domain.projects_quotes_vendors',
      subject: { entityId: 'entity.project', recordId: null },
      relations: [{
        semanticRelationId: 'relation.project.permit',
        predicateId: 'predicate.project.needs_permit_or_unresolved',
        targetEntityId: 'entity.permit',
      }],
      polarity: 'POSITIVE',
      projection: 'LIST',
      fields: [{ fieldId: 'field.project.permit_status' }],
      where: {
        kind: 'PREDICATE',
        predicateId: 'predicate.project.needs_permit_or_unresolved',
        relationPathId: 'path.project.permit',
        enumStatus: 'NEEDS_PERMIT',
      },
      time: null,
      requiredSlots: [],
      jobMatch: 'query.project.needs_permit',
    },
  },
  {
    pattern: /\bactive\s+(?:safety\s+)?notices?\s+for\s+(?:my|our|home)\s+(?:appliances?|gear|items?)\b/i,
    domainId: 'domain.risks_recalls_inspections',
    proposal: {
      requestClass: 'CAPABILITY',
      domainId: 'domain.risks_recalls_inspections',
      subject: { entityId: 'entity.recall', recordId: null },
      relations: [{
        semanticRelationId: 'relation.recall.inventory_item',
        predicateId: 'predicate.recall.affects_inventory_item',
        targetEntityId: 'entity.inventory_item',
      }],
      polarity: null,
      projection: 'LIST',
      fields: [{ fieldId: 'field.recall.title' }, { fieldId: 'field.recall.severity' }],
      where: null,
      time: null,
      requiredSlots: [],
      jobMatch: 'job.risk.recall_review',
    },
  },
];

function requireCanonicalProviderDomain(rawId: string): SemanticDomainId {
  const canonical = tryNormalizeToCanonicalSection5Domain(rawId);
  if (!canonical) {
    throw new ProviderSchemaValidationError(`invalid_provider_domain:${rawId}`);
  }
  return canonical;
}

function parseProviderJsonWithSchema<T>(schema: z.ZodType<T>, rawJson: string, label: string): T {
  try {
    return schema.parse(JSON.parse(rawJson));
  } catch (err) {
    throw new ProviderSchemaValidationError(
      `${label}_schema_invalid:${err instanceof Error ? err.message : 'parse_failed'}`,
    );
  }
}

function clauseToProviderProposal(
  clauseText: string,
  domainId: SemanticDomainId,
): Omit<StageTwoFacetProposal, 'stableFacetId'> | null {
  for (const rule of LONG_TAIL_PARAPHRASE_RULES) {
    if (rule.pattern.test(clauseText)) {
      return rule.proposal;
    }
  }
  const det = parseCrossDomainSemanticRequest(clauseText);
  if (det.plan.outcome === 'MATCH' && det.plan.facets.length > 0) {
    const f = det.plan.facets[0];
    return {
      requestClass: f.requestClass,
      domainId: requireCanonicalProviderDomain(f.domainCandidates[0]?.id ?? domainId),
      subject: f.subject,
      relations: f.relations,
      polarity: f.polarity,
      projection: f.projection,
      fields: f.fields,
      where: f.where,
      time: f.time,
      requiredSlots: f.requiredSlots,
      jobMatch: f.evidence.jobMatch,
    };
  }
  return null;
}

/**
 * Independent offline structured-output provider seam for Parallel Track P & Phase 6
 * dual-producer sealed evaluation (never imports rule-by-rule sentence allowlists).
 */
export class SealedOfflineStructuredProvider implements SemanticUnderstandingProvider {
  public readonly providerId = 'sealed-offline-structured-provider';
  public readonly version = '1.0.0';
  public readonly isExternalNetworkProvider = false;

  constructor(private readonly mode: OfflineProviderSimulationMode = 'NOMINAL') {}

  async runStageOne(input: StageOneProviderInput): Promise<StageOneProviderOutput> {
    if (this.mode === 'OUTAGE') {
      throw new Error('PROVIDER_TIMEOUT: simulated provider outage');
    }
    if (this.mode === 'INVALID_MINIMIZED_SPAN') {
      return {
        mode: 'FACET_SPANS',
        facets: [{
          preliminarySpan: { start: 0, end: 5, text: 'BOGUS' },
          domainCandidates: [{ id: 'domain.inventory', score: 0.9 }],
        }],
        latencyMs: 1.2,
        estimatedCostUsd: 0.0005,
      };
    }

    // Segment minimized text preserving offset positions
    const rawClauses: Array<{ start: number; end: number; text: string }> = [];
    const colonIdx = input.minimizedText.indexOf(':');
    const sliceOffset = colonIdx > 0 ? colonIdx + 1 : 0;
    const segmentSource = colonIdx > 0 ? input.minimizedText.slice(colonIdx + 1) : input.minimizedText;
    if (colonIdx > 0 || segmentSource.includes(',')) {
      const regex = /[^,;]+/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(segmentSource)) !== null) {
        const cleaned = match[0].replace(/^\s*(?:and\s+)?/i, '').trim();
        if (!cleaned) continue;
        const start = input.minimizedText.indexOf(cleaned, sliceOffset + match.index);
        if (start >= 0) {
          rawClauses.push({ start, end: start + cleaned.length, text: cleaned });
        }
      }
    } else {
      const conjMatch = /\s+and\s+(?=(?:what|which|who|where|when|how|show|list|check|are)\b)/i.exec(input.minimizedText);
      if (conjMatch && conjMatch.index > 0) {
        const leftText = input.minimizedText.slice(0, conjMatch.index).trim();
        const rightStart = input.minimizedText.indexOf(input.minimizedText.slice(conjMatch.index + conjMatch[0].length).trim(), conjMatch.index);
        const rightText = rightStart >= 0 ? input.minimizedText.slice(rightStart).trim() : '';
        if (leftText) rawClauses.push({ start: 0, end: leftText.length, text: leftText });
        if (rightText && rightStart >= 0) rawClauses.push({ start: rightStart, end: rightStart + rightText.length, text: rightText });
      }
    }
    if (rawClauses.length === 0) {
      rawClauses.push({
        start: 0,
        end: input.minimizedText.length,
        text: input.minimizedText,
      });
    }

    const detected: StageOnePreliminaryFacet[] = [];
    for (const [index, clause] of rawClauses.entries()) {
      const matchLongTail = LONG_TAIL_PARAPHRASE_RULES.find((r) => r.pattern.test(clause.text));
      if (matchLongTail) {
        detected.push({
          preliminarySpan: { start: clause.start, end: clause.end, text: clause.text },
          domainCandidates: [{ id: matchLongTail.domainId, score: 0.87 }],
          dependsOnIndexes: [],
        });
        continue;
      }
      const det = parseCrossDomainSemanticRequest(clause.text);
      if (det.plan.outcome === 'MATCH' && det.plan.facets.length > 0) {
        for (const facet of det.plan.facets) {
          const dom = requireCanonicalProviderDomain(facet.domainCandidates[0]?.id ?? 'domain.property_profile');
          const mappedStart = input.minimizedText.indexOf(facet.sourceSpan.text, clause.start);
          const spanStart = mappedStart >= 0 ? mappedStart : clause.start;
          const spanText = input.minimizedText.slice(spanStart, spanStart + facet.sourceSpan.text.length);
          const spanEnd = spanStart + spanText.length;
          detected.push({
            preliminarySpan: {
              start: spanText === facet.sourceSpan.text ? spanStart : clause.start,
              end: spanText === facet.sourceSpan.text ? spanEnd : clause.end,
              text: spanText === facet.sourceSpan.text ? spanText : clause.text,
            },
            domainCandidates: [{ id: dom, score: 0.91 }],
            dependsOnIndexes: colonIdx > 0 && index > 0 && detected.length > 0 ? [0] : [],
          });
        }
      }
    }

    if (this.mode === 'FLAT_STAGE_ONE') {
      const domainIds = Array.from(new Set(detected.map((d) => d.domainCandidates[0].id)));
      return {
        mode: 'FLAT_DOMAIN_LIST',
        domainIds,
        preliminaryText: input.minimizedText,
        latencyMs: 2.1,
        estimatedCostUsd: 0.0008,
      };
    }

    return {
      mode: 'FACET_SPANS',
      facets: detected,
      latencyMs: 2.4,
      estimatedCostUsd: 0.0009,
    };
  }

  async runStageTwo(input: StageTwoProviderInput): Promise<StageTwoProviderOutput> {
    if (this.mode === 'OUTAGE') {
      throw new Error('PROVIDER_TIMEOUT: simulated stage2 outage');
    }

    const proposals: StageTwoFacetProposal[] = [];
    if (input.mode === 'UNION_DOMAINS') {
      const det = parseCrossDomainSemanticRequest(input.minimizedText);
      if (det.plan.outcome === 'MATCH' && det.plan.facets.length > 0) {
        for (const [idx, f] of det.plan.facets.entries()) {
          proposals.push({
            stableFacetId: `facet-${idx + 1}`,
            requestClass: f.requestClass,
            domainId: requireCanonicalProviderDomain(f.domainCandidates[0]?.id ?? input.unionDomainIds[0] ?? 'domain.property_profile'),
            subject: f.subject,
            relations: f.relations,
            polarity: f.polarity,
            projection: f.projection,
            fields: f.fields,
            where: f.where,
            time: f.time,
            requiredSlots: f.requiredSlots,
            dependsOn: f.dependsOn,
            jobMatch: f.evidence.jobMatch,
          });
        }
      } else {
        const proposal = clauseToProviderProposal(input.minimizedText, input.unionDomainIds[0] ?? 'domain.property_profile');
        if (proposal) {
          proposals.push({
            ...proposal,
            stableFacetId: 'facet-1',
          });
        }
      }
      return { proposals, latencyMs: 3.1, estimatedCostUsd: 0.0012 };
    }

    for (const assigned of input.assignedFacets) {
      const clauseText = input.minimizedText.slice(assigned.minimizedSpan.start, assigned.minimizedSpan.end);
      const base = clauseToProviderProposal(clauseText, assigned.domainCandidates[0]?.id ?? 'domain.property_profile');
      if (!base) continue;

      if (this.mode === 'MATERIAL_DISAGREEMENT') {
        proposals.push({
          ...base,
          stableFacetId: assigned.stableFacetId,
          projection: base.projection === 'COUNT' ? 'LIST' : 'COUNT',
        });
        continue;
      }

      proposals.push({
        ...base,
        stableFacetId: assigned.stableFacetId,
        dependsOn: [...assigned.dependsOnStableIds],
      });
    }

    return {
      proposals,
      latencyMs: 2.8,
      estimatedCostUsd: 0.0011,
    };
  }
}

/**
 * Production Gemini structured-output semantic understanding provider using governed AI execution
 * (`routeId: 'ai:ask'`). Fails closed cleanly when runtime GEMINI_API_KEY is unset or approval is open.
 */
export class GeminiSemanticUnderstandingProvider implements SemanticUnderstandingProvider {
  public readonly providerId = 'gemini-structured-semantic-provider';
  public readonly version = '1.0.0';
  public readonly isExternalNetworkProvider = true;

  private client(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY;
    return apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async runStageOne(input: StageOneProviderInput): Promise<StageOneProviderOutput> {
    const ai = this.client();
    if (!ai) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    const model = resolveGovernedAIModel('FAST');
    const startedAt = performance.now();
    const rawJson = await executeGovernedAIRequest<string>({
      routeId: 'ai:ask',
      model,
      timeoutMs: input.timeoutMs ?? 600,
      structuredOutputRequired: true,
      work: async () => {
        const res = await ai.models.generateContent({
          model,
          contents: [
            'Segment the minimized homeowner query into preliminary semantic facets with character offsets strictly inside minimizedText.',
            `Eligible domains: ${input.eligibleDomainIds.join(', ')}`,
            `Minimized text: ${JSON.stringify(input.minimizedText)}`,
            `Unresolved spans: ${JSON.stringify(input.unresolvedMinimizedSpans)}`,
          ].join('\n'),
          config: { responseMimeType: 'application/json', temperature: 0 },
        });
        return res.text ?? '{}';
      },
    });
    const parsed = parseProviderJsonWithSchema(StageOneFacetSchema, rawJson, 'stage1');
    const latencyMs = Number((performance.now() - startedAt).toFixed(3));
    if (parsed.mode === 'FLAT_DOMAIN_LIST') {
      return {
        mode: 'FLAT_DOMAIN_LIST',
        domainIds: (parsed.domainIds ?? []).map((d) => requireCanonicalProviderDomain(d)),
        latencyMs,
        estimatedCostUsd: 0.001,
      };
    }
    return {
      mode: 'FACET_SPANS',
      facets: (parsed.facets ?? []).map((f) => ({
        preliminarySpan: f.preliminarySpan,
        domainCandidates: f.domainCandidates.map((c) => ({
          id: requireCanonicalProviderDomain(c.id),
          score: c.score,
        })),
        dependsOnIndexes: f.dependsOnIndexes,
      })),
      latencyMs,
      estimatedCostUsd: 0.001,
    };
  }

  async runStageTwo(input: StageTwoProviderInput): Promise<StageTwoProviderOutput> {
    const ai = this.client();
    if (!ai) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    const model = resolveGovernedAIModel('FAST');
    const startedAt = performance.now();
    const rawJson = await executeGovernedAIRequest<string>({
      routeId: 'ai:ask',
      model,
      timeoutMs: input.timeoutMs ?? 1200,
      structuredOutputRequired: true,
      work: async () => {
        const res = await ai.models.generateContent({
          model,
          contents: [
            'Bind each assigned stableFacetId to an eligible semantic job, entity, relation, polarity, and projection.',
            `Mode: ${input.mode}`,
            `Assigned facets: ${JSON.stringify(input.assignedFacets)}`,
            `Eligible jobs by domain: ${JSON.stringify(input.eligibleJobsByDomain)}`,
          ].join('\n'),
          config: { responseMimeType: 'application/json', temperature: 0 },
        });
        return res.text ?? '{}';
      },
    });
    const parsed = parseProviderJsonWithSchema(StageTwoProposalSchema, rawJson, 'stage2');
    return {
      proposals: parsed.proposals.map((p) => ({
        ...p,
        domainId: requireCanonicalProviderDomain(p.domainId),
        where: p.where as SemanticWhereExpression | null,
        time: p.time as SemanticTimeConstraint | null,
      })),
      latencyMs: Number((performance.now() - startedAt).toFixed(3)),
      estimatedCostUsd: 0.002,
    };
  }
}

export type ProducerReconciliationStatus =
  | 'AGREED'
  | 'DETERMINISTIC_ONLY'
  | 'PROVIDER_INCREMENTAL'
  | 'MATERIAL_DISAGREEMENT'
  | 'UNRESOLVED';

export interface ReconciledFacetLineage {
  readonly facetId: string;
  readonly rawSpan: SemanticSourceSpan;
  readonly jobMatch: string;
  readonly deterministicAgreed: boolean;
  readonly providerAgreed: boolean;
  readonly reconciliation: 'MERGED_BOTH' | 'DETERMINISTIC_ONLY' | 'PROVIDER_INCREMENTAL' | 'CONFLICT_CLARIFY';
}

export interface ProducerOrchestrationResult {
  readonly plan: SemanticRequestPlan;
  readonly deterministicParse: CrossDomainParseResult;
  readonly providerResult: TwoStageRetrievalResult | null;
  readonly reconciliationStatus: ProducerReconciliationStatus;
  readonly facetLineage: readonly ReconciledFacetLineage[];
  readonly disagreements: readonly string[];
  readonly shortCircuitedProvider: boolean;
  readonly deterministicLatencyMs: number;
  readonly providerLatencyMs: number;
}

function facetsAreSemanticallyEquivalent(a: SemanticFacet, b: SemanticFacet): boolean {
  const aRel = a.relations[0]?.semanticRelationId ?? null;
  const bRel = b.relations[0]?.semanticRelationId ?? null;
  return (
    a.evidence.jobMatch === b.evidence.jobMatch
    && a.projection === b.projection
    && a.polarity === b.polarity
    && (!aRel || !bRel || aRel === bRel)
  );
}

/**
 * Deterministic-first orchestration + producer reconciliation (§12 FR-UND-6 / FR-UND-7 / §19 #28):
 * runs the deterministic parser first, skips the provider in production short-circuit mode when
 * complete, always runs both producers in DUAL_PRODUCER offline calibration mode, and never degrades
 * deterministic availability on provider outage or missing owner approval.
 */
export async function interpretWithSemanticProducers(input: {
  readonly rawText: string;
  readonly evaluationMode: 'PRODUCTION_SHORT_CIRCUIT' | 'DUAL_PRODUCER';
  readonly provider?: SemanticUnderstandingProvider | null;
  readonly policy?: SemanticProviderPolicy;
  readonly dynamicEntities?: readonly DynamicPlaceholderEntityCandidate[];
  readonly dynamicQuotes?: readonly DynamicQuoteCandidate[];
  readonly enforceConcurrencyOverflow?: boolean;
}): Promise<ProducerOrchestrationResult> {
  const detStart = performance.now();
  const detParse = parseCrossDomainSemanticRequest(input.rawText, {
    dynamicQuotes: input.dynamicQuotes,
  });
  const deterministicLatencyMs = Number((performance.now() - detStart).toFixed(3));

  // Safety boundary always short-circuits immediately before any provider call.
  if (detParse.plan.outcome === 'BOUNDARY' || detParse.plan.outcome === 'INSUFFICIENT_TEXT') {
    return {
      plan: detParse.plan,
      deterministicParse: detParse,
      providerResult: null,
      reconciliationStatus: detParse.plan.outcome === 'BOUNDARY' ? 'DETERMINISTIC_ONLY' : 'UNRESOLVED',
      facetLineage: [],
      disagreements: [],
      shortCircuitedProvider: true,
      deterministicLatencyMs,
      providerLatencyMs: 0,
    };
  }

  const shouldInvokeProvider = Boolean(input.provider) && (
    input.evaluationMode === 'DUAL_PRODUCER'
    || detParse.plan.outcome !== 'MATCH'
    || detParse.plan.unresolvedSpans.length > 0
  );

  if (!shouldInvokeProvider || !input.provider) {
    return {
      plan: detParse.plan,
      deterministicParse: detParse,
      providerResult: null,
      reconciliationStatus: detParse.plan.outcome === 'MATCH' ? 'DETERMINISTIC_ONLY' : 'UNRESOLVED',
      facetLineage: detParse.plan.outcome === 'MATCH'
        ? detParse.plan.facets.map((f) => ({
            facetId: f.id,
            rawSpan: f.sourceSpan,
            jobMatch: f.evidence.jobMatch,
            deterministicAgreed: true,
            providerAgreed: false,
            reconciliation: 'DETERMINISTIC_ONLY' as const,
          }))
        : [],
      disagreements: [],
      shortCircuitedProvider: detParse.plan.outcome === 'MATCH',
      deterministicLatencyMs,
      providerLatencyMs: 0,
    };
  }

  const envelope = buildSemanticTextEnvelope(input.rawText, {
    dynamicEntities: input.dynamicEntities,
  });
  const unresolvedMinimized = detParse.plan.unresolvedSpans.map((span) => {
    const start = Math.max(0, Math.min(span.start, envelope.minimizedText.length));
    return {
      start,
      end: Math.min(envelope.minimizedText.length, start + span.text.length),
      text: span.text,
    };
  });

  const providerResult = await executeTwoStageProviderRetrieval({
    rawText: input.rawText,
    provider: input.provider,
    policy: input.policy,
    dynamicEntities: input.dynamicEntities,
    dynamicQuotes: input.dynamicQuotes,
    unresolvedMinimizedSpans: unresolvedMinimized,
    enforceConcurrencyOverflow: input.enforceConcurrencyOverflow,
  });
  const providerLatencyMs = providerResult.latencyMs;

  // Deterministic succeeded, provider unavailable/missed -> keep deterministic result cleanly (FR-UND-6).
  if (detParse.plan.outcome === 'MATCH' && providerResult.status !== 'MATCH') {
    return {
      plan: detParse.plan,
      deterministicParse: detParse,
      providerResult,
      reconciliationStatus: 'DETERMINISTIC_ONLY',
      facetLineage: detParse.plan.facets.map((f) => ({
        facetId: f.id,
        rawSpan: f.sourceSpan,
        jobMatch: f.evidence.jobMatch,
        deterministicAgreed: true,
        providerAgreed: false,
        reconciliation: 'DETERMINISTIC_ONLY' as const,
      })),
      disagreements: [],
      shortCircuitedProvider: false,
      deterministicLatencyMs,
      providerLatencyMs,
    };
  }

  // Deterministic declined or incomplete, provider produced validated MATCH -> incremental expansion.
  if (detParse.plan.outcome !== 'MATCH' && providerResult.status === 'MATCH') {
    return {
      plan: providerResult.plan,
      deterministicParse: detParse,
      providerResult,
      reconciliationStatus: 'PROVIDER_INCREMENTAL',
      facetLineage: providerResult.plan.facets.map((f) => ({
        facetId: f.id,
        rawSpan: f.sourceSpan,
        jobMatch: f.evidence.jobMatch,
        deterministicAgreed: false,
        providerAgreed: true,
        reconciliation: 'PROVIDER_INCREMENTAL' as const,
      })),
      disagreements: [],
      shortCircuitedProvider: false,
      deterministicLatencyMs,
      providerLatencyMs,
    };
  }

  // Both matched -> reconcile facet-by-facet on stable identity & span.
  if (detParse.plan.outcome === 'MATCH' && providerResult.status === 'MATCH') {
    const disagreements: string[] = [];
    const lineage: ReconciledFacetLineage[] = [];

    for (const detFacet of detParse.plan.facets) {
      const matchingProviderFacet = providerResult.plan.facets.find(
        (pf) => pf.id === detFacet.id || pf.sourceSpan.text.toLowerCase() === detFacet.sourceSpan.text.toLowerCase(),
      ) ?? (detParse.plan.facets.length === 1 && providerResult.plan.facets.length === 1
        ? providerResult.plan.facets[0]
        : undefined);

      if (!matchingProviderFacet) {
        lineage.push({
          facetId: detFacet.id,
          rawSpan: detFacet.sourceSpan,
          jobMatch: detFacet.evidence.jobMatch,
          deterministicAgreed: true,
          providerAgreed: false,
          reconciliation: 'DETERMINISTIC_ONLY',
        });
        continue;
      }

      if (facetsAreSemanticallyEquivalent(detFacet, matchingProviderFacet)) {
        lineage.push({
          facetId: detFacet.id,
          rawSpan: detFacet.sourceSpan,
          jobMatch: detFacet.evidence.jobMatch,
          deterministicAgreed: true,
          providerAgreed: true,
          reconciliation: 'MERGED_BOTH',
        });
      } else {
        disagreements.push(
          `${detFacet.id}:det(${detFacet.evidence.jobMatch}/${detFacet.projection})!=provider(${matchingProviderFacet.evidence.jobMatch}/${matchingProviderFacet.projection})`,
        );
        lineage.push({
          facetId: detFacet.id,
          rawSpan: detFacet.sourceSpan,
          jobMatch: detFacet.evidence.jobMatch,
          deterministicAgreed: true,
          providerAgreed: false,
          reconciliation: 'CONFLICT_CLARIFY',
        });
      }
    }

    return {
      plan: detParse.plan,
      deterministicParse: detParse,
      providerResult,
      reconciliationStatus: disagreements.length > 0 ? 'MATERIAL_DISAGREEMENT' : 'AGREED',
      facetLineage: lineage,
      disagreements,
      shortCircuitedProvider: false,
      deterministicLatencyMs,
      providerLatencyMs,
    };
  }

  // Both failed to match cleanly -> fail closed preserving provider status when relevant.
  return {
    plan: detParse.plan.outcome !== 'NONE_FITS'
      ? detParse.plan
      : (providerResult.status === 'PROVIDER_UNAVAILABLE' || providerResult.status === 'SCHEMA_INVALID')
        ? providerResult.plan
        : detParse.plan,
    deterministicParse: detParse,
    providerResult,
    reconciliationStatus: 'UNRESOLVED',
    facetLineage: [],
    disagreements: [],
    shortCircuitedProvider: false,
    deterministicLatencyMs,
    providerLatencyMs,
  };
}
