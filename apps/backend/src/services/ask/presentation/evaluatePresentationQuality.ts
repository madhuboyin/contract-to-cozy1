import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import type { PresentationQualityInput, PresentationQualityIssue, PresentationQualityIssueCode } from './presentationQuality.contract';

// Presentation Quality 2D: a pure, side-effect-free reading of a finished result against the FRD's profile rules. It returns
// structured issues for tests and development diagnostics. It never rewrites a result, never blocks execution and never reads
// the database; a simple answer is not failed for lacking an evidence block.

type Block = AskPresentationBlock;
type GroupedList = Extract<Block, { type: 'GROUPED_LIST' }>;

const ANSWER_LEADING = new Set<Block['type']>(['SUMMARY', 'PROACTIVE_INSIGHT', 'EMPTY_STATE', 'ERROR_STATE', 'BOUNDARY', 'TASK_GUIDE']);
const GUIDE_PROGRESS = new Set<Block['type']>(['TASK_GUIDE', 'WORKFLOW_PROGRESS', 'PROGRESS', 'DECISION_PROGRESS']);

/** Block-level actions: what the homeowner sees without opening a row. Row actions are disclosed one record at a time. */
function blockActions(block: Block): Array<{ style?: string }> {
  const actions = (block as { actions?: unknown }).actions;
  return Array.isArray(actions) ? actions as Array<{ style?: string }> : [];
}

export function evaluatePresentationQuality(input: PresentationQualityInput): PresentationQualityIssue[] {
  const { profile, result } = input;
  const blocks = result.blocks;
  const issues: PresentationQualityIssue[] = [];
  const add = (code: PresentationQualityIssueCode, detail: string, blockId?: string) => issues.push({ code, detail, ...(blockId ? { blockId } : {}) });

  if (blocks.length && !ANSWER_LEADING.has(blocks[0].type)) {
    add('FIRST_BLOCK_NOT_ANSWER', `The result opens with a ${blocks[0].type} block, not an answer.`, blocks[0].id);
  }

  if (!input.allowMultiplePrimaryActions) {
    const primary = blocks.flatMap((block) => blockActions(block).filter((action) => action.style === 'PRIMARY').map(() => block.id));
    if (primary.length > 1) add('MULTIPLE_PRIMARY_ACTIONS', `${primary.length} visible primary actions (${[...new Set(primary)].join(', ')}); a normal answer has at most one.`);
  }

  const continuation = (list: GroupedList) => list.sections.some((section) => section.offset !== undefined) || Boolean(result.parameters && result.parameters.nextCursor);
  for (const block of blocks) {
    if (block.type === 'GROUPED_LIST') {
      for (const section of block.sections) {
        if (section.count < section.items.length) add('SECTION_COUNT_BELOW_DELIVERED', `Section "${section.id}" counts ${section.count} but carries ${section.items.length}.`, block.id);
        if (/\b(good|fine|ok|healthy|all clear)\b/i.test(section.title) && section.items.some((item) => item.needsInfo === true)) {
          add('UNKNOWN_PRESENTED_AS_GOOD', `Section "${section.title}" holds an item whose condition cannot be assessed.`, block.id);
        }
      }
      const collection = block.collection;
      if (collection) {
        const delivered = block.sections.reduce((sum, section) => sum + section.items.length, 0);
        if (collection.deliveredCount !== delivered
          || collection.deliveredCount > collection.fetchedCount
          || (collection.sourceTotal != null && collection.fetchedCount > collection.sourceTotal)
          || collection.deliveryTruncated !== collection.deliveredCount < collection.fetchedCount) {
          add('COLLECTION_DESCRIPTOR_CONTRADICTION', 'The collection descriptor disagrees with the rows the block carries.', block.id);
        }
        if (collection.nextPageAvailable && !continuation(block)) {
          add('NEXT_PAGE_WITHOUT_CONTINUATION', 'A next page is declared but no section offset or cursor can serve it.', block.id);
        }
      }
    }
    if (block.type === 'TABLE' && block.totalCount !== undefined && block.totalCount < block.rows.length) {
      add('TABLE_TOTAL_BELOW_ROWS', `The table counts ${block.totalCount} but carries ${block.rows.length} rows.`, block.id);
    }
  }

  if (profile === 'COLLECTION' || profile === 'ATTENTION') {
    if (!blocks.some((block) => block.type === 'GROUPED_LIST' || block.type === 'TABLE' || block.type === 'PRIORITY_LIST' || block.type === 'TIMELINE')) {
      add('COLLECTION_BLOCK_MISSING', `A ${profile} result carries no list, table, priority list or timeline.`);
    }
  }

  if (profile === 'ATTENTION') {
    const lists = blocks.filter((block): block is GroupedList => block.type === 'GROUPED_LIST');
    for (const list of lists) {
      for (const section of list.sections) {
        for (const item of section.items) {
          if (!item.description && !item.timingLabel && !(item.meta && item.meta.length)) add('ATTENTION_ITEM_WITHOUT_REASON', `Item "${item.id}" in "${section.id}" gives no reason or timing.`, list.id);
        }
      }
    }
  }

  if (profile === 'COMPARE') {
    const declared = new Set(input.comparisonBlockIds ?? []);
    if (!blocks.some((block) => block.type === 'COMPARISON' || block.type === 'SCENARIO_COMPARISON' || block.type === 'TABLE' || declared.has(block.id))) {
      add('COMPARISON_BLOCK_MISSING', 'A COMPARE result carries no comparison or table.');
    }
    if (input.material !== false) {
      const evidence = blocks.filter((block): block is Extract<Block, { type: 'EVIDENCE' }> => block.type === 'EVIDENCE');
      if (!evidence.some((block) => block.items.some((item) => item.observedAt))) {
        add('MATERIAL_COMPARISON_WITHOUT_BASIS', 'A material comparison needs evidence with an as-of date.');
      }
      if (!blocks.some((block) => block.type === 'ASSUMPTIONS' || block.type === 'LIMITATION' || block.type === 'BOUNDARY')) {
        add('MATERIAL_COMPARISON_WITHOUT_ASSUMPTIONS_OR_LIMITS', 'A material comparison needs assumptions, a limitation or a boundary.');
      }
    }
  }

  if (profile === 'GUIDE' && !blocks.some((block) => GUIDE_PROGRESS.has(block.type))) {
    add('GUIDE_WITHOUT_PROGRESS_SOURCE', 'A guide carries no task guide or progress block, so its state would be invented.');
  }

  return issues;
}
