import type { AskCaptureRequest, AskClarification, AskConfirmation, AskExecutionStatus, AskPresentationBlock } from '../../productFramework/ask/ask.contract';

export type AskIntentFamily =
  | 'RECORD_QUERY'
  | 'STATUS_SUMMARY'
  | 'CAPABILITY_DISCOVERY'
  | 'WORKFLOW_GUIDANCE'
  | 'GENERAL_HOME_GUIDANCE'
  | 'OUT_OF_SCOPE'
  | 'UNSAFE_OR_RESTRICTED';

export type AskOperationId =
  | 'MAINTENANCE_STATUS'
  | 'MAINTENANCE_TASK_CREATE'
  | 'MAINTENANCE_TASK_COMPLETE'
  | 'MAINTENANCE_TASK_UPDATE'
  | 'COVERAGE_GAPS'
  | 'SAVINGS_OPPORTUNITIES'
  | 'OWNERSHIP_COSTS'
  | 'INVENTORY_LOOKUP'
  | 'PROPERTY_SUMMARY'
  | 'HOME_ACTIONS'
  | 'CAPABILITY_DISCOVERY'
  | 'REPLACEMENT_GUIDANCE'
  | 'REFINANCE_ANALYSIS'
  | 'REFINANCE_RATE_MONITOR'
  | 'SELL_HOLD_RENT_ANALYSIS'
  | 'HOUSEHOLD_INVITATION'
  | 'GUIDANCE_JOURNEY_CREATE'
  | 'QUOTE_COMPARISON_CREATE'
  | 'QUOTE_COMPARISON_REVIEW'
  | 'HOME_DEADLINE_MONITOR'
  | 'CAPITAL_RESERVE_PLAN'
  | 'PROPERTY_TAX_APPEAL_READINESS'
  | 'RENOVATION_PERMIT_READINESS'
  | 'MAJOR_EVENT_ENTRY'
  | 'EMERGENCY_BOUNDARY'
  | 'UNSAFE_RESTRICTED_BOUNDARY'
  | 'OUT_OF_SCOPE_BOUNDARY'
  | 'GROUNDED_GUIDANCE';

export interface AskOperationResolution {
  operationId: AskOperationId;
  version: string;
  family: AskIntentFamily;
  confidence: number;
  requiresProperty: boolean;
}

export type AskExecutionMode = 'DETERMINISTIC' | 'REMOTE_GENERATION';
export type AskSafetyClass = 'STANDARD' | 'MATERIAL_DECISION' | 'EMERGENCY_BOUNDARY' | 'UNSAFE_RESTRICTED_BOUNDARY' | 'OUT_OF_SCOPE_BOUNDARY';
export type AskPropertyRoleFloor = 'VIEWER' | 'CONTRIBUTOR' | 'OWNER' | null;

export interface AskOperationDefinition extends AskOperationResolution {
  executionMode: AskExecutionMode;
  safetyClass: AskSafetyClass;
  propertyRoleFloor: AskPropertyRoleFloor;
  adapterKey: string;
  allowedBlockTypes: AskPresentationBlock['type'][];
  evalSuite: string;
}

export interface AskOperationResult {
  status: AskExecutionStatus;
  reasonCode?: string;
  contextVersion?: string | null;
  blocks: AskPresentationBlock[];
  captureRequests?: AskCaptureRequest[];
  clarification?: AskClarification | null;
  confirmation?: AskConfirmation | null;
  suggestions: string[];
  parameters?: Record<string, unknown>;
}

const CAPABILITY_CONTINUITY_OPERATIONS = new Set<AskOperationId>([
  'MAINTENANCE_STATUS', 'MAINTENANCE_TASK_CREATE', 'MAINTENANCE_TASK_COMPLETE',
  'MAINTENANCE_TASK_UPDATE', 'GUIDANCE_JOURNEY_CREATE', 'QUOTE_COMPARISON_CREATE', 'QUOTE_COMPARISON_REVIEW', 'HOME_DEADLINE_MONITOR',
  'CAPITAL_RESERVE_PLAN', 'PROPERTY_TAX_APPEAL_READINESS', 'RENOVATION_PERMIT_READINESS', 'MAJOR_EVENT_ENTRY',
  'COVERAGE_GAPS', 'SAVINGS_OPPORTUNITIES', 'OWNERSHIP_COSTS', 'INVENTORY_LOOKUP',
  'PROPERTY_SUMMARY', 'HOME_ACTIONS', 'REPLACEMENT_GUIDANCE', 'REFINANCE_ANALYSIS',
  'REFINANCE_RATE_MONITOR', 'SELL_HOLD_RENT_ANALYSIS',
]);

const definition = (
  operationId: AskOperationId,
  family: AskIntentFamily,
  requiresProperty: boolean,
  executionMode: AskExecutionMode,
  safetyClass: AskSafetyClass,
  propertyRoleFloor: AskPropertyRoleFloor,
  adapterKey: string,
  allowedBlockTypes: AskPresentationBlock['type'][],
): AskOperationDefinition => ({
  operationId,
  version: '1.0',
  family,
  confidence: 1,
  requiresProperty,
  executionMode,
  safetyClass,
  propertyRoleFloor,
  adapterKey,
  allowedBlockTypes: CAPABILITY_CONTINUITY_OPERATIONS.has(operationId)
    ? [...new Set([...allowedBlockTypes, 'CAPABILITY_LIST' as const])]
    : allowedBlockTypes,
  evalSuite: `ask-${operationId.toLowerCase().replace(/_/g, '-')}-golden`,
});

export const ASK_OPERATION_DEFINITIONS: Readonly<Record<AskOperationId, AskOperationDefinition>> = Object.freeze({
  MAINTENANCE_STATUS: definition('MAINTENANCE_STATUS', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'maintenance.status', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'WORKFLOW_PROGRESS']),
  MAINTENANCE_TASK_CREATE: definition('MAINTENANCE_TASK_CREATE', 'WORKFLOW_GUIDANCE', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'maintenance.create', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  MAINTENANCE_TASK_COMPLETE: definition('MAINTENANCE_TASK_COMPLETE', 'WORKFLOW_GUIDANCE', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'maintenance.complete', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  MAINTENANCE_TASK_UPDATE: definition('MAINTENANCE_TASK_UPDATE', 'WORKFLOW_GUIDANCE', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'maintenance.update', ['SUMMARY', 'GROUPED_LIST', 'WORKFLOW_PROGRESS']),
  COVERAGE_GAPS: definition('COVERAGE_GAPS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'coverage.review', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE']),
  SAVINGS_OPPORTUNITIES: definition('SAVINGS_OPPORTUNITIES', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'savings.opportunities', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE']),
  OWNERSHIP_COSTS: definition('OWNERSHIP_COSTS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'ownership.costs', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE']),
  INVENTORY_LOOKUP: definition('INVENTORY_LOOKUP', 'RECORD_QUERY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'inventory.lookup', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE']),
  PROPERTY_SUMMARY: definition('PROPERTY_SUMMARY', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'STANDARD', 'VIEWER', 'property.summary', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE']),
  HOME_ACTIONS: definition('HOME_ACTIONS', 'STATUS_SUMMARY', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'home-actions.feed', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE']),
  CAPABILITY_DISCOVERY: definition('CAPABILITY_DISCOVERY', 'CAPABILITY_DISCOVERY', false, 'DETERMINISTIC', 'STANDARD', null, 'capability.discovery', ['SUMMARY', 'CAPABILITY_LIST']),
  REPLACEMENT_GUIDANCE: definition('REPLACEMENT_GUIDANCE', 'GENERAL_HOME_GUIDANCE', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'inventory.replacement', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  REFINANCE_ANALYSIS: definition('REFINANCE_ANALYSIS', 'GENERAL_HOME_GUIDANCE', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'refinance.analysis', ['SUMMARY', 'TABLE', 'EVIDENCE', 'WORKFLOW_PROGRESS']),
  REFINANCE_RATE_MONITOR: definition('REFINANCE_RATE_MONITOR', 'GENERAL_HOME_GUIDANCE', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'refinance.monitor', ['SUMMARY', 'MONITOR', 'WORKFLOW_PROGRESS']),
  SELL_HOLD_RENT_ANALYSIS: definition('SELL_HOLD_RENT_ANALYSIS', 'GENERAL_HOME_GUIDANCE', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'sale-case.analysis', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE']),
  HOUSEHOLD_INVITATION: definition('HOUSEHOLD_INVITATION', 'WORKFLOW_GUIDANCE', true, 'DETERMINISTIC', 'STANDARD', 'OWNER', 'household.invitation', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  GUIDANCE_JOURNEY_CREATE: definition('GUIDANCE_JOURNEY_CREATE', 'WORKFLOW_GUIDANCE', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'guidance.journey.create', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  QUOTE_COMPARISON_CREATE: definition('QUOTE_COMPARISON_CREATE', 'WORKFLOW_GUIDANCE', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'CONTRIBUTOR', 'quote-comparison.create', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  QUOTE_COMPARISON_REVIEW: definition('QUOTE_COMPARISON_REVIEW', 'GENERAL_HOME_GUIDANCE', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'quote-comparison.review', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  HOME_DEADLINE_MONITOR: definition('HOME_DEADLINE_MONITOR', 'WORKFLOW_GUIDANCE', true, 'DETERMINISTIC', 'STANDARD', 'CONTRIBUTOR', 'home-deadline.monitor', ['SUMMARY', 'WORKFLOW_PROGRESS']),
  CAPITAL_RESERVE_PLAN: definition('CAPITAL_RESERVE_PLAN', 'GENERAL_HOME_GUIDANCE', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'capital-reserve.plan', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  PROPERTY_TAX_APPEAL_READINESS: definition('PROPERTY_TAX_APPEAL_READINESS', 'GENERAL_HOME_GUIDANCE', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'property-tax.appeal-readiness', ['SUMMARY', 'GROUPED_LIST', 'TABLE', 'EVIDENCE', 'BOUNDARY']),
  RENOVATION_PERMIT_READINESS: definition('RENOVATION_PERMIT_READINESS', 'GENERAL_HOME_GUIDANCE', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'renovation-permit.readiness', ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'BOUNDARY']),
  MAJOR_EVENT_ENTRY: definition('MAJOR_EVENT_ENTRY', 'WORKFLOW_GUIDANCE', true, 'DETERMINISTIC', 'MATERIAL_DECISION', 'VIEWER', 'major-event.entry', ['SUMMARY', 'CAPABILITY_LIST', 'BOUNDARY']),
  EMERGENCY_BOUNDARY: definition('EMERGENCY_BOUNDARY', 'UNSAFE_OR_RESTRICTED', false, 'DETERMINISTIC', 'EMERGENCY_BOUNDARY', null, 'boundary.emergency', ['BOUNDARY']),
  UNSAFE_RESTRICTED_BOUNDARY: definition('UNSAFE_RESTRICTED_BOUNDARY', 'UNSAFE_OR_RESTRICTED', false, 'DETERMINISTIC', 'UNSAFE_RESTRICTED_BOUNDARY', null, 'boundary.unsafe-restricted', ['BOUNDARY']),
  OUT_OF_SCOPE_BOUNDARY: definition('OUT_OF_SCOPE_BOUNDARY', 'OUT_OF_SCOPE', false, 'DETERMINISTIC', 'OUT_OF_SCOPE_BOUNDARY', null, 'boundary.out-of-scope', ['BOUNDARY']),
  GROUNDED_GUIDANCE: definition('GROUNDED_GUIDANCE', 'GENERAL_HOME_GUIDANCE', false, 'REMOTE_GENERATION', 'STANDARD', null, 'grounded.guidance', ['SUMMARY', 'EVIDENCE', 'BOUNDARY']),
});

export function getAskOperationDefinition(operationId: AskOperationId): AskOperationDefinition {
  return ASK_OPERATION_DEFINITIONS[operationId];
}

export function validateAskOperationDefinitions(): string[] {
  const ids = new Set<string>();
  const issues: string[] = [];
  for (const [key, entry] of Object.entries(ASK_OPERATION_DEFINITIONS)) {
    if (key !== entry.operationId) issues.push(`${key}: operationId mismatch`);
    if (ids.has(entry.operationId)) issues.push(`${key}: duplicate operationId`);
    ids.add(entry.operationId);
    if (!entry.version || !entry.adapterKey || !entry.evalSuite) issues.push(`${key}: missing version, adapter, or eval declaration`);
    if (!entry.allowedBlockTypes.length) issues.push(`${key}: no allowed result blocks`);
    if (entry.requiresProperty && entry.propertyRoleFloor == null) issues.push(`${key}: property operation has no authorization floor`);
    if (entry.safetyClass.endsWith('_BOUNDARY') && !entry.allowedBlockTypes.includes('BOUNDARY')) issues.push(`${key}: boundary operation lacks boundary result`);
  }
  return issues;
}

const emergencyPattern = /\b(smell(?:ing)? gas|gas leak|carbon monoxide|\bco alarm|sparks? (?:from|at)|electrical fire|actively flooding.*electric|fire now)\b/i;
const unsafeRestrictedPattern = /\b(?:bypass|avoid|evade|skip|work around)\b.{0,60}\b(?:permit|inspection|code|licen[cs]e|hoa|disclosure)\b|\b(?:disable|disconnect|remove|tamper with|cover|block)\b.{0,60}\b(?:smoke|carbon monoxide|co|fire|safety)\s*(?:detector|alarm|device)?\b|\b(?:conceal|hide|omit|misrepresent)\b.{0,80}\b(?:damage|defect|mold|leak|flood|fire|buyer|insurer|inspector|lender)\b|\b(?:remove|alter|cut|demolish|open up)\b.{0,70}\b(?:load[- ]bearing|structural)\b.{0,70}\b(?:wall|beam|column|support)?\b|\b(?:load[- ]bearing|structural)\b.{0,70}\b(?:without|skip|avoid|myself|diy)\b.{0,40}\b(?:inspection|permit|engineer|approval)?\b|\b(?:guarantee|certify|confirm(?: definitively)?|promise|tell me (?:for sure|the exact))\b.{0,100}\b(?:approved|approval|eligible|eligibility|legal|compliant|safe|pass inspection|refinanc|mortgage|loan|insurance claim|tax appeal|damage|loss|claim|covered|coverage|sale price|sell for)\b/i;
const unauthorizedDataAccessPattern = /\b(?:show|list|give|export|send|reveal|access|download)\b.{0,50}\b(?:every|all|another|other)\b.{0,35}\b(?:users?[’']?s?|households?|homeowners?|customers?)\b.{0,45}\b(?:propert(?:y|ies)|records?|documents?|data|accounts?)\b|\b(?:uploaded|attached)\b.{0,40}\b(?:invoice|document|file)\b.{0,50}\b(?:says|instructs?|asks?)\b.{0,50}\b(?:send|share|upload|export)\b.{0,40}\b(?:records?|documents?|data)\b/i;
const outOfScopePattern = /\b(python|javascript|typescript|coding interview|video game|write (?:me )?(?:a )?program|never[- ]ending loop|system prompt|developer message|ignore (?:all |the )?(?:previous|prior) instructions|forget (?:all |the )?(?:previous|prior) instructions|override (?:the )?(?:system|developer|safety) instructions|pretend (?:that )?you are|act as (?:dan|an unrestricted)|reveal (?:your |the )?(?:prompt|instructions)|jailbreak|base64[- ]decode (?:this|the prompt)|drop (?:a )?(?:table|database)|(?:run|execute|apply) (?:this |the |a )?(?:sql|database query)|production database|delete (?:every|all) (?:property|user|record)|shell command|malware|ransomware|phishing|steal (?:a )?(?:password|credential)|celebrity news|school essay)\b/i;
const maintenancePattern = /\b(maintenance|maintain|task|tasks|overdue|due soon|what(?:'s| is) due|completed work|pending work|service history|what did (?:i|we) complete|work (?:i |we )?(?:completed|finished)|what should (?:i|we) do before (?:winter|spring|summer|fall|autumn))\b/i;
const maintenanceCreatePattern = /\b(?:create|add|schedule|set up)\b.{0,80}\b(?:maintenance(?: task)?|tasks?|gutter (?:cleaning|inspection)|clean(?:ing)? (?:the )?gutters?|filter change|(?:hvac|furnace|boiler|roof|water heater) (?:service|inspection|cleaning|repair|replacement))\b|\b(?:remind me to|put on my maintenance list)\b/i;
const maintenanceCompletePattern = /^\s*(?:please\s+)?(?:(?:mark|set)\b.{0,100}\b(?:task|maintenance|gutter|filter|service|inspection|cleaning|repair)\b.{0,100}\b(?:complete|completed|done)|(?:complete|finish)\b.{0,100}\b(?:task|maintenance|gutter|filter|service|inspection|cleaning|repair))\b|\b(?:i|we) (?:completed|finished)\b.{0,100}\b(?:task|maintenance|gutter|filter|service|inspection|cleaning|repair)\b/i;
const maintenanceUpdatePattern = /\b(?:reschedule|move|change|update|edit|assign|unassign|archive|cancel|reopen|restore)\b.{0,100}\b(?:maintenance|task|gutter|filter|service|inspection|cleaning|repair)\b|\b(?:maintenance|task|gutter|filter|service|inspection|cleaning|repair)\b.{0,100}\b(?:reschedule|assign|archive|cancel|reopen|priority|due date)\b/i;
const guidanceJourneyCreatePattern = /\b(?:start|create|open|begin)\b.{0,50}\b(?:guided plan|guidance journey|guided journey|step-by-step plan)\b/i;
const quoteComparisonCreatePattern = /\b(?:create|start|open|set up)\b.{0,50}\b(?:quote comparison|comparison workspace|workspace for (?:my )?(?:quotes|bids|proposals))\b/i;
const quoteComparisonReviewPattern = /\b(?:compare|review|show|evaluate|which)\b.{0,70}\b(?:quotes?|bids?|proposals?|estimates?)\b|\b(?:quotes?|bids?|proposals?)\b.{0,70}\b(?:compare|comparison|best|cheapest|differences?|review)\b/i;
const homeDeadlineMonitorPattern = /\b(?:notify|alert|remind|monitor|tell me)\b.{0,80}\b(?:maintenance|task|warranty|insurance|policy|coverage)\b.{0,50}\b(?:due|expire|expires|expiring|renewal)\b|\b(?:warranty|insurance|policy|coverage)\b.{0,50}\b(?:expire|expires|expiring|renewal)\b.{0,80}\b(?:notify|alert|remind|monitor|tell me)\b/i;
const capitalReservePattern = /\b(?:reserve fund|sinking fund|capital timeline|capital plan|major replacements?|future home expenses?|how much should i save|budget for (?:my )?(?:roof|hvac|systems?|replacements?))\b/i;
const propertyTaxAppealPattern = /\b(?:property tax|assessment|assessed value|tax class|tax exemption)\b.{0,80}\b(?:appeal|contest|challenge|readiness|overassessed|too high|evidence|deadline)\b|\b(?:appeal|contest|challenge)\b.{0,60}\b(?:property tax|assessment|assessed value|tax class|exemption)\b/i;
const renovationPermitPattern = /\b(?:renovation|remodel|addition|project|permit|inspection|hoa)\b.{0,80}\b(?:ready|readiness|start|require|needed|block|blocking|blockers?|compliance|status)\b|\b(?:can i start|am i ready|what is blocking|what are the blockers?)\b.{0,60}\b(?:renovation|remodel|project|work)\b/i;
const majorEventPattern = /\b(?:help|guide|prepare|plan|checklist|what should i do)\b.{0,70}\b(?:moving|move in|move out|selling my home|home sale|major renovation|remodeling|insurance claim|storm damage|new baby|aging in place)\b/i;
const coveragePattern = /\b(missing coverage|coverage gaps?|uncovered|warranty coverage|insurance coverage|items? (?:without|missing) (?:a )?(?:warranty|coverage)|warrant(?:y|ies) (?:are )?(?:expire|expiring|expiry)|coverage (?:is )?(?:expire|expiring|expiry)|evidence (?:for|of) (?:my )?(?:expensive|high[ -]?value)? ?(?:appliances?|items?|systems?))\b/i;
const savingsOpportunitiesPattern = /\b(where|how|ways?|opportunities?)\b.{0,45}\b(save|saving|savings|lower|reduce)\b.{0,35}\b(money|costs?|bills?|expenses?|insurance|internet|utilities|energy|warranty)\b|\b(?:where|how) (?:can|could|do) (?:i|we) save\b|\b(?:saving|savings) opportunities\b|\blower (?:my |our )?(?:home |household )?(?:costs?|bills?|expenses?)\b|\bwhat savings\b.{0,35}\b(?:realized|received|saved)\b|\b(?:fastest|shortest|best) payback\b/i;
const ownershipCostsPattern = /\b(?:how much|what does|what is|what are|show|break down)\b.{0,45}\b(?:home|house|housing|property|ownership)\b.{0,45}\b(?:cost|costs|expense|expenses|outflow)\b|\b(?:how much am i|what am i)\b.{0,45}\b(?:paying|spending)\b.{0,45}\b(?:home|house|housing|property)\b|\b(?:monthly|annual|yearly|total|true|ownership|operating|cash)\s+(?:home |house |housing |property )?(?:cost|costs|expenses?|outflow)\b|\bcost of owning\b|\b(?:largest|biggest|highest|most expensive)\b.{0,35}\b(?:home |ownership )?(?:cost|expense|category)\b|\bwhich (?:cost |expense )?categor(?:y|ies)\b.{0,35}\b(?:most|highest|largest)\b/i;
const inventoryLookupPattern = /\b(?:what do you know about|tell me about|show|find|list|which|do i have)\b.{0,65}\b(?:inventory|appliances?|systems?|equipment|hvac|furnace|air conditioner|heat pump|boiler|refrigerator|fridge|water heater|roof|washer|dryer|dishwasher)\b|\b(?:inventory|appliance|system|equipment)\s+(?:record|records|details|items|list)\b|\b(?:incomplete|missing)\b.{0,35}\b(?:inventory|appliance|system)\s+(?:record|records|details|information)\b|\b(?:my|the|this)\s+(?:hvac|furnace|air conditioner|heat pump|boiler|refrigerator|fridge|water heater|roof|washer|dryer|dishwasher)\b.{0,45}\b(?:history|record|details|information|know)\b|\b(?:systems?|equipment|appliances?)\b.{0,45}\b(?:end of life|expiry|expire|incomplete)\b/i;
const propertySummaryPattern = /\b(?:summarize|summary of|overview of|what do you know about|tell me about|show me)\b.{0,60}\b(?:my|this|the)?\s*(?:home|house|property|home record|living home record)\b|\b(?:home|property|living home)\s+(?:record )?(?:summary|overview|profile)\b|\bhow complete\b.{0,45}\b(?:home record|property profile|home profile|living home record)\b/i;
const homeActionsPattern = /\b(?:what should i do next|what needs (?:my |our )?attention|next best action|highest priority|top priorit(?:y|ies)|home actions?|what can wait|what should i plan|anything urgent|urgent home action|where should i start)\b/i;
const replacementPattern = /\b(when should i (?:replace|upgrade)|replace (?:my|the)|repair or replace|how (?:old|long).*(?:refrigerator|fridge)|(?:refrigerator|fridge).*(?:replace|replacement|lifespan|life expectancy))\b/i;
const refinanceAnalysisPattern = /\b(is (?:it )?(?:a )?good (?:time|option).*refinanc(?:e|ing)|should i refinanc(?:e|ing)|is refinanc(?:ing|e) (?:now )?(?:worth|good|right)|ideal (?:interest )?rate.*refinanc(?:e|ing)|what rate.*refinanc(?:e|ing)|refinanc(?:e|ing).*(?:worth it|make sense|good option))\b/i;
const refinanceMonitorPattern = /\b(?:notify|alert|let me know|monitor|tell me).*(?:mortgage |refinanc(?:e|ing) )?rates?.*(?:below|under|drop|reach)|\brates?.*(?:below|under|drop|reach).*(?:notify|alert|let me know|monitor|tell me)\b/i;
const sellHoldRentAnalysisPattern = /\b(?:should|could|would|will|is|when|benefit|better|compare|decide|planning|plan)\b.{0,55}\b(?:sell|selling|hold|holding|rent(?:ing)?(?: out)?|landlord)\b|\b(?:sell|selling)\b.{0,55}\b(?:hold|holding|rent(?:ing)?(?: out)?|landlord|good time|worth|benefit|better)\b|\b(?:hold|holding|rent(?:ing)?(?: out)?)\b.{0,55}\b(?:sell|selling|better|benefit)\b/i;
const householdInvitationPattern = /\b(?:invite|add|share (?:my|the) home with)\b.{0,50}\b(?:wife|husband|spouse|partner|family member|household member|someone|person)\b|\bhousehold\b.{0,40}\b(?:invite|invitation|add (?:a )?member)\b/i;
const explicitCapabilityPattern = /\b(?:tool|something (?:available|to help)|anything (?:available|to help)|what can help|do you have|feature available)\b/i;
const capabilityPattern = /\b(tool|something available|what can help|do you have|help me (?:with|plan)|refinanc|sell.*rent|compare.{0,40}(?:quotes?|bids?|proposals?|estimates?)|organize.{0,40}(?:records?|documents?|paperwork)|track.{0,40}(?:permits?|projects?)|plan.{0,40}(?:renovation|remodel|replacement)|savings?|rebates?|monitor)\b/i;

export function resolveAskOperation(message: string): AskOperationResolution {
  const resolved = (operationId: AskOperationId, confidence: number): AskOperationResolution => ({
    ...getAskOperationDefinition(operationId),
    confidence,
  });
  if (emergencyPattern.test(message)) {
    return resolved('EMERGENCY_BOUNDARY', 1);
  }
  if (unsafeRestrictedPattern.test(message)) {
    return resolved('UNSAFE_RESTRICTED_BOUNDARY', 0.99);
  }
  if (unauthorizedDataAccessPattern.test(message)) {
    return resolved('UNSAFE_RESTRICTED_BOUNDARY', 0.99);
  }
  if (outOfScopePattern.test(message)) {
    return resolved('OUT_OF_SCOPE_BOUNDARY', 0.99);
  }
  if (maintenanceCompletePattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('MAINTENANCE_TASK_COMPLETE', 0.97);
  }
  if (maintenanceUpdatePattern.test(message)) {
    return resolved('MAINTENANCE_TASK_UPDATE', 0.97);
  }
  if (guidanceJourneyCreatePattern.test(message)) {
    return resolved('GUIDANCE_JOURNEY_CREATE', 0.97);
  }
  if (quoteComparisonCreatePattern.test(message)) {
    return resolved('QUOTE_COMPARISON_CREATE', 0.97);
  }
  if (quoteComparisonReviewPattern.test(message) && !explicitCapabilityPattern.test(message) && !/\bcan you help me\b/i.test(message)) {
    return resolved('QUOTE_COMPARISON_REVIEW', 0.97);
  }
  if (homeDeadlineMonitorPattern.test(message)) {
    return resolved('HOME_DEADLINE_MONITOR', 0.97);
  }
  if (propertyTaxAppealPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('PROPERTY_TAX_APPEAL_READINESS', 0.98);
  }
  if (capitalReservePattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('CAPITAL_RESERVE_PLAN', 0.97);
  }
  if (renovationPermitPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('RENOVATION_PERMIT_READINESS', 0.97);
  }
  if (majorEventPattern.test(message)) {
    return resolved('MAJOR_EVENT_ENTRY', 0.96);
  }
  if (maintenanceCreatePattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('MAINTENANCE_TASK_CREATE', 0.97);
  }
  if (coveragePattern.test(message)) {
    return resolved('COVERAGE_GAPS', 0.96);
  }
  if (savingsOpportunitiesPattern.test(message)) {
    return resolved('SAVINGS_OPPORTUNITIES', 0.97);
  }
  if (ownershipCostsPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('OWNERSHIP_COSTS', 0.97);
  }
  if (inventoryLookupPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('INVENTORY_LOOKUP', 0.96);
  }
  if (propertySummaryPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('PROPERTY_SUMMARY', 0.96);
  }
  if (homeActionsPattern.test(message) && !explicitCapabilityPattern.test(message) && !maintenancePattern.test(message)) {
    return resolved('HOME_ACTIONS', 0.96);
  }
  if (maintenancePattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('MAINTENANCE_STATUS', 0.94);
  }
  if (replacementPattern.test(message)) {
    return resolved('REPLACEMENT_GUIDANCE', 0.96);
  }
  if (refinanceMonitorPattern.test(message)) {
    return resolved('REFINANCE_RATE_MONITOR', 0.98);
  }
  if (refinanceAnalysisPattern.test(message)) {
    return resolved('REFINANCE_ANALYSIS', 0.97);
  }
  if (sellHoldRentAnalysisPattern.test(message) && !explicitCapabilityPattern.test(message)) {
    return resolved('SELL_HOLD_RENT_ANALYSIS', 0.96);
  }
  if (householdInvitationPattern.test(message)) {
    return resolved('HOUSEHOLD_INVITATION', 0.98);
  }
  if (explicitCapabilityPattern.test(message) || capabilityPattern.test(message)) {
    return resolved('CAPABILITY_DISCOVERY', 0.88);
  }
  return resolved('GROUNDED_GUIDANCE', 0.55);
}
