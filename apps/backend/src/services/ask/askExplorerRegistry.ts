// Ask capability explorer ("More ideas") and Explore with Cozy topic starters (capability discovery plan, Phases 4-5; Inline Workspace FRD
// IW-SHELL-017 and IW-SHELL-020). This module owns NO inventory. It DERIVES every explorer entry from three canonical sources:
//   - the capability registry: identity, outcome group, homeowner label and description, approved intent aliases;
//   - the Ask operation registry: availability, audience, authorization, safety and launch behaviour;
//   - the Ask capability bindings (askCapabilityBindings.ts): only the Ask-specific facts -- which operation serves the capability, the
//     reviewed launch message, the interaction type, a governed workflow's consequence, and an optional presentation override.
// A topic starter references an entry by id and never defines inventory of its own.
//
// Reviewed-discovery rule (validated at startup by validateAskExplorerRegistry):
//   READ               an Ask-native read; never a command, never a monitor.
//   GOVERNED_WORKFLOW  selection only BEGINS a capture, proposal or review flow. The operation must be a registered domain command (so the
//                      write stays confirmation-gated) and the binding must state its consequence before anything is confirmed.
// Excluded by construction: a command that could write immediately, an entry without a reviewed binding, an operation that needs an entity
// chosen first (the explorer has no picker), and a phrase that would fall to the grounded-guidance model fallback.
import { canonicalCapabilityRegistry, type CapabilityCatalogItem, type ToolCapabilityRegistry } from '../../productFramework/capabilities';
import type { ConciergeHomeView } from '../../productFramework/conciergeHome.contract';
import { ASK_OPERATION_CAPABILITY } from '../intelligence/capabilitySkillGuidanceBridge.registry';
import { getAskAudiencePolicy } from './askAudiencePolicy';
import { ASK_DISCOVERY_BINDINGS, CARD_ENTRY_BINDINGS, KNOWN_CARD_BRIDGE_DISAGREEMENTS, type AskCapabilityBinding } from './askCapabilityBindings';
import { getAskDomainCommandByOperation } from './askDomainCommandRegistry';
import { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition, resolveAskOperation, type AskOperationId } from './askOperationRegistry';
import { getAskTargetSelector } from './askTargetSelectors';
import type { AskTargetSelectorId } from '../../productFramework/ask/askTargetSelection.contract';

export type AskExplorerGroupId = 'UNDERSTAND' | 'MAINTAIN' | 'PROTECT' | 'SAVE' | 'DECIDE' | 'PLAN_MONITOR';

/** Ask's presentation of one canonical outcome category. The category is the capability registry's; only the wording is Ask's. */
export interface AskExplorerGroup {
  id: AskExplorerGroupId;
  label: string;
  /** The short word the prompt chip carries ("Maintain"), kept from the previous explorer. */
  categoryLabel: string;
  description: string;
  outcomeCategory: CapabilityCatalogItem['outcomeCategory'];
}

/** A DERIVED entry: never authored. Everything but the binding's own fields comes from a canonical registry. */
export interface AskExplorerEntry {
  id: string;
  capabilityId: string;
  /** Derived from the capability's outcome category. */
  groupId: AskExplorerGroupId;
  /** The binding's presentation override, else the capability's own label. */
  label: string;
  question: string;
  operationId: AskOperationId;
  kind: AskCapabilityBinding['kind'];
  interactionType: AskCapabilityBinding['interactionType'];
  launch: AskCapabilityBinding['launch'];
  /** Set when `launch` is SELECTOR: the domain-owned selector that supplies the target. */
  selectorId?: AskTargetSelectorId;
  /** The capability's approved intent aliases (canonical), searched as text only. */
  aliases: readonly string[];
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

/** Derives the explorer entries for the bindings whose capability exists; an unknown capability yields no entry (the validator reports it). */
export function deriveAskExplorerEntries(
  bindings: readonly AskCapabilityBinding[] = ASK_DISCOVERY_BINDINGS,
  registry: Pick<ToolCapabilityRegistry, 'getById'> = canonicalCapabilityRegistry,
): AskExplorerEntry[] {
  return bindings.flatMap((binding): AskExplorerEntry[] => {
    const capability = registry.getById(binding.capabilityId);
    const group = capability && ASK_EXPLORER_GROUPS.find((candidate) => candidate.outcomeCategory === capability.presentation.outcomeCategory);
    if (!capability || !group) return [];
    return [{
      id: binding.id,
      capabilityId: binding.capabilityId,
      groupId: group.id,
      label: binding.label ?? capability.presentation.label,
      question: binding.question,
      operationId: binding.operationId,
      kind: binding.kind,
      interactionType: binding.interactionType,
      launch: binding.launch,
      ...(binding.selectorId ? { selectorId: binding.selectorId } : {}),
      aliases: [...new Set(capability.presentation.intentAliases)],
      ...(binding.consequence ? { consequence: binding.consequence } : {}),
    }];
  });
}

export const ASK_EXPLORER_ENTRIES: readonly AskExplorerEntry[] = Object.freeze(deriveAskExplorerEntries());

/**
 * The Concierge Home `capabilityGroups`: each group lists the capabilities the catalog holds for its outcome (the existing availability
 * adapter has already filtered those) and the reviewed entries that belong to it. A group with neither is omitted. Audience and launch
 * policy are applied per prompt by the caller, which owns the household role and operating mode.
 */
export function buildAskExplorerGroups(capabilities: ReadonlyArray<Pick<CapabilityCatalogItem, 'id' | 'outcomeCategory'>>): ConciergeHomeView['capabilityGroups'] {
  return ASK_EXPLORER_GROUPS.flatMap((group) => {
    const capabilityIds = capabilities.filter((capability) => capability.outcomeCategory === group.outcomeCategory).map((capability) => capability.id);
    // An entry that needs a target chosen first is hosted by the focused topic view, which owns the selector and its Cancel; the explorer dialog does not (yet).
    const prompts = ASK_EXPLORER_ENTRIES.filter((entry) => entry.groupId === group.id && entry.launch !== 'SELECTOR').map((entry) => ({
      id: entry.id, categoryId: group.id, categoryLabel: group.categoryLabel, question: entry.question, label: entry.label,
      operationId: entry.operationId, aliases: [...entry.aliases], ...(entry.consequence ? { note: entry.consequence } : {}),
    }));
    return capabilityIds.length && prompts.length ? [{ id: group.id, label: group.label, description: group.description, capabilityIds, prompts }] : [];
  });
}

const NON_ASK_DESTINATION = /^(?:https?:|\/|#|mailto:)|\b(?:href|navigate to)\b/i;
const ALLOWED_BINDING_KEYS: ReadonlySet<string> = new Set(['id', 'capabilityId', 'operationId', 'question', 'interactionType', 'launch', 'selectorId', 'kind', 'consequence', 'label']);

export function explorerEntryById(id: string): AskExplorerEntry | undefined {
  return ASK_EXPLORER_ENTRIES.find((entry) => entry.id === id);
}

/** Startup validator (index.ts refuses to boot on an issue). Validates the bindings, then the rules for the entries derived from them. */
export function validateAskExplorerRegistry(
  bindings: readonly AskCapabilityBinding[] = ASK_DISCOVERY_BINDINGS,
  registry: Pick<ToolCapabilityRegistry, 'getById'> = canonicalCapabilityRegistry,
): string[] {
  const issues: string[] = [];
  const categories = ASK_EXPLORER_GROUPS.map((group) => group.outcomeCategory);
  if (new Set(ASK_EXPLORER_GROUPS.map((group) => group.id)).size !== ASK_EXPLORER_GROUPS.length) issues.push('duplicate explorer group id');
  if (new Set(categories).size !== categories.length) issues.push('two explorer groups present the same outcome category');
  const ids = new Set<string>();
  const launches = new Set<string>();
  for (const binding of bindings) {
    const where = `explorer/${binding.id}`;
    if (ids.has(binding.id)) issues.push(`${where}: duplicate explorer entry id`);
    ids.add(binding.id);
    // Canonical metadata is never restated in a binding. The type forbids it, but bindings can be built dynamically, so a stray key is rejected at runtime too.
    for (const key of Object.keys(binding)) {
      if (!ALLOWED_BINDING_KEYS.has(key)) issues.push(`${where}: binding restates canonical metadata (${key}); derive it from the capability or operation registry`);
    }
    const launchKey = `${binding.operationId}\u0000${binding.question.trim().toLowerCase()}`;
    if (launches.has(launchKey)) issues.push(`${where}: duplicate explorer launch`);
    launches.add(launchKey);
    if (!binding.question.trim()) issues.push(`${where}: missing reviewed launch message`);
    if (NON_ASK_DESTINATION.test(binding.question) || NON_ASK_DESTINATION.test(binding.label ?? '')) issues.push(`${where}: text reads as a non-Ask destination`);

    const capability = registry.getById(binding.capabilityId);
    if (!capability) {
      issues.push(`${where}: unknown capability ${binding.capabilityId}`);
    } else {
      if (!ASK_EXPLORER_GROUPS.some((group) => group.outcomeCategory === capability.presentation.outcomeCategory)) issues.push(`${where}: capability ${binding.capabilityId} has an outcome category no explorer group presents`);
      if (capability.destination.workflowOnly || capability.recommendation.mode === 'WORKFLOW_ONLY') issues.push(`${where}: ${binding.capabilityId} is workflow-only, not general discovery`);
      if (!capability.presentation.intentAliases.length) issues.push(`${where}: capability ${binding.capabilityId} has no approved intent aliases to search`);
      const label = binding.label?.trim().toLowerCase();
      if (label && (label === capability.presentation.label.trim().toLowerCase() || label === binding.capabilityId.replace(/-/g, ' '))) issues.push(`${where}: label override duplicates the capability's own label`);
    }
    if (binding.label !== undefined && !binding.label.trim()) issues.push(`${where}: empty label override`);

    if (!(binding.operationId in ASK_OPERATION_DEFINITIONS)) {
      issues.push(`${where}: unknown operation ${binding.operationId}`);
      continue;
    }
    // Operation-to-capability ownership is the validated guidance bridge. A binding must agree with it, and the operation must be in it.
    const owner = ASK_OPERATION_CAPABILITY[binding.operationId];
    if (!owner) issues.push(`${where}: ${binding.operationId} has no capability in the skill guidance bridge`);
    else if (owner !== binding.capabilityId) issues.push(`${where}: the guidance bridge assigns ${binding.operationId} to ${owner}, not ${binding.capabilityId}`);

    const definition = getAskOperationDefinition(binding.operationId);
    if (!definition.requiresProperty) issues.push(`${where}: explorer entries are property-scoped, ${binding.operationId} is not`);
    if (!getAskAudiencePolicy(binding.operationId, definition.version)) issues.push(`${where}: ${binding.operationId} has no audience policy`);
    if (definition.family === 'GENERAL_HOME_GUIDANCE') issues.push(`${where}: ${binding.operationId} is the grounded-guidance fallback`);
    const command = getAskDomainCommandByOperation(binding.operationId);
    if (binding.kind === 'READ') {
      if (command || definition.family === 'COMMAND' || definition.family === 'MONITOR') issues.push(`${where}: a READ entry cannot be the command ${binding.operationId}`);
      if (binding.consequence) issues.push(`${where}: a READ entry has no consequence to state`);
    } else {
      if (!command) issues.push(`${where}: a GOVERNED_WORKFLOW must be a registered, confirmation-gated domain command`);
      if (!binding.consequence?.trim() || !/confirm/i.test(binding.consequence)) issues.push(`${where}: a GOVERNED_WORKFLOW must state that nothing happens until the homeowner confirms`);
      if (binding.interactionType !== 'START_WORKFLOW') issues.push(`${where}: a GOVERNED_WORKFLOW starts a workflow`);
    }
    if (binding.launch === 'SELECTOR') {
      // The explorer has no picker of its own: an idea that needs a chosen target must name a domain-owned selector for exactly this operation.
      const selector = binding.selectorId ? getAskTargetSelector(binding.selectorId) : undefined;
      if (!selector) issues.push(`${where}: a SELECTOR launch must name a registered target selector`);
      else if (selector.operationId !== binding.operationId) issues.push(`${where}: selector ${selector.id} launches ${selector.operationId}, not ${binding.operationId}`);
      if (binding.interactionType !== 'START_WORKFLOW') issues.push(`${where}: a SELECTOR launch starts a workflow`);
    } else if (binding.selectorId) {
      issues.push(`${where}: selectorId is only valid with a SELECTOR launch`);
    } else if (binding.launch === 'MESSAGE') {
      if (!definition.messageRoutable) issues.push(`${where}: ${binding.operationId} is internal-only, so it needs DECLARED_OPERATION launch`);
      else if (resolveAskOperation(binding.question).operationId !== binding.operationId) issues.push(`${where}: question does not resolve to ${binding.operationId}`);
    } else if (definition.messageRoutable) {
      issues.push(`${where}: ${binding.operationId} is message-routable, so it launches by MESSAGE`);
    }
  }
  return issues;
}

/**
 * Startup validator for the capability-card entry reads that now share this binding source: each names a real capability and operation, and
 * agrees with the guidance bridge except for the pinned, documented disagreements. A listed disagreement that stops being true fails too, so
 * the allowlist cannot go stale.
 */
export function validateAskCapabilityBindings(
  cardBindings: Readonly<Record<string, { operationId: AskOperationId; message: string }>> = CARD_ENTRY_BINDINGS,
  known: Readonly<Record<string, AskOperationId>> = KNOWN_CARD_BRIDGE_DISAGREEMENTS,
  registry: Pick<ToolCapabilityRegistry, 'getById'> = canonicalCapabilityRegistry,
): string[] {
  const issues: string[] = [];
  for (const [capabilityId, binding] of Object.entries(cardBindings)) {
    const where = `card-binding/${capabilityId}`;
    if (!registry.getById(capabilityId)) issues.push(`${where}: unknown capability`);
    if (!(binding.operationId in ASK_OPERATION_DEFINITIONS)) { issues.push(`${where}: unknown operation ${binding.operationId}`); continue; }
    if (!binding.message.trim()) issues.push(`${where}: missing launch message`);
    const owner = ASK_OPERATION_CAPABILITY[binding.operationId];
    const disagrees = owner !== capabilityId;
    const pinned = known[capabilityId] === binding.operationId;
    if (disagrees && !pinned) issues.push(`${where}: the guidance bridge assigns ${binding.operationId} to ${owner ?? 'no capability'}, not ${capabilityId}; fix the binding or pin it in KNOWN_CARD_BRIDGE_DISAGREEMENTS with a reason`);
    if (!disagrees && pinned) issues.push(`${where}: pinned as a bridge disagreement but now agrees; remove it from KNOWN_CARD_BRIDGE_DISAGREEMENTS`);
  }
  for (const [capabilityId, operationId] of Object.entries(known)) {
    if (cardBindings[capabilityId]?.operationId !== operationId) issues.push(`card-binding/${capabilityId}: pinned disagreement for ${operationId} no longer matches a card binding`);
  }
  return issues;
}
