// Presentation Quality 5: a mechanical, drift-proof classification of every registered Ask operation against the presentation quality
// plan. It reads only registry facts (family, allowed block types, routability) plus an explicit list of operations this effort
// reviewed with the evidence for each. "Reviewed" means covered by a behavioral fixture or a contract-level journey test; it is not
// runtime verification. The ledger is generated into docs by scripts/generate-ask-adoption-ledger.js, and a test fails if an
// operation is added without a class.
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../askOperationRegistry';

export const ADOPTION_CLASSES = [
  'ALREADY_COMPLIANT',
  'REQUIRES_COLLECTION_ADOPTION',
  'REQUIRES_TRUST_ADOPTION',
  'COMPACT_RECEIPT',
  'SPECIALIZED_REVIEW_LATER',
  'NOT_APPLICABLE',
] as const;
export type AdoptionClass = typeof ADOPTION_CLASSES[number];

export interface AdoptionEntry {
  operationId: string;
  adoptionClass: AdoptionClass;
  reason: string;
}

/** Operations this effort covered with a fixture or journey test, and what covers each. Every key must be a registered operation. */
export const REVIEWED_OPERATIONS: Readonly<Record<string, string>> = {
  HOME_STATUS_BOARD: 'collection descriptor, unknown-is-not-good section, lead sentence; fixtures and journey 1',
  REFINANCE_ANALYSIS: 'scenario answer: tradeoff lead, assumptions, dated benchmark; fixtures and journey 2 (the canonical analysis branch is not a pure builder)',
  BREAK_EVEN_ANALYSIS: 'audited against the COMPARE profile; fixture',
  SEASONAL_HOME_CARE: 'plan and walkthrough fixtures; declared truncation; journey 3',
  MATERIAL_SPECS_LIST: 'record-explorer fixture',
  HOME_TIMELINE_EVENTS: 'timeline fixture',
  COVERAGE_REVIEW_STATUS: 'audited against the ATTENTION profile; fixture',
  DOCUMENT_LOOKUP: 'collection descriptor (Phase 5)',
  INVENTORY_LOOKUP: 'collection descriptor and gated Next control (Phase 2)',
  HOME_EVENT_RADAR_FEED: 'collection descriptor with cursor continuation (Phase 2)',
  WARRANTY_LOOKUP: 'item-scoped answer, journey 4 (the whole-home list is not yet migrated)',
  REPLACEMENT_GUIDANCE: 'item-carrying warranty follow-up, journey 4',
  HVAC_DECISION_START: 'item-carrying warranty follow-up on the decision card, journey 4',
  BUYER_DEADLINES: 'exact task identity, reconciliation, journey 5',
  BUYER_PLAN_STATUS: 'reconciliation, journey 5',
  FINANCING_OVERVIEW: 'ways-to-pay comparison with structured rate evidence (Phase 5 follow-up); overview and project fixtures',
  INSPECTION_REPORT_COMPARE: 'document-evidence fixture',
};

const LIST_BLOCKS = ['GROUPED_LIST', 'TABLE', 'TIMELINE', 'PRIORITY_LIST'];

export function classifyAdoption(operationId: string): AdoptionEntry {
  const definition = ASK_OPERATION_DEFINITIONS[operationId as AskOperationId];
  if (!definition) throw new Error(`Unknown Ask operation ${operationId}`);
  const reviewed = REVIEWED_OPERATIONS[operationId];
  if (reviewed) return { operationId, adoptionClass: 'ALREADY_COMPLIANT', reason: `Covered in this effort: ${reviewed}.` };

  const { family } = definition;
  if (family === 'UNSAFE_OR_RESTRICTED' || family === 'OUT_OF_SCOPE') {
    return { operationId, adoptionClass: 'NOT_APPLICABLE', reason: 'A safety or scope boundary, not a presentation pattern; its copy is governed by the safety policy.' };
  }
  if (family === 'COMMAND') {
    // Verified against what a command may emit, not its family alone: the runtime checks every emitted block against this allow-list
    // (assertSkillResultBlocksAllowed), so a command whose list cannot include a list, table or timeline can only return a compact result.
    if (definition.allowedBlockTypes.some((type) => LIST_BLOCKS.includes(type))) {
      return { operationId, adoptionClass: 'REQUIRES_COLLECTION_ADOPTION', reason: 'A command whose result may carry a list (for example a choice of target): collection semantics apply, and the boundary derives them until the producer declares its own.' };
    }
    return { operationId, adoptionClass: 'COMPACT_RECEIPT', reason: 'A confirmed write or proposal that is allowed only compact blocks (no list, table or timeline), so its result is a receipt or review card and no rich pattern migration applies. Receipt quality checks (answer first, one primary action) can use the evaluator.' };
  }
  if (family === 'DECISION_ANALYSIS' || family === 'MONITOR') {
    return { operationId, adoptionClass: 'REQUIRES_TRUST_ADOPTION', reason: 'A material decision or monitor: needs rationale, basis date, assumptions and limits checked against the COMPARE or monitor profile.' };
  }
  if (family === 'WORKFLOW_GUIDANCE' || family === 'CAPABILITY_DISCOVERY' || family === 'GENERAL_HOME_GUIDANCE') {
    return { operationId, adoptionClass: 'SPECIALIZED_REVIEW_LATER', reason: 'A guide, discovery or grounded-guidance workflow with its own presentation; review against the GUIDE profile later.' };
  }
  if (definition.allowedBlockTypes.some((type) => LIST_BLOCKS.includes(type))) {
    return { operationId, adoptionClass: 'REQUIRES_COLLECTION_ADOPTION', reason: 'A read that can return a list or table. The boundary derives a conservative descriptor (no continuation unless it pages) so no Next control is offered that nothing serves; the producer should declare its true source total.' };
  }
  return { operationId, adoptionClass: 'SPECIALIZED_REVIEW_LATER', reason: 'A read with no list or table block allowed: a direct-answer profile only, not yet audited.' };
}

export function buildAdoptionLedger(): AdoptionEntry[] {
  return Object.keys(ASK_OPERATION_DEFINITIONS).sort().map(classifyAdoption);
}
