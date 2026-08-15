import { createHash } from 'node:crypto';
import type { AskOperationId, AskOperationDefinition } from './askOperationRegistry';
import { getAskLanguageRegistration } from './askLanguageRegistry';

export type AskOperationEffect = 'READ' | 'WRITE' | 'MONITOR' | 'BOUNDARY';
export type AskOperationMateriality = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AskOperationLanguageSemanticPack {
  language: string;
  semanticVersion: string;
  intentDescription: string;
  supportedJobs: string[];
  positiveExamples: string[];
  hardNegativeExamples: string[];
  clarificationPromptKey: string;
}

export interface AskOperationSemanticContract {
  operationId: AskOperationId;
  semanticVersion: string;
  intentDescription: string;
  supportedJobs: string[];
  positiveExamples: string[];
  hardNegativeExamples: string[];
  entityTypes: string[];
  requiredSlots: string[];
  optionalSlots: string[];
  effect: AskOperationEffect;
  materiality: AskOperationMateriality;
  supportedLanguages: string[];
  languagePacks: Readonly<Record<string, AskOperationLanguageSemanticPack>>;
  clarificationPromptKey: string;
}

export type AskConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AskIntentClassification {
  schemaVersion: '1.0';
  selectedOperationId: AskOperationId | null;
  candidateOperationIds: AskOperationId[];
  outcome: 'RESOLVED' | 'AMBIGUOUS' | 'MULTI_INTENT' | 'UNSUPPORTED';
  confidenceBand: AskConfidenceBand;
  extractedEntities: Array<{ type: string; originalText: string; canonicalCandidateId?: string }>;
  missingSlots: string[];
  reasonCodes: string[];
}

export interface AskAnswerTrustResult {
  schemaVersion: '1.0';
  outcome: 'PASS' | 'REPAIRABLE' | 'CLARIFY' | 'UNAVAILABLE' | 'BLOCK';
  checks: {
    questionCoverage: 'PASS' | 'FAIL' | 'UNKNOWN';
    operationCongruence: 'PASS' | 'FAIL';
    sourceIntegrity: 'PASS' | 'FAIL' | 'PARTIAL';
    absenceClaimSupport: 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
    boundaryApplicability: 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
    actionApplicability: 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
    audienceSafety: 'PASS' | 'FAIL';
  };
  reasonCodes: string[];
  validatorVersion: string;
}

export interface AskAuthoritativeSourceEvidence {
  sourceId: string;
  operationId: AskOperationId;
  status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
  scope: 'FULL' | 'LIMITED';
  freshness: 'CURRENT' | 'STALE' | 'UNKNOWN';
  observedAt: string;
}

export interface AskAnswerTrustEvidence {
  schemaVersion: '1.0';
  sources: AskAuthoritativeSourceEvidence[];
}

const HUMAN_LABELS: Partial<Record<AskOperationId, string>> = {
  MAINTENANCE_STATUS: 'review pending and completed maintenance',
  MAINTENANCE_TASK_CREATE: 'create a maintenance task',
  MAINTENANCE_TASK_COMPLETE: 'mark maintenance work complete',
  MAINTENANCE_TASK_UPDATE: 'change a maintenance task',
  COVERAGE_GAPS: 'review insurance and warranty coverage gaps',
  INCIDENT_CLAIM_STATUS: 'review recorded incidents and insurance claims',
  SAVINGS_OPPORTUNITIES: 'find ways to lower home costs',
  OWNERSHIP_COSTS: 'review the cost of owning the home',
  INVENTORY_LOOKUP: 'look up appliance, system, or equipment details',
  PROPERTY_SUMMARY: 'review the home record, including missing or incomplete details',
  HOME_ACTIONS: 'prioritize what needs attention next',
  CAPABILITY_DISCOVERY: 'find a supported home tool or workflow',
  REPLACEMENT_GUIDANCE: 'decide when to repair or replace a home item',
  REFINANCE_ANALYSIS: 'evaluate whether refinancing may be worthwhile',
  REFINANCE_RATE_MONITOR: 'monitor mortgage rates',
  SELL_HOLD_RENT_ANALYSIS: 'compare selling, holding, or renting the home',
  HOUSEHOLD_INVITATION: 'invite a household member',
  GUIDANCE_JOURNEY_CREATE: 'start a guided home plan',
  QUOTE_COMPARISON_CREATE: 'start a contractor quote comparison',
  QUOTE_COMPARISON_REVIEW: 'compare contractor quotes or bids',
  HOME_DEADLINE_MONITOR: 'monitor a home deadline or expiration',
  CAPITAL_RESERVE_PLAN: 'plan reserves for future home expenses',
  PROPERTY_TAX_APPEAL_READINESS: 'review property-tax appeal readiness',
  RENOVATION_PERMIT_READINESS: 'review renovation permit readiness',
  MAJOR_EVENT_ENTRY: 'prepare for a major home event',
  GROUNDED_GUIDANCE: 'get general educational home guidance',
  HOME_CHANGE_SUMMARY: 'review what changed in the home record',
};

const EXAMPLES: Partial<Record<AskOperationId, string[]>> = {
  PROPERTY_SUMMARY: [
    'Are there any pending home details to be filled in?',
    'What information is left to add to this property?',
    'Did I miss anything while setting up this house?',
    'Is my home profile complete?',
    'What else do you need to know about this property?',
    'What information does this house still need?',
    'What home record items need attention and coverage?',
  ],
  MAINTENANCE_STATUS: ['What maintenance is pending?', 'Show overdue upkeep and completed work', 'Give me a rundown of household work remaining and finished'],
  INVENTORY_LOOKUP: ['What appliance details are missing?', 'What do you know about my refrigerator?', 'Which home record items need attention or coverage?', 'Show my appliance inventory'],
  HOME_ACTIONS: ['What should I do next for this home?', 'What needs my attention first?'],
  QUOTE_COMPARISON_REVIEW: ['What details are missing from my contractor quote?', 'Compare these contractor bids', 'Which estimate is best?', 'Review my quotes and estimats'],
  COVERAGE_GAPS: ['Which items have no warranty or insurance coverage?', 'Show gaps in my home protection', 'What is uncovered in my home?', 'Show missing coverage for my applicances'],
  CAPITAL_RESERVE_PLAN: ['Show my capital plan for major replacements', 'How much should I save for major replacements?', 'Show my future home expenses', 'Show my capital timeline for replacments'],
  HOUSEHOLD_INVITATION: ['Invite my spouse to my household', 'Add a family member to this home', 'Share my home with my partner', 'Send a household invitation to my spouce'],
  OWNERSHIP_COSTS: ['Show my monthly home costs', 'Break down my annual ownership costs', 'What am I spending on this house?', 'Show my ownership costs by catagory'],
  PROPERTY_TAX_APPEAL_READINESS: ['Am I ready to appeal my property tax assessment?', 'Show evidence for a property tax appeal', 'Is my assessed value too high?', 'Can I challange my property tax assessment appeal?'],
  QUOTE_COMPARISON_CREATE: ['Create a quote comparison workspace', 'Start a workspace to compare contractor quotes'],
  RENOVATION_PERMIT_READINESS: ['Am I ready to start my renovation?', 'Is my renovation permit readiness blocked?', 'Can I start this home project?', 'Show permit readiness for my renovaton'],
  SAVINGS_OPPORTUNITIES: ['Where could I save money on this home?', 'Show my savings opportunities', 'How can we lower our home costs?', 'What savings have I received recenlty?'],
  SELL_HOLD_RENT_ANALYSIS: ['Should I sell, hold, or rent this home?', 'Compare selling versus renting out my property', 'Would I be better off holding or selling?', 'Should I sell or rent this propertie?'],
  MAJOR_EVENT_ENTRY: ['Help me prepare for selling my home', 'Give me a checklist for my home sale', 'What should I do before moving out?', 'Help me prepare for my home sale and seling'],
  MAINTENANCE_TASK_CREATE: ['Create a maintenance task to clean gutters', 'Add gutter cleaning to my maintenance tasks'],
  MAINTENANCE_TASK_COMPLETE: ['Mark the gutter cleaning task complete', 'Complete my recorded maintenance task'],
  HVAC_DECISION_START: ['Should I repair or replace my furnace?', 'Start a repair-or-replace decision for my HVAC system'],
  REPLACEMENT_GUIDANCE: ['Should I repair or replace my refrigerator?', 'Should I fix or replace my aging appliance?', 'Should I repair or replce my aging appliance?'],
  REFINANCE_ANALYSIS: ['Should I refinance now?', 'Is refinancing worth it now?', 'Should I refinance my morgage?'],
  REFINANCE_RATE_MONITOR: ['Alert me when mortgage rates drop below 5 percent', 'Monitor mortgage rates for my refinance target'],
};

const HARD_NEGATIVES: Partial<Record<AskOperationId, string[]>> = {
  PROPERTY_SUMMARY: ['What appliance details are missing?', 'What maintenance tasks are pending?', 'What is missing from my contractor quote?'],
  MAINTENANCE_STATUS: ['What home profile information remains?', 'Create a maintenance task'],
  INVENTORY_LOOKUP: ['Is my overall home record complete?', 'When should I replace my refrigerator?'],
  QUOTE_COMPARISON_REVIEW: ['Is my home profile complete?', 'Create a quote workspace'],
  HOME_ACTIONS: ['What maintenance is overdue?', 'Show my home record'],
  REPLACEMENT_GUIDANCE: ['Should I repair or replace my furnace?', 'Start an HVAC decision thread'],
  HVAC_DECISION_START: ['Should I replace my refrigerator?', 'Give me generic appliance replacement guidance'],
};

function effectFor(definition: Pick<AskOperationDefinition, 'family' | 'safetyClass'>): AskOperationEffect {
  if (definition.safetyClass.endsWith('_BOUNDARY')) return 'BOUNDARY';
  if (definition.family === 'COMMAND' || definition.family === 'WORKFLOW_GUIDANCE') return 'WRITE';
  if (definition.family === 'MONITOR') return 'MONITOR';
  return 'READ';
}

export function createAskOperationSemanticContract(
  definition: Pick<AskOperationDefinition, 'operationId' | 'family' | 'safetyClass' | 'requiresProperty'>,
): AskOperationSemanticContract {
  const label = HUMAN_LABELS[definition.operationId]
    ?? definition.operationId.toLowerCase().replace(/_/g, ' ');
  const positiveExamples = EXAMPLES[definition.operationId] ?? [`Help me ${label}`, `I want to ${label}`];
  const basis = JSON.stringify([definition.operationId, label, positiveExamples, HARD_NEGATIVES[definition.operationId]]);
  const semanticVersion = `1.0-${createHash('sha256').update(basis).digest('hex').slice(0, 8)}`;
  const clarificationPromptKey = `ask.clarification.${definition.operationId.toLowerCase()}`;
  const englishPack: AskOperationLanguageSemanticPack = Object.freeze({
    language: 'en',
    semanticVersion,
    intentDescription: `The homeowner wants to ${label}.`,
    supportedJobs: [label],
    positiveExamples,
    hardNegativeExamples: HARD_NEGATIVES[definition.operationId] ?? ['The homeowner is asking about a different registered home job.'],
    clarificationPromptKey,
  });
  return Object.freeze({
    operationId: definition.operationId,
    semanticVersion,
    intentDescription: englishPack.intentDescription,
    supportedJobs: englishPack.supportedJobs,
    positiveExamples: englishPack.positiveExamples,
    hardNegativeExamples: englishPack.hardNegativeExamples,
    entityTypes: definition.requiresProperty ? ['PROPERTY'] : [],
    requiredSlots: definition.requiresProperty ? ['propertyId'] : [],
    optionalSlots: [],
    effect: effectFor(definition),
    materiality: definition.safetyClass === 'MATERIAL_DECISION' || effectFor(definition) === 'WRITE' ? 'HIGH' : 'LOW',
    supportedLanguages: ['en'],
    languagePacks: Object.freeze({ en: englishPack }),
    clarificationPromptKey,
  });
}

export function validateAskSemanticContract(contract: AskOperationSemanticContract): string[] {
  const issues: string[] = [];
  if (!contract.semanticVersion) issues.push('missing semanticVersion');
  if (!contract.intentDescription.trim()) issues.push('missing intentDescription');
  if (contract.positiveExamples.length < 2) issues.push('requires at least two positive examples');
  if (contract.hardNegativeExamples.length < 1) issues.push('requires at least one hard negative');
  if (!contract.supportedLanguages.includes('en')) issues.push('English support must be declared');
  for (const language of contract.supportedLanguages) {
    const registration = getAskLanguageRegistration(language);
    if (!registration || registration.status !== 'CERTIFIED') {
      issues.push(`${language}: language is not registered and certified`);
    }
    const pack = contract.languagePacks[language];
    if (!pack) {
      issues.push(`${language}: missing language semantic pack`);
      continue;
    }
    if (pack.language !== language) issues.push(`${language}: semantic pack language mismatch`);
    if (!pack.semanticVersion.trim()) issues.push(`${language}: missing semantic version`);
    if (!pack.intentDescription.trim()) issues.push(`${language}: missing intent description`);
    if (pack.positiveExamples.length < 2) issues.push(`${language}: requires at least two positive examples`);
    if (pack.hardNegativeExamples.length < 1) issues.push(`${language}: requires at least one hard negative`);
    if (!pack.clarificationPromptKey.trim()) issues.push(`${language}: missing clarification prompt key`);
  }
  for (const language of Object.keys(contract.languagePacks)) {
    if (!contract.supportedLanguages.includes(language)) issues.push(`${language}: semantic pack is not declared supported`);
  }
  return issues;
}
