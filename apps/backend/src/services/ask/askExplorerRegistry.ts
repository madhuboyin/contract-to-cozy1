// Ask capability explorer ("More ideas") and Explore with Cozy topic starters share ONE reviewed inventory
// (docs/product/ASK_COZY_LIGHTWEIGHT_CAPABILITY_DISCOVERY_IMPLEMENTATION_PLAN.md, Phase 4). Each entry declares its explorer membership,
// outcome group, homeowner label, question, approved search aliases, operation and launch policy. Nothing outside this registry reaches the
// explorer, and a topic starter is a reference to an entry, so the topics never define the explorer inventory.
//
// Reviewed-discovery rule (validated at startup by validateAskExplorerRegistry):
//   READ               an Ask-native read; never a command, never a monitor.
//   GOVERNED_WORKFLOW  selection only BEGINS a capture, proposal or review flow. The operation must be a registered domain command (so the
//                      write stays confirmation-gated) and the entry must state its consequence before anything is confirmed.
// Excluded by construction: a command that could write immediately, an entry without reviewed copy or aliases, an operation that needs an
// entity chosen first (the explorer has no picker), and a phrase that would fall to the grounded-guidance model fallback.
import type { CapabilityCatalogItem } from '../../productFramework/capabilities';
import type { ConciergeHomeView } from '../../productFramework/conciergeHome.contract';
import { getAskDomainCommandByOperation } from './askDomainCommandRegistry';
import { getAskAudiencePolicy } from './askAudiencePolicy';
import { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition, resolveAskOperation, type AskOperationId } from './askOperationRegistry';
import { DIY_TEMPLATE_BROWSE_ACTION } from '../diy/projectGuide';
import { PROPERTY_SUMMARY_COMPLETENESS_STARTER_MESSAGE, PROPERTY_SUMMARY_STARTER_MESSAGE } from './suggestedActions/starterCandidates';
import { SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE, SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE } from './support/seasonalHomeCare';

export type AskExplorerGroupId = 'UNDERSTAND' | 'MAINTAIN' | 'PROTECT' | 'SAVE' | 'DECIDE' | 'PLAN_MONITOR';

export interface AskExplorerGroup {
  id: AskExplorerGroupId;
  label: string;
  /** The short word the prompt chip carries ("Maintain"), kept from the previous explorer. */
  categoryLabel: string;
  description: string;
  outcomeCategory: CapabilityCatalogItem['outcomeCategory'];
}

export interface AskExplorerEntry {
  id: string;
  groupId: AskExplorerGroupId;
  /** Homeowner-facing label, written as an outcome. */
  label: string;
  /** The exact message a selection sends. */
  question: string;
  operationId: AskOperationId;
  kind: 'READ' | 'GOVERNED_WORKFLOW';
  interactionType: 'CONVERSATION_CONTINUE' | 'START_WORKFLOW';
  /** MESSAGE: the question resolves to the operation by itself. DECLARED_OPERATION: an internal operation reached only by launchContext.operationId. */
  launch: 'MESSAGE' | 'DECLARED_OPERATION';
  /** Approved homeowner phrases that should find this entry. Matched as text only; operation ids are never searched. */
  aliases: readonly string[];
  /** Required for GOVERNED_WORKFLOW: what selecting it does, and that nothing is saved until the homeowner confirms. */
  consequence?: string;
}

export const ASK_EXPLORER_GROUPS: readonly AskExplorerGroup[] = Object.freeze([
  { id: 'UNDERSTAND', label: 'Understand your home', categoryLabel: 'Understand', outcomeCategory: 'UNDERSTAND_HOME', description: 'Turn home records into a clear, useful picture.' },
  { id: 'MAINTAIN', label: 'Maintain and prevent', categoryLabel: 'Maintain', outcomeCategory: 'MAINTAIN_PREVENT', description: 'Stay ahead of maintenance and prevent avoidable problems.' },
  { id: 'PROTECT', label: 'Protect your home', categoryLabel: 'Protect', outcomeCategory: 'PROTECT_MONITOR', description: 'Find coverage gaps, risks, and important changes.' },
  { id: 'SAVE', label: 'Reduce costs', categoryLabel: 'Save', outcomeCategory: 'SAVE_OPTIMIZE', description: 'Understand spending and uncover relevant savings.' },
  { id: 'DECIDE', label: 'Compare and decide', categoryLabel: 'Decide', outcomeCategory: 'DECIDE_COMPARE', description: 'Compare options with the relevant home context.' },
  { id: 'PLAN_MONITOR', label: 'Plan and monitor', categoryLabel: 'Plan', outcomeCategory: 'PLAN_BUDGET', description: 'Build plans and keep watch on important deadlines.' },
]);

const read = (
  id: string, groupId: AskExplorerGroupId, label: string, question: string, operationId: AskOperationId, aliases: readonly string[],
  options: { launch?: AskExplorerEntry['launch']; interactionType?: AskExplorerEntry['interactionType'] } = {},
): AskExplorerEntry => ({
  id, groupId, label, question, operationId, aliases, kind: 'READ',
  launch: options.launch ?? 'MESSAGE', interactionType: options.interactionType ?? 'CONVERSATION_CONTINUE',
});

export const ASK_EXPLORER_ENTRIES: readonly AskExplorerEntry[] = Object.freeze([
  read('understand-summary', 'UNDERSTAND', 'Summarize my home record', PROPERTY_SUMMARY_STARTER_MESSAGE, 'PROPERTY_SUMMARY', ['home overview', 'what do you know about my home', 'property summary']),
  read('understand-completeness', 'UNDERSTAND', 'How complete is my home record?', PROPERTY_SUMMARY_COMPLETENESS_STARTER_MESSAGE, 'PROPERTY_SUMMARY', ['missing details', 'what is missing', 'home profile complete']),

  read('maintain-attention', 'MAINTAIN', 'What needs attention?', 'What needs my attention at home?', 'HOME_ACTIONS', ['to do', 'priorities', 'what should i do next', 'urgent']),
  read('maintain-due', 'MAINTAIN', 'What maintenance is coming due?', 'What maintenance tasks are due this month?', 'MAINTENANCE_STATUS', ['upkeep', 'overdue', 'tasks due', 'chores']),
  read('maintain-forecast', 'MAINTAIN', 'What maintenance should I expect soon?', 'What maintenance is coming up for my home?', 'MAINTENANCE_FORECAST', ['upcoming maintenance', 'predict', 'when will it need service']),
  read('maintain-seasonal', 'MAINTAIN', 'Home care for this season', SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE, 'SEASONAL_HOME_CARE', ['seasonal checklist', 'winter', 'summer', 'spring', 'fall', 'weather prep'], { launch: 'DECLARED_OPERATION', interactionType: 'START_WORKFLOW' }),
  read('maintain-next-season', 'MAINTAIN', 'Get ready for next season', SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE, 'SEASONAL_HOME_CARE', ['prepare for winter', 'prepare for summer', 'next season checklist'], { launch: 'DECLARED_OPERATION', interactionType: 'START_WORKFLOW' }),
  read('maintain-diy', 'MAINTAIN', 'Show my DIY projects', 'Show my DIY projects', 'DIY_PROJECTS', ['do it yourself', 'my projects', 'repair myself']),
  read('maintain-diy-start', 'MAINTAIN', 'Find a project I can start', DIY_TEMPLATE_BROWSE_ACTION.message, 'DIY_TEMPLATE_BROWSE', ['start a diy project', 'beginner projects', 'weekend project'], { launch: 'DECLARED_OPERATION', interactionType: 'START_WORKFLOW' }),
  {
    id: 'maintain-create-task', groupId: 'MAINTAIN', label: 'Add a maintenance task', question: 'Create a maintenance task', operationId: 'MAINTENANCE_TASK_CREATE',
    kind: 'GOVERNED_WORKFLOW', interactionType: 'START_WORKFLOW', launch: 'MESSAGE', aliases: ['new task', 'remind me', 'schedule maintenance', 'filter change'],
    consequence: 'Cozy asks for the details and shows a review first. Nothing is saved until you confirm.',
  },

  read('protect-coverage', 'PROTECT', 'Which items are missing coverage?', 'Which items are missing coverage?', 'COVERAGE_GAPS', ['insurance', 'warranty gaps', 'uncovered', 'not covered']),
  read('protect-changes', 'PROTECT', 'What changed recently for this home?', 'What changed recently for this home?', 'HOME_CHANGE_SUMMARY', ['recent changes', 'updates', 'what is new']),

  read('save-opportunities', 'SAVE', 'Where could I save money?', 'Where could I save money on this home?', 'SAVINGS_OPPORTUNITIES', ['savings', 'rebates', 'cut costs', 'cheaper']),
  read('save-costs', 'SAVE', 'What are my biggest ownership costs?', 'What are my biggest ownership costs?', 'OWNERSHIP_COSTS', ['spending', 'expenses', 'cost of owning', 'budget']),

  read('decide-quotes', 'DECIDE', 'Compare contractor quotes', 'Help me compare contractor quotes.', 'QUOTE_COMPARISON_REVIEW', ['bids', 'estimates', 'contractor price', 'which quote']),

  read('plan-reserve', 'PLAN_MONITOR', 'How is my reserve fund doing?', 'How is my reserve fund doing?', 'CAPITAL_RESERVE_PLAN', ['replacement fund', 'savings for repairs', 'capital plan', 'future replacements']),
]);

/**
 * The Concierge Home `capabilityGroups`: each group lists the capabilities the catalog holds for its outcome (the existing availability
 * adapter has already filtered those) and the reviewed entries that belong to it. A group with neither is omitted. Audience and launch
 * policy are applied per prompt by the caller, which owns the household role and operating mode.
 */
export function buildAskExplorerGroups(capabilities: ReadonlyArray<Pick<CapabilityCatalogItem, 'id' | 'outcomeCategory'>>): ConciergeHomeView['capabilityGroups'] {
  return ASK_EXPLORER_GROUPS.flatMap((group) => {
    const capabilityIds = capabilities.filter((capability) => capability.outcomeCategory === group.outcomeCategory).map((capability) => capability.id);
    const prompts = ASK_EXPLORER_ENTRIES.filter((entry) => entry.groupId === group.id).map((entry) => ({
      id: entry.id, categoryId: group.id, categoryLabel: group.categoryLabel, question: entry.question, label: entry.label,
      operationId: entry.operationId, aliases: [...entry.aliases], ...(entry.consequence ? { note: entry.consequence } : {}),
    }));
    return capabilityIds.length && prompts.length ? [{ id: group.id, label: group.label, description: group.description, capabilityIds, prompts }] : [];
  });
}

const NON_ASK_DESTINATION = /^(?:https?:|\/|#|mailto:)|\b(?:href|navigate to)\b/i;
const ALIAS_PATTERN = /^[a-z0-9][a-z0-9 '’-]{1,39}$/;

export function explorerEntryById(id: string): AskExplorerEntry | undefined {
  return ASK_EXPLORER_ENTRIES.find((entry) => entry.id === id);
}

/** Startup validator (index.ts refuses to boot on an issue). */
export function validateAskExplorerRegistry(entries: readonly AskExplorerEntry[] = ASK_EXPLORER_ENTRIES): string[] {
  const issues: string[] = [];
  const groupIds = new Set<string>(ASK_EXPLORER_GROUPS.map((group) => group.id));
  if (groupIds.size !== ASK_EXPLORER_GROUPS.length) issues.push('duplicate explorer group id');
  const ids = new Set<string>();
  const launches = new Set<string>();
  for (const entry of entries) {
    const where = `explorer/${entry.id}`;
    if (ids.has(entry.id)) issues.push(`${where}: duplicate explorer entry id`);
    ids.add(entry.id);
    if (!groupIds.has(entry.groupId)) issues.push(`${where}: unknown group ${entry.groupId}`);
    const launchKey = `${entry.operationId}\u0000${entry.question.trim().toLowerCase()}`;
    if (launches.has(launchKey)) issues.push(`${where}: duplicate explorer launch`);
    launches.add(launchKey);
    if (!entry.label.trim() || !entry.question.trim()) issues.push(`${where}: missing reviewed label or question`);
    if (NON_ASK_DESTINATION.test(entry.label) || NON_ASK_DESTINATION.test(entry.question)) issues.push(`${where}: text reads as a non-Ask destination`);
    if (!entry.aliases.length || entry.aliases.length > 8) issues.push(`${where}: needs 1-8 approved aliases`);
    const seenAliases = new Set<string>();
    for (const alias of entry.aliases) {
      if (!ALIAS_PATTERN.test(alias)) issues.push(`${where}: alias "${alias}" is not plain lower-case homeowner wording (no operation ids, underscores or capitals)`);
      if (seenAliases.has(alias)) issues.push(`${where}: duplicate alias "${alias}"`);
      seenAliases.add(alias);
    }
    if (!(entry.operationId in ASK_OPERATION_DEFINITIONS)) {
      issues.push(`${where}: unknown operation ${entry.operationId}`);
      continue;
    }
    const definition = getAskOperationDefinition(entry.operationId);
    if (!definition.requiresProperty) issues.push(`${where}: explorer entries are property-scoped, ${entry.operationId} is not`);
    if (!getAskAudiencePolicy(entry.operationId, definition.version)) issues.push(`${where}: ${entry.operationId} has no audience policy`);
    if (definition.family === 'GENERAL_HOME_GUIDANCE') issues.push(`${where}: ${entry.operationId} is the grounded-guidance fallback`);
    const command = getAskDomainCommandByOperation(entry.operationId);
    if (entry.kind === 'READ') {
      if (command || definition.family === 'COMMAND' || definition.family === 'MONITOR') issues.push(`${where}: a READ entry cannot be the command ${entry.operationId}`);
      if (entry.consequence) issues.push(`${where}: a READ entry has no consequence to state`);
    } else {
      if (!command) issues.push(`${where}: a GOVERNED_WORKFLOW must be a registered, confirmation-gated domain command`);
      if (!entry.consequence?.trim() || !/confirm/i.test(entry.consequence)) issues.push(`${where}: a GOVERNED_WORKFLOW must state that nothing happens until the homeowner confirms`);
      if (entry.interactionType !== 'START_WORKFLOW') issues.push(`${where}: a GOVERNED_WORKFLOW starts a workflow`);
    }
    if (entry.launch === 'MESSAGE') {
      if (!definition.messageRoutable) issues.push(`${where}: ${entry.operationId} is internal-only, so it needs DECLARED_OPERATION launch`);
      else if (resolveAskOperation(entry.question).operationId !== entry.operationId) issues.push(`${where}: question does not resolve to ${entry.operationId}`);
    } else if (definition.messageRoutable) {
      issues.push(`${where}: ${entry.operationId} is message-routable, so it launches by MESSAGE`);
    }
  }
  return issues;
}
