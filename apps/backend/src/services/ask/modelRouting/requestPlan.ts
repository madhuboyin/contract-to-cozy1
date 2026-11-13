// Request plan (reliability FRD FR-FACET-1..3, 13): what a model MAY propose, and the deterministic validation that decides what runs. A model plan is advisory: every
// facet is checked against the registry and the reviewed data-point catalogue, and a facet that fails is DROPPED AND REPORTED, never silently. Nothing here calls a model.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { COMPOSITION_PURE_VARIANTS, getAskOperationDefinition, type AskOperationId } from '../askOperationRegistry';
import { DATA_POINT_BY_ID } from '../dataPoint/dataPointCatalogue';
import { isWriteCapableOperation } from '../support/writeCapability';

export const DEFAULT_MAX_FACETS = 6;

export const RawFacetSchema = z.object({
  /** The words of the message this facet answers (FR-FACET-13 span); validated to occur in the message. */
  span: z.string().min(1).max(300),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('OPERATION'), operationId: z.string().min(1).max(80) }),
    z.object({ kind: z.literal('DATA_POINT'), dataPointId: z.string().min(1).max(80) }),
  ]),
  /** The recorded thing the facet is about ("water heater"); shared across facets (FR-FACET-5). */
  entity: z.string().max(80).nullish(),
  /** Indices of earlier facets this one depends on. */
  dependsOn: z.array(z.number().int().min(0).max(31)).max(8).default([]),
  confidence: z.number().min(0).max(1),
}).strict();
export const RawPlanSchema = z.object({ facets: z.array(RawFacetSchema).max(32) }).strict();
export type RawPlan = z.infer<typeof RawPlanSchema>;

export type DropReason = 'UNKNOWN_TARGET' | 'NOT_ELIGIBLE' | 'WRITE_NOT_COMPOSABLE' | 'NOT_A_COMPOSABLE_READ' | 'SPAN_NOT_IN_MESSAGE' | 'DUPLICATE' | 'BAD_DEPENDENCY' | 'DEPENDS_ON_DROPPED' | 'OVER_LIMIT';
export interface ValidFacet { readonly id: string; readonly span: string; readonly target: { kind: 'OPERATION'; operationId: AskOperationId } | { kind: 'DATA_POINT'; dataPointId: string }; readonly entity: string | null; readonly dependsOn: readonly string[]; readonly confidence: number }
export interface DroppedFacet { readonly index: number; readonly span: string; readonly reason: DropReason }
export interface PlanValidation { readonly accepted: readonly ValidFacet[]; readonly dropped: readonly DroppedFacet[]; readonly overflow: number }

export interface PlanContext {
  readonly message: string;
  readonly eligibleOperationIds?: ReadonlySet<AskOperationId>;
  readonly eligibleDataPointIds?: ReadonlySet<string>;
  readonly maxFacets?: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$ ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Stable facet identity (FR-FACET-13 (2)): from entity and target, never from call order. */
export const facetId = (target: string, entity: string | null) => createHash('sha256').update(`${norm(entity ?? '')}|${target}`).digest('hex').slice(0, 12);

export function validateRequestPlan(raw: unknown, ctx: PlanContext): PlanValidation {
  const parsed = RawPlanSchema.safeParse(raw);
  if (!parsed.success) return { accepted: [], dropped: [], overflow: 0 };
  const limit = ctx.maxFacets ?? DEFAULT_MAX_FACETS; const message = norm(ctx.message);
  const accepted: ValidFacet[] = []; const dropped: DroppedFacet[] = []; const indexToId = new Map<number, string>(); const seen = new Set<string>(); let overflow = 0;
  parsed.data.facets.forEach((facet, index) => {
    const drop = (reason: DropReason) => { dropped.push({ index, span: facet.span, reason }); };
    if (!message.includes(norm(facet.span))) return drop('SPAN_NOT_IN_MESSAGE');
    let target: ValidFacet['target']; let key: string;
    if (facet.target.kind === 'DATA_POINT') {
      if (!DATA_POINT_BY_ID.has(facet.target.dataPointId)) return drop('UNKNOWN_TARGET');
      if (ctx.eligibleDataPointIds && !ctx.eligibleDataPointIds.has(facet.target.dataPointId)) return drop('NOT_ELIGIBLE');
      target = { kind: 'DATA_POINT', dataPointId: facet.target.dataPointId }; key = `DP:${facet.target.dataPointId}`;
    } else {
      const requested = facet.target.operationId as AskOperationId; let def: ReturnType<typeof getAskOperationDefinition>;
      try { def = getAskOperationDefinition(requested); } catch { return drop('UNKNOWN_TARGET'); }
      if (!def) return drop('UNKNOWN_TARGET');
      // A write is never composed (FR-DEC-0); a persisting decision runs as its pure variant (D17) or not at all.
      const runs = COMPOSITION_PURE_VARIANTS[requested] ?? requested;
      if (isWriteCapableOperation(runs)) return drop('WRITE_NOT_COMPOSABLE');
      if (ctx.eligibleOperationIds && !ctx.eligibleOperationIds.has(requested)) return drop('NOT_ELIGIBLE');
      if (!getAskOperationDefinition(runs).composableRead) return drop('NOT_A_COMPOSABLE_READ');
      target = { kind: 'OPERATION', operationId: runs }; key = `OP:${runs}`;
    }
    const id = facetId(key, facet.entity ?? null);
    if (seen.has(id)) return drop('DUPLICATE');
    // dependencies refer to earlier facets only (acyclic by construction) and to ones that were accepted
    const deps: string[] = [];
    for (const d of facet.dependsOn) {
      if (d >= index) return drop('BAD_DEPENDENCY');
      const dep = indexToId.get(d); if (!dep) return drop('DEPENDS_ON_DROPPED'); deps.push(dep);
    }
    if (accepted.length >= limit) { overflow += 1; return drop('OVER_LIMIT'); }
    seen.add(id); indexToId.set(index, id);
    accepted.push({ id, span: facet.span, target, entity: facet.entity ?? null, dependsOn: deps, confidence: facet.confidence });
  });
  return { accepted, dropped, overflow };
}
