import type { AskPresentationFamily } from './ask.contract';

/**
 * UI review 2026-11-21 (owner review of the first five slices): a presentation family is the answer's contract with the client, not a hint. Declaring one means accepting its anatomy:
 *  - ANALYSIS is a conclusion with facts and assumptions: it carries no collection (no GROUPED_LIST, no TABLE).
 *  - DIRECT_ANSWER is a count, a yes/no or one fact: a collection is allowed only when the list declares why (`justifiedCollection`).
 *  - CLARIFICATION and BOUNDARY carry no collection; COMPARISON carries a comparison block; WORKFLOW carries a workflow block; ENTITY_LIST must carry a list (or say why not).
 *  - ENTITY_LIST names what its records are: every list (except the separate "needs confirmation" list) declares a `recordKind`, and no two lists of one kind share an answer.
 * Pure and free of I/O so the contract, the producers' tests and the client apply the same rules (the client keeps a copy: apps/frontend/src/features/ask/answerFamilyAnatomy.ts).
 */
export const UNCONFIRMED_LIST_ID_SUFFIX = '-needs-confirmation';

interface AnatomyBlock {
  readonly type: string;
  readonly id?: string;
  readonly recordKind?: string;
  readonly justifiedCollection?: string;
  readonly sections?: unknown;
}

type RequirementItem = { readonly entityType?: string | null; readonly status?: string | null };
const itemsOf = (block: AnatomyBlock): RequirementItem[] => (Array.isArray(block.sections)
  ? block.sections.flatMap((section: { items?: RequirementItem[] }) => (Array.isArray(section?.items) ? section.items : []))
  : []);
/** What the domain renderer of a kind needs from every row. Maintenance and document lists open the live record by the row's id, so each row names its entity type (and a task its status). */
export const RENDERER_ROW_REQUIREMENTS: Readonly<Record<string, { readonly entityType: string; readonly status: boolean }>> = {
  MAINTENANCE_TASK: { entityType: 'MAINTENANCE_TASK', status: true },
  DOCUMENT: { entityType: 'DOCUMENT', status: false },
};
function rendererRequirementIssues(block: AnatomyBlock): string[] {
  const requirement = block.recordKind ? RENDERER_ROW_REQUIREMENTS[block.recordKind] : undefined;
  if (!requirement) return [];
  const missing = itemsOf(block).filter((item) => item.entityType !== requirement.entityType || (requirement.status && !item.status));
  return missing.length > 0 ? [`${block.recordKind} list "${block.id ?? ''}" has ${missing.length} row(s) without ${requirement.status ? 'entityType and status' : 'entityType'}`] : [];
}

const COMPARISON_BLOCK_TYPES: ReadonlySet<string> = new Set(['COMPARISON', 'SCENARIO_COMPARISON', 'TABLE', 'GROUPED_LIST']);
const WORKFLOW_BLOCK_TYPES: ReadonlySet<string> = new Set(['WORKFLOW_PROGRESS', 'TASK_GUIDE', 'DECISION_PROGRESS', 'PROGRESS']);
const EMPTY_RESULT_BLOCK_TYPES: ReadonlySet<string> = new Set(['EMPTY_STATE', 'LIMITATION', 'ERROR_STATE']);
const isCollection = (block: AnatomyBlock): boolean => block.type === 'GROUPED_LIST' || block.type === 'TABLE';
const itemCount = (block: AnatomyBlock): number => (Array.isArray(block.sections)
  ? block.sections.reduce((sum: number, section: { items?: unknown[] }) => sum + (Array.isArray(section?.items) ? section.items.length : 0), 0)
  : 0);
const isUnconfirmedList = (block: AnatomyBlock): boolean => block.type === 'GROUPED_LIST' && (block.id ?? '').endsWith(UNCONFIRMED_LIST_ID_SUFFIX);

/** Why a declared family does not fit the blocks it comes with. Empty means the answer has the anatomy its family promises. */
export function answerAnatomyIssues(family: AskPresentationFamily | null | undefined, blocks: readonly AnatomyBlock[]): string[] {
  if (!family) return [];
  const issues: string[] = [];
  if (family === 'ANALYSIS') {
    for (const block of blocks) if (isCollection(block)) issues.push(`ANALYSIS answers carry no collection, but ${block.type} "${block.id ?? ''}" is present`);
  }
  if (family === 'DIRECT_ANSWER') {
    for (const block of blocks) {
      if (isCollection(block) && itemCount(block) > 0 && !block.justifiedCollection) issues.push(`DIRECT_ANSWER carries ${block.type} "${block.id ?? ''}" with no justifiedCollection`);
    }
  }
  if (family === 'CLARIFICATION' || family === 'BOUNDARY') {
    for (const block of blocks) if (isCollection(block)) issues.push(`${family} answers carry no collection, but ${block.type} "${block.id ?? ''}" is present`);
  }
  if (family === 'COMPARISON' && !blocks.some((block) => COMPARISON_BLOCK_TYPES.has(block.type))) issues.push('COMPARISON answers carry a comparison block (COMPARISON, SCENARIO_COMPARISON, TABLE, or a list with one row per option)');
  if (family === 'WORKFLOW' && !blocks.some((block) => WORKFLOW_BLOCK_TYPES.has(block.type))) issues.push('WORKFLOW answers carry a workflow block (WORKFLOW_PROGRESS, TASK_GUIDE, DECISION_PROGRESS or PROGRESS)');
  if (family === 'ENTITY_LIST') {
    // An entity list is defined by its list; an answer with nothing to list says so with an empty/limitation/error state instead.
    if (!blocks.some((block) => block.type === 'GROUPED_LIST') && !blocks.some((block) => EMPTY_RESULT_BLOCK_TYPES.has(block.type))) issues.push('ENTITY_LIST answers carry a GROUPED_LIST (or an EMPTY_STATE / LIMITATION / ERROR_STATE saying why there is none)');
    const kinds = new Map<string, string>();
    for (const block of blocks) {
      if (block.type !== 'GROUPED_LIST' || isUnconfirmedList(block)) continue;
      if (!block.recordKind) { issues.push(`ENTITY_LIST list "${block.id ?? ''}" declares no recordKind`); continue; }
      // A kind whose domain renderer reads live records needs the metadata that renderer requires; a list that does not carry it is not that kind's list.
      for (const issue of rendererRequirementIssues(block)) issues.push(issue);
      const previous = kinds.get(block.recordKind);
      if (previous && block.recordKind !== 'OTHER') issues.push(`two ${block.recordKind} lists ("${previous}" and "${block.id ?? ''}") share one answer`);
      kinds.set(block.recordKind, block.id ?? '');
    }
  }
  return issues;
}
