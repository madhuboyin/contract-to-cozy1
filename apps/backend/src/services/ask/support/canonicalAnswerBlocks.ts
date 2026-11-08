// Ask handler support: canonical typed answers. An operation's handler names its answer blocks with a fixed prefix ("repair-replace-guidance",
// "plant-care-summary"). A result that carries such a block IS that operation's own answer, so the relevance check (which compares the answer's words
// with the question's and cannot tell "Roof: keep monitoring" from a quote comparison) has nothing left to decide. Without an entry here an
// operation's own correct answer can be refused as "not what you asked for" (review screenshots 2026-11-07: "do I need a new roof").
// Adding an operation: list the id prefix its handler uses for its answer blocks. The fallback's own block ("grounded-guidance") never counts.
import type { AskOperationId } from '../askOperationRegistry';

export const CANONICAL_ANSWER_BLOCK_ID_PREFIXES: Readonly<Partial<Record<AskOperationId, readonly string[]>>> = Object.freeze({
  // REPLACEMENT_GUIDANCE hands an HVAC item to the HVAC decision, whose answer blocks carry the decision's own prefix.
  REPLACEMENT_GUIDANCE: ['repair-replace-', 'hvac-decision-'],
  // Tool discovery: 'capability-discovery-summary' and 'capability-matches'. The cards describe tools in words that share little with the question.
  CAPABILITY_DISCOVERY: ['capability-'],
  PLANT_CARE_OUTLOOK: ['plant-care-'],
  MATERIAL_SPECS_LIST: ['material-specs-'],
  HOME_TIMELINE_EVENTS: ['home-timeline-'],
  NEIGHBORHOOD_CHANGE_FEED: ['neighborhood-change'],
  // Audit Phase 3 (2026-11-08): each prefix below was read from the operation's own handler (the ids its answer blocks carry), not guessed. A prefix that
  // another operation's handler also emits for a different job is not used here; an entry ending in '$' is an exact block id (used where a sibling
  // command handler shares the prefix, e.g. 'diy-projects' vs the command's 'diy-projects-back'). The contract test scans every handler to prove this. Deliberately NOT listed, because the routing sweep shows other questions
  // misrouted into them (the relevance check is what catches those): MAINTENANCE_BUDGET_FORECAST, MAINTENANCE_FORECAST, DOCUMENT_LOOKUP, INSPECTION_FINDINGS.
  APPLIANCE_FAILURE_RISK: ['appliance-oracle-'],
  WARRANTY_LOOKUP: ['warranty-summary$', 'warranty-results$', 'warranty-empty$', 'warranty-no-match$', 'warranty-show-all$', 'warranty-item-'],
  INCIDENT_CLAIM_STATUS: ['incident-claim-'],
  RECALL_REVIEW: ['recall-review-'],
  SELL_HOLD_RENT_ANALYSIS: ['sell-hold-rent-summary$', 'sell-hold-rent-assumptions$', 'sell-hold-rent-comparison$', 'sell-hold-rent-drivers$', 'sell-hold-rent-projection$', 'sell-hold-rent-keep-in-mind$', 'sell-hold-rent-tracked-decision$', 'sell-hold-rent-what-if-'],
  PROPERTY_TAX_APPEAL_READINESS: ['tax-readiness-'],
  BREAK_EVEN_ANALYSIS: ['break-even-'],
  DO_NOTHING_SIMULATION: ['do-nothing-summary$', 'do-nothing-board$', 'do-nothing-costs$', 'do-nothing-items$', 'do-nothing-losses$', 'do-nothing-metrics$', 'do-nothing-next$', 'do-nothing-risks$', 'do-nothing-scenarios$', 'do-nothing-status$', 'do-nothing-trace$'],
  HOA_COMPLIANCE_STATUS: ['hoa-compliance-'],
  SERVICE_PRICE_CHECKS: ['service-price-radar-'],
  // The single-project view of the same operation has its own ids (project-detail-*, project-execution-alignment, project-closeout-preview).
  PROJECT_TRACKER_PROJECTS: ['project-tracker-', 'project-detail-', 'project-execution-alignment$', 'project-closeout-preview$'],
  DIY_PROJECTS: ['diy-summary$', 'diy-projects$', 'diy-active$', 'diy-limit$'],
});

// A boundary or an evidence footer alone is not an answer.
const NOT_AN_ANSWER_BLOCK_TYPES = new Set(['BOUNDARY', 'EVIDENCE']);

export function matchesCanonicalAnswerBlocks(operationId: AskOperationId, result: { blocks: ReadonlyArray<{ type: string; id?: string }> }): boolean {
  const prefixes = CANONICAL_ANSWER_BLOCK_ID_PREFIXES[operationId];
  if (!prefixes) return false;
  return result.blocks.some((block) => !NOT_AN_ANSWER_BLOCK_TYPES.has(block.type) && typeof block.id === 'string' && prefixes.some((prefix) => (prefix.endsWith('$') ? block.id === prefix.slice(0, -1) : block.id!.startsWith(prefix))));
}
