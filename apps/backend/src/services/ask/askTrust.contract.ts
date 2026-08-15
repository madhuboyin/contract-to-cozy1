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
  INVENTORY_LOOKUP: ['What appliance details are missing?', 'What do you know about my refrigerator?', 'Which home record items need attention or coverage?'],
  HOME_ACTIONS: ['What should I do next for this home?', 'What needs my attention first?'],
  QUOTE_COMPARISON_REVIEW: ['What details are missing from my contractor quote?', 'Compare these contractor bids'],
  COVERAGE_GAPS: ['Which items have no warranty or insurance coverage?', 'Show gaps in my home protection'],
};

const HARD_NEGATIVES: Partial<Record<AskOperationId, string[]>> = {
  PROPERTY_SUMMARY: ['What appliance details are missing?', 'What maintenance tasks are pending?', 'What is missing from my contractor quote?'],
  MAINTENANCE_STATUS: ['What home profile information remains?', 'Create a maintenance task'],
  INVENTORY_LOOKUP: ['Is my overall home record complete?', 'When should I replace my refrigerator?'],
  QUOTE_COMPARISON_REVIEW: ['Is my home profile complete?', 'Create a quote workspace'],
  HOME_ACTIONS: ['What maintenance is overdue?', 'Show my home record'],
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
