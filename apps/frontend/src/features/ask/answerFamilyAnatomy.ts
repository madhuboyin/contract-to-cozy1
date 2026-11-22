import type { AskPresentationBlock, AskPresentationFamily } from './types';

// The client's copy of the answer-anatomy rules (backend: apps/backend/src/productFramework/ask/answerFamilyAnatomy.ts, which the response contract enforces). A declared presentation family is a
// promise about the answer's blocks. The server rejects an answer that breaks it; the client does not trust that blindly, and shows only what the declared family permits, so a future
// producer that declares ANALYSIS but still sends a list can never put a collection on screen.
const UNCONFIRMED_LIST_ID_SUFFIX = '-needs-confirmation';

type Block = AskPresentationBlock;
const isCollection = (block: Block): boolean => block.type === 'GROUPED_LIST' || block.type === 'TABLE';
const itemCount = (block: Block): number => (block.type === 'GROUPED_LIST' ? block.sections.reduce((sum, section) => sum + section.items.length, 0) : block.type === 'TABLE' ? block.rows.length : 0);

/** What the domain renderer of a kind needs from every row: it opens the live record by the row's id, so each row names its entity type (and a task its status). */
export const RENDERER_ROW_REQUIREMENTS: Readonly<Record<string, { entityType: string; status: boolean }>> = {
  MAINTENANCE_TASK: { entityType: 'MAINTENANCE_TASK', status: true },
  DOCUMENT: { entityType: 'DOCUMENT', status: false },
};
/** True when every row of a list carries what its kind's renderer requires; a kind with no requirement is always met. */
export function rendererRequirementsMet(block: Extract<Block, { type: 'GROUPED_LIST' }>): boolean {
  const requirement = block.recordKind ? RENDERER_ROW_REQUIREMENTS[block.recordKind] : undefined;
  if (!requirement) return true;
  return block.sections.every((section) => section.items.every((item) => item.entityType === requirement.entityType && (!requirement.status || Boolean(item.status))));
}

/** Why the blocks do not have the anatomy the family promises. */
export function answerAnatomyIssues(family: AskPresentationFamily | null | undefined, blocks: readonly Block[]): string[] {
  if (!family) return [];
  const issues: string[] = [];
  if (family === 'ANALYSIS') for (const block of blocks) if (isCollection(block)) issues.push(`ANALYSIS carries ${block.type} "${block.id}"`);
  if (family === 'DIRECT_ANSWER') for (const block of blocks) if (block.type === 'GROUPED_LIST' && itemCount(block) > 0 && !block.justifiedCollection) issues.push(`DIRECT_ANSWER carries an unjustified list "${block.id}"`);
  if (family === 'CLARIFICATION' || family === 'BOUNDARY') for (const block of blocks) if (isCollection(block)) issues.push(`${family} carries ${block.type} "${block.id}"`);
  if (family === 'COMPARISON' && !blocks.some((block) => ['COMPARISON', 'SCENARIO_COMPARISON', 'TABLE', 'GROUPED_LIST'].includes(block.type))) issues.push('COMPARISON carries no comparison block');
  if (family === 'WORKFLOW' && !blocks.some((block) => ['WORKFLOW_PROGRESS', 'TASK_GUIDE', 'DECISION_PROGRESS', 'PROGRESS'].includes(block.type))) issues.push('WORKFLOW carries no workflow block');
  if (family === 'ENTITY_LIST') {
    if (!blocks.some((block) => block.type === 'GROUPED_LIST') && !blocks.some((block) => ['EMPTY_STATE', 'LIMITATION', 'ERROR_STATE'].includes(block.type))) issues.push('ENTITY_LIST carries no list');
    const kinds = new Set<string>();
    for (const block of blocks) {
      if (block.type !== 'GROUPED_LIST' || block.id.endsWith(UNCONFIRMED_LIST_ID_SUFFIX)) continue;
      if (!block.recordKind) issues.push(`ENTITY_LIST list "${block.id}" declares no recordKind`);
      else if (!rendererRequirementsMet(block)) issues.push(`${block.recordKind} list "${block.id}" lacks the row metadata its renderer requires`);
      else if (kinds.has(block.recordKind) && block.recordKind !== 'OTHER') issues.push(`two ${block.recordKind} lists share one answer`);
      else kinds.add(block.recordKind);
    }
  }
  return issues;
}

/**
 * The blocks to show. An answer that keeps its family's anatomy is shown whole. When it does not, what the family forbids is left out (an analysis shows no collection; a direct answer shows no
 * unjustified list) and the violation is reported, never rendered. A list that merely lacks a kind or repeats one is still shown (hiding it would hide the answer), and is reported too.
 */
export function enforceAnswerAnatomy(family: AskPresentationFamily | null | undefined, blocks: Block[], report: (issues: string[]) => void = () => undefined): Block[] {
  const issues = answerAnatomyIssues(family, blocks);
  if (issues.length === 0) return blocks;
  report(issues);
  if (family === 'ANALYSIS') return blocks.filter((block) => !isCollection(block));
  if (family === 'CLARIFICATION' || family === 'BOUNDARY') return blocks.filter((block) => !isCollection(block));
  if (family === 'DIRECT_ANSWER') return blocks.filter((block) => !(block.type === 'GROUPED_LIST' && itemCount(block) > 0 && !block.justifiedCollection));
  return blocks;
}
