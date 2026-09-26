import { deriveComposerAffordances } from '../composerAffordances';
import type { AskExecutionResponse } from '../types';

// ACUI-004 (FRD v1.119): an evidence affordance exists only for one deterministic, evidence-capable record.
const item = (id: string, entityType: string | null, actions = 1) => ({ id, title: `Item ${id}`, meta: [], entityType, actions: Array.from({ length: actions }, (_, index) => ({ id: `a${index}`, label: 'Correct', message: 'm', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'X' })) });
const list = (...items: ReturnType<typeof item>[]) => ({ type: 'GROUPED_LIST', id: 'g', title: 'T', sections: [{ id: 's', title: 'S', count: items.length, items }], actions: [], filters: [] });
const execution = (blocks: unknown[], overrides: Record<string, unknown> = {}) => ({ status: 'COMPLETED', blocks, confirmation: null, clarification: null, captureRequests: [], ...overrides }) as unknown as AskExecutionResponse;

describe('deriveComposerAffordances', () => {
  it('names the purpose and the one record for a single inventory item, and attaches nothing by itself', () => {
    const [affordance] = deriveComposerAffordances(execution([list(item('i1', 'INVENTORY_ITEM'))]));
    expect(affordance).toMatchObject({ id: 'attach-evidence', label: 'Add a photo or document', purpose: 'Add a photo or document for Item i1', effect: 'ATTACH_EVIDENCE_AFTER_REVIEW', target: { entityType: 'INVENTORY_ITEM', id: 'i1' } });
    expect(affordance.acceptedTypes).toEqual(expect.arrayContaining(['image/jpeg', 'application/pdf']));
    expect(affordance.maxBytes).toBe(10 * 1024 * 1024);
  });
  it('works for a read result (ANSWERED), which is what a record lookup returns', () => {
    expect(deriveComposerAffordances(execution([list(item('i1', 'INVENTORY_ITEM'))], { status: 'ANSWERED' }))).toHaveLength(1);
    expect(deriveComposerAffordances(execution([list(item('i1', 'INVENTORY_ITEM'))], { status: 'RUNNING' }))).toEqual([]);
  });
  it('uses purpose-specific wording for a warranty', () => {
    expect(deriveComposerAffordances(execution([list(item('w1', 'WARRANTY'))]))[0].label).toBe('Add the warranty document');
  });
  it('offers nothing when several records are listed, so no target is guessed', () => {
    expect(deriveComposerAffordances(execution([list(item('i1', 'INVENTORY_ITEM'), item('i2', 'INVENTORY_ITEM'))]))).toEqual([]);
  });
  it('counts the same record once, even when it appears twice', () => {
    expect(deriveComposerAffordances(execution([list(item('i1', 'INVENTORY_ITEM')), list(item('i1', 'INVENTORY_ITEM'))]))).toHaveLength(1);
  });
  it('offers nothing for a record type evidence cannot attach to, or a record with no declared actions', () => {
    expect(deriveComposerAffordances(execution([list(item('t1', 'MAINTENANCE_TASK'))]))).toEqual([]);
    expect(deriveComposerAffordances(execution([list(item('i1', 'INVENTORY_ITEM', 0))]))).toEqual([]);
    expect(deriveComposerAffordances(execution([list(item('i1', null))]))).toEqual([]);
  });
  it('offers nothing while the turn is asking, confirming, or not finished', () => {
    const blocks = [list(item('i1', 'INVENTORY_ITEM'))];
    expect(deriveComposerAffordances(execution(blocks, { status: 'NEEDS_CONFIRMATION' }))).toEqual([]);
    expect(deriveComposerAffordances(execution(blocks, { confirmation: {} }))).toEqual([]);
    expect(deriveComposerAffordances(execution(blocks, { captureRequests: [{}] }))).toEqual([]);
    expect(deriveComposerAffordances(null)).toEqual([]);
  });
});
