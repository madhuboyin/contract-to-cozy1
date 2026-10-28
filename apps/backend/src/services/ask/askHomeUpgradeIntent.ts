import type { AskOperationResult } from './askOperationRegistry';

// Comparison strips are `home-upgrade-options-<system>`, one per system with two to four options.
const isHomeUpgradeBlockId = (id: string) => id.startsWith('home-upgrade-') || id === 'ask-next-actions';

/**
 * The Home Upgrade Planner answer is a typed envelope this operation alone produces, led by its own summary. Its wording ("upgrade options saved in
 * the Home Upgrade Planner...") shares few words with phrasings like "Show my upgrade planner options", so word-similarity scoring left a correct
 * answer UNKNOWN and replaced it with a clarification. Accept only that envelope.
 */
export function matchesHomeUpgradeScenariosAnswerContract(result: AskOperationResult): boolean {
  if (!['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status)) return false;
  const hasSummary = result.blocks.some((block) => block.type === 'SUMMARY' && block.id === 'home-upgrade-summary');
  return hasSummary && result.blocks.every((block) => isHomeUpgradeBlockId(block.id));
}
