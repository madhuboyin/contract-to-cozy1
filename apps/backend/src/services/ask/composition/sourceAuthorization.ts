// Composition FRD FR-AUT-1: source-record visibility for composed answers. A composite aggregates records from several operations, so property, operation and
// role checks are not enough: a deleted record, a private event or a changed visibility must also be caught at assembly, on every replay and on refresh.
//
// Each composable operation OWNS its contract (it understands its records):
//   describeSources(result)  -> the bounded record references that materially support the section, or null when it cannot say (fail closed).
//   authorizeSources(ctx, s) -> AUTHORIZED, REDACT_SECTION (a record is gone or no longer visible) or WITHHOLD_COMPOSITE (the property itself is gone).
// Only opaque ids and a type are stored, never record content. A reference of a type the operation did not declare, a section that declares nothing, or a
// record the check cannot confirm all fail closed.
import type { AskOperationId } from '../askOperationRegistry';

export type CompositeSourceType =
  | 'Property' | 'InventoryItem' | 'Warranty' | 'HomeCapitalTimelineItem' | 'HomeReserveFund' | 'HomeReserveFundLineItem'
  | 'DoNothingSimulationRun' | 'DoNothingScenario' | 'HomeDigitalTwin' | 'HomeTwinScenario' | 'RecallMatch' | 'HomeEvent';

export interface CompositeSourceReference {
  sourceType: CompositeSourceType;
  sourceId: string;
  /** Optional opaque version of the record's visibility when the operation can state one (for example `updatedAt`); never content. */
  visibilityVersion?: string;
}

export type SourceVerdict = 'AUTHORIZED' | 'REDACT_SECTION' | 'WITHHOLD_COMPOSITE';

export interface SourceAuthorizationContext {
  userId: string;
  propertyId: string;
  /** True when a record of `model` matching `where` exists. Injected, so every rule is tested with a fake. */
  exists(model: CompositeSourceType, where: Record<string, unknown>): Promise<boolean>;
}

/** The slice of an operation result `describeSources` reads. */
export interface DescribableResult { reasonCode?: string | null; parameters?: unknown; blocks: ReadonlyArray<unknown> }

export interface ComposableReadAuthorization {
  describeSources(result: DescribableResult): CompositeSourceReference[] | null;
  authorizeSources(context: SourceAuthorizationContext, sources: readonly CompositeSourceReference[]): Promise<SourceVerdict>;
}

export const MAX_SOURCES_PER_SECTION = 50;
const MAX_ID_LENGTH = 128;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** What each source type must satisfy NOW for the requesting user. A record outside the property, deleted, retired or private to someone else fails. */
const CHECKS: Record<CompositeSourceType, { where: (context: SourceAuthorizationContext, id: string) => Record<string, unknown>; onMissing: SourceVerdict }> = {
  Property: { where: (c, id) => ({ id }), onMissing: 'WITHHOLD_COMPOSITE' },
  InventoryItem: { where: (c, id) => ({ id, propertyId: c.propertyId }), onMissing: 'REDACT_SECTION' },
  Warranty: { where: (c, id) => ({ id, propertyId: c.propertyId }), onMissing: 'REDACT_SECTION' },
  HomeCapitalTimelineItem: { where: (c, id) => ({ id, propertyId: c.propertyId }), onMissing: 'REDACT_SECTION' },
  HomeReserveFund: { where: (c, id) => ({ id, propertyId: c.propertyId }), onMissing: 'REDACT_SECTION' },
  HomeReserveFundLineItem: { where: (c, id) => ({ id, status: 'ACTIVE', fund: { propertyId: c.propertyId } }), onMissing: 'REDACT_SECTION' },
  DoNothingSimulationRun: { where: (c, id) => ({ id, propertyId: c.propertyId }), onMissing: 'REDACT_SECTION' },
  DoNothingScenario: { where: (c, id) => ({ id, propertyId: c.propertyId }), onMissing: 'REDACT_SECTION' },
  HomeDigitalTwin: { where: (c, id) => ({ id, propertyId: c.propertyId }), onMissing: 'REDACT_SECTION' },
  HomeTwinScenario: { where: (c, id) => ({ id, propertyId: c.propertyId }), onMissing: 'REDACT_SECTION' },
  RecallMatch: { where: (c, id) => ({ id, propertyId: c.propertyId, status: { in: ['OPEN', 'NEEDS_CONFIRMATION'] } }), onMissing: 'REDACT_SECTION' },
  // The same predicate the timeline and inventory-history reads apply: current, not deleted, and private events only to their author.
  HomeEvent: { where: (c, id) => ({ id, propertyId: c.propertyId, isCurrent: true, deletedAt: null, OR: [{ visibility: { not: 'PRIVATE' } }, { createdById: c.userId }] }), onMissing: 'REDACT_SECTION' },
};

export const sourceRef = (sourceType: CompositeSourceType, sourceId: string): CompositeSourceReference => ({ sourceType, sourceId });

/** What a handler sets on `result.parameters` to declare its sources explicitly. Deduplicated and bounded; over the bound is not silently truncated (it fails closed). */
export function withSources<T extends { parameters?: unknown }>(result: T, refs: readonly CompositeSourceReference[]): T {
  const seen = new Set<string>();
  const unique = refs.filter((ref) => { const key = `${ref.sourceType}:${ref.sourceId}`; if (seen.has(key)) return false; seen.add(key); return true; });
  return { ...result, parameters: { ...(isRecord(result.parameters) ? result.parameters : {}), sources: unique } };
}

const validRef = (raw: unknown, allowed: ReadonlySet<CompositeSourceType>): CompositeSourceReference | null => {
  if (!isRecord(raw) || typeof raw.sourceType !== 'string' || typeof raw.sourceId !== 'string') return null;
  if (!allowed.has(raw.sourceType as CompositeSourceType) || !raw.sourceId || raw.sourceId.length > MAX_ID_LENGTH) return null;
  return { sourceType: raw.sourceType as CompositeSourceType, sourceId: raw.sourceId, ...(typeof raw.visibilityVersion === 'string' ? { visibilityVersion: raw.visibilityVersion.slice(0, MAX_ID_LENGTH) } : {}) };
};

/** Items a result lists, across grouped lists and timelines, with the entity type each declares. */
export function listedItems(blocks: ReadonlyArray<unknown>): Array<{ blockId: string; id: string; entityType: string | null }> {
  const out: Array<{ blockId: string; id: string; entityType: string | null }> = [];
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    const blockId = String(block.id ?? '');
    const push = (item: unknown) => { if (isRecord(item) && typeof item.id === 'string') out.push({ blockId, id: item.id, entityType: typeof item.entityType === 'string' ? item.entityType : null }); };
    if (block.type === 'GROUPED_LIST' && Array.isArray(block.sections)) for (const section of block.sections) if (isRecord(section) && Array.isArray(section.items)) section.items.forEach(push);
    if (block.type === 'TIMELINE' && Array.isArray(block.items)) block.items.forEach(push);
  }
  return out;
}

/** A synthetic timeline event is derived from the property's own canonical appliances, not a stored event row, so its source is the property. */
const eventRef = (id: string): CompositeSourceReference => (id.startsWith('synthetic-') ? sourceRef('Property', '') : sourceRef('HomeEvent', id));

interface OperationContract {
  allowed: readonly CompositeSourceType[];
  /** Reason codes that legitimately mean "no record supports this section" (an honest empty or notice answer). Anything else with no references fails closed. */
  noRecordReasons?: readonly string[];
  /** Derives references from the listed items when the handler declared none explicitly. */
  derive?: (result: DescribableResult, propertyId: string) => CompositeSourceReference[];
}

function build(contract: OperationContract): ComposableReadAuthorization {
  const allowed = new Set<CompositeSourceType>(contract.allowed);
  return {
    describeSources(result) {
      const params = isRecord(result.parameters) ? result.parameters : null;
      let refs: CompositeSourceReference[] | null = null;
      if (params && Array.isArray(params.sources)) {
        const parsed = params.sources.map((raw) => validRef(raw, allowed));
        if (parsed.some((ref) => ref === null) || parsed.length > MAX_SOURCES_PER_SECTION) return null;
        refs = parsed as CompositeSourceReference[];
      } else if (contract.derive) {
        refs = contract.derive(result, '');
        if (refs.length > MAX_SOURCES_PER_SECTION || refs.some((ref) => !allowed.has(ref.sourceType))) return null;
        if (!refs.length && !(result.reasonCode && contract.noRecordReasons?.includes(result.reasonCode))) return null;
      }
      return refs;
    },
    async authorizeSources(context, sources) {
      let verdict: SourceVerdict = 'AUTHORIZED';
      for (const source of sources) {
        if (!allowed.has(source.sourceType)) return 'REDACT_SECTION';
        const check = CHECKS[source.sourceType];
        if (!check) return 'REDACT_SECTION';
        // A Property reference always means THIS property; an empty id (synthetic events) is read as the requested property.
        const id = source.sourceType === 'Property' ? context.propertyId : source.sourceId;
        let present = false;
        try { present = await context.exists(source.sourceType, check.where(context, id)); } catch { return 'REDACT_SECTION'; } // unverifiable fails closed
        if (!present) {
          if (check.onMissing === 'WITHHOLD_COMPOSITE') return 'WITHHOLD_COMPOSITE';
          verdict = 'REDACT_SECTION';
        }
      }
      return verdict;
    },
  };
}

const fromItems = (result: DescribableResult, types: Record<string, (id: string) => CompositeSourceReference>, onlyBlock?: string) => listedItems(result.blocks)
  .filter((item) => (onlyBlock ? item.blockId === onlyBlock : true) && item.entityType != null && item.entityType in types)
  .map((item) => types[item.entityType as string](item.id));

/** The authorization contract of every composable operation. Admission to COMPOSABLE_READ_OPERATION_IDS requires an entry here (registry validation + test). */
export const COMPOSABLE_SOURCE_AUTHORIZATION: Readonly<Record<string, ComposableReadAuthorization>> = {
  ITEM_REPLACEMENT_COST: build({ allowed: ['HomeCapitalTimelineItem', 'Property'] }),
  ITEM_RESERVE_ALLOCATION: build({ allowed: ['HomeReserveFundLineItem', 'HomeReserveFund'] }),
  INVENTORY_LOOKUP: build({
    allowed: ['InventoryItem', 'HomeEvent', 'Property'],
    noRecordReasons: ['INVENTORY_NOT_RECORDED', 'INVENTORY_FILTER_NO_MATCH', 'INVENTORY_MATCH_NOT_FOUND'],
    derive: (result) => {
      const refs = fromItems(result, { INVENTORY_ITEM: (id) => sourceRef('InventoryItem', id), HOME_EVENT: eventRef });
      // The profile-roof answer lists no items: it states the home profile's roof year.
      const quantities = isRecord(result.parameters) ? result.parameters.quantities : null;
      return !refs.length && Array.isArray(quantities) && quantities.length ? [sourceRef('Property', '')] : refs;
    },
  }),
  WARRANTY_LOOKUP: build({
    allowed: ['Warranty'],
    noRecordReasons: ['WARRANTY_NOT_RECORDED', 'WARRANTY_FILTER_NO_MATCH', 'WARRANTY_MATCH_NOT_FOUND', 'WARRANTY_NOT_RECORDED_FOR_ITEM', 'WARRANTY_ITEM_NOT_FOUND'],
    derive: (result) => fromItems(result, { WARRANTY: (id) => sourceRef('Warranty', id) }),
  }),
  MAINTENANCE_BUDGET_FORECAST: build({ allowed: ['Property'] }),
  DO_NOTHING_SIMULATION: build({ allowed: ['DoNothingSimulationRun', 'DoNothingScenario'] }),
  HOME_UPGRADE_SCENARIOS: build({ allowed: ['HomeDigitalTwin', 'HomeTwinScenario'] }),
  RECALL_REVIEW: build({
    allowed: ['RecallMatch'], noRecordReasons: ['NO_OPEN_RECALL_MATCHES'],
    derive: (result) => listedItems(result.blocks).filter((item) => item.blockId === 'recall-review-matches').map((item) => sourceRef('RecallMatch', item.id)),
  }),
  HOME_TIMELINE_EVENTS: build({
    allowed: ['HomeEvent', 'Property'], noRecordReasons: ['HOME_TIMELINE_EMPTY'],
    derive: (result) => fromItems(result, { HOME_EVENT: eventRef }),
  }),
};
