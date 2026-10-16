// Presentation Quality 5: a mechanical, drift-proof classification of every registered Ask operation against the presentation quality
// plan. It reads only registry facts (family, allowed block types, routability) plus an explicit list of operations this effort
// reviewed with the evidence for each. "Reviewed" means covered by a behavioral fixture, a contract-level journey test, or an
// explicit producer-contract review recorded below; it is not runtime verification. The ledger is generated into docs by
// scripts/generate-ask-adoption-ledger.js, and a test fails if an
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
  HVAC_DECISION_SCENARIO: 'completed scenario comparison now declares its dated Decision Platform engine basis and an explicit isolated-scenario limitation',
  HVAC_SPECIALIST_ENGAGE: 'ready Specialist recommendation carries its canonical snapshot date, Decision Platform engine version, deterministic rationale and an explicit professional boundary',
  SELLER_PREP_CHECKLIST: 'checklist declares its progress basis, canonical Property Sale Case freshness and an explicit listing/disclosure boundary',
  CAPITAL_RESERVE_PLAN: 'reserve-plan summary and timeline are covered by capital timeline fixtures and declare dated planning evidence plus a cost/timing boundary',
  HVAC_DECISION_CONTINUE: 'decision-thread fixtures cover deterministic rationale, canonical-fact evidence, preference references, assumptions and limitations',
  PROPERTY_TAX_APPEAL_READINESS: 'appeal-readiness fixtures cover gaps and canonical facts with reviewed-rule/evidence dates and a tax/appraisal/legal boundary',
  QUOTE_COMPARISON_REVIEW: 'quote-review fixtures cover scope-aligned comparison, per-quote freshness, recorded-evidence dates and the provider-endorsement boundary',
  RENOVATION_PERMIT_READINESS: 'renovation-readiness fixtures cover the blocking-item basis, dated readiness sources and the legal-compliance boundary',
  SELL_HOLD_RENT_ANALYSIS: 'comparison and what-if fixtures cover the directional rationale, dated model sources, material assumptions and financial/tax/legal boundary',
  HOME_DEADLINE_MONITOR: 'monitor proposal resolves one canonical dated obligation and discloses due date, lead time, delivery channel, consent and no-change states before confirmation',
  REFINANCE_RATE_MONITOR: 'monitor proposal declares the governed benchmark, exact threshold, delivery cadence, quiet hours, source boundary and consent before confirmation',
  BUYER_DISCLOSURE_FUNDS_READINESS: 'direct readiness answer carries canonical Closing Disclosure workspace freshness and the wire-fraud safety boundary',
  BUYER_DOCUMENT_READINESS: 'direct document-readiness answer reports recorded/verified scope without fabricating an observation timestamp',
  BUYER_INSPECTION_REVIEW: 'direct inspection answer states the exact open-material-finding rationale and preserves the buyer professional boundary',
  CAPABILITY_DISCOVERY: 'answer-first discovery result explains the match basis before presenting live registry capabilities and readiness',
  DIY_PROJECT_GUIDE: 'reviewed guide fixtures cover canonical project progress, current step, refusal/finished states and permission-aware actions',
  GROUNDED_GUIDANCE: 'grounded answer declares property/general scope, source evidence when available, confidence limitations and a professional boundary',
  GUIDANCE_JOURNEY_CREATE: 'workflow proposal requires a canonical item or approved service, then presents scope and plan type for confirmation before creation',
  HOME_CHANGE_SUMMARY: 'answer-first 30-day summary scopes covered sources before canonical, deduplicated change blocks and preserves honest empty/unavailable states',
  INCIDENT_CONTINUATION: 'answer-first continuation declares recorded workflow choices, canonical record freshness and an emergency-response boundary',
  MAJOR_EVENT_ENTRY: 'event-specific answer wraps governed capability discovery with an explicit legal, tax, insurance, safety and professional boundary',
  MAINTENANCE_STATUS: 'maintenance shelves declare exact canonical totals, delivered rows and server-window continuation state',
  MAINTENANCE_FORECAST: 'forecast list declares the complete prediction total and honest first-20 delivery truncation with no unsupported continuation',
  MAINTENANCE_BUDGET_FORECAST: 'budget breakdown declares complete category and month totals with no truncation or continuation',
  MAINTENANCE_TEMPLATES_BROWSE: 'template catalogue declares source, fetched and delivered totals across applicability buckets without offering unsupported continuation',
  BUYER_CLOSING_DAY_READINESS: 'closing-day blockers declare the complete canonical blocker total and honest bounded delivery with no unsupported continuation',
  BUYER_CONTRACT_TIMELINE: 'draft and confirmed contingency lists each declare their complete revision-scoped totals and bounded delivery',
  BUYER_COST_READINESS: 'recorded cost items declare the complete eligible task total and bounded delivery',
  BUYER_FINANCING_READINESS: 'unresolved lender conditions declare the complete readiness-workspace total and bounded delivery',
  BUYER_INSURANCE_READINESS: 'insurance quotes and requirements independently declare their complete workspace totals and bounded delivery',
  BUYER_LOAN_ESTIMATES: 'active offer revisions declare their complete comparison total and bounded delivery',
  BUYER_MOVE_STATUS: 'open move tasks declare the complete canonical filtered total and bounded delivery',
  BUYER_NEGOTIATION_READINESS: 'negotiation findings declare the complete canonical inspection-finding total and bounded delivery',
  BUYER_TASK_UPDATE: 'the ambiguous-target command declares the complete eligible task total and bounded selection list',
  BUYER_TITLE_ESCROW_READINESS: 'open title and escrow issues declare the complete workspace total and bounded delivery',
  BUYER_WALKTHROUGH_READINESS: 'walkthrough observations and issues independently declare their complete workspace totals and bounded delivery',
  CLAIM_CHECKLIST_VIEW: 'claim checklist declares its authoritative item total, bounded fetched rows and delivered rows without unsupported continuation',
  CLAIM_TRANSITION: 'the ambiguous claim-target command declares the authoritative claim total and bounded fetched selection rows',
  COVERAGE_COMPARISON_STATUS: 'the grouped-list comparison branch declares the complete option total and bounded delivery; compact comparison-strip branches are lossless',
  COVERAGE_GAPS: 'the filtered item review declares its complete result total and per-group bounded delivery',
  INCIDENT_CLAIM_STATUS: 'the status view declares exact bucket-count source totals, bounded fetched rows and delivered rows for every filter state',
  INSPECTION_FINDINGS: 'open confirmed findings declare their authoritative filtered total, bounded fetch and delivered deck rows',
  INSPECTION_FINDING_UPDATE: 'both the ambiguous-target selection and batch-review branches declare their authoritative collection semantics',
  INSPECTION_NEGOTIATION_PACKAGE: 'the negotiation package declares the authoritative open-finding total, bounded serious-finding fetch and delivered decisions',
  INSPECTION_REPORTS: 'inspection reports declare their authoritative non-archived total, bounded fetch and delivered report rows',
  INSPECTION_REPORT_FINDINGS: 'one report’s findings declare their authoritative total, bounded fetch and delivered outcome rows',
  NEGOTIATION_SHIELD_CASES: 'case lists and every review subcollection declare source, fetched and delivered totals without unsupported continuation',
  NEGOTIATION_SHIELD_CASE_ANALYZE: 'the confirmed analysis reuses the fully declared review collections in its completion receipt',
  NEGOTIATION_SHIELD_CASE_START: 'the fixed scenario choice grid declares its complete lossless collection',
  DOCUMENT_PROMOTION_REVIEW: 'the bounded cross-domain review queue declares its authoritative database total and fetched candidates',
  HOME_DIGITAL_WILL: 'the enabled-entry and trusted-contact sections declare their complete in-memory totals',
  HOME_ACTIONS: 'single-property and all-property action shelves declare exact source, fetched and delivered totals for their projected feeds',
  OPERATIONAL_WORK_UPDATE: 'the ambiguous-target command declares the complete tracked-work total and bounded selection rows',
  PROPERTY_SUMMARY: 'room and completeness collections declare their authoritative totals and bounded delivery',
  INVENTORY_ITEM_CORRECT: 'the ambiguous-target command declares the complete inventory total and bounded selection rows',
  HOME_EVENT_CORRECT: 'the ambiguous-target command pairs its bounded event read with an authoritative visible-event count',
  HOME_EVENT_VISIBILITY: 'the ambiguous-target command pairs its bounded event read with an authoritative visible-event count',
  WARRANTY_CORRECT: 'the ambiguous-target command declares the requester-owned warranty total and bounded fetched selection rows',
  ROOM_RENAME: 'the ambiguous-target command pairs its bounded room read with an authoritative room count',
  INTELLIGENCE_ENVELOPE_QUERY: 'the paged Envelope read declares fetched and delivered rows, an unknown global total, and the real continuation state',
  ROOM_CREATE: 'producer-contract review: the actual workflow emits capture, summary and confirmation blocks only; its broad command allow-list does not represent a list-producing path',
  INVENTORY_ITEM_CREATE: 'producer-contract review: the actual workflow emits capture, summary and confirmation blocks only; its broad command allow-list does not represent a list-producing path',
  DIY_PROJECTS: 'active DIY projects pair their cursor-bounded read with the authoritative active-project count and advertise no unsupported continuation',
  DIY_TEMPLATE_BROWSE: 'reviewed, eligible and applicable templates are evaluated as a complete source set before bounded delivery, with no unsupported continuation',
  GUIDANCE_JOURNEYS_LIST: 'the fully surfaced, protection-reconciled journey set declares exact source, fetched and delivered totals by urgency',
  GUIDANCE_JOURNEY_CONTINUE: 'one journey’s complete live step set declares exact source, fetched and delivered totals by status',
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
