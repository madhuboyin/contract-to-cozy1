import { createHash } from 'node:crypto';
import type { AskOperationId, AskOperationDefinition } from './askOperationRegistry';
import { getAskLanguageRegistration } from './askLanguageRegistry';
import { requiredAskTargetEntity } from './askEntityResolution';
import { getAskOperationSemanticPackage } from './askOperationSemanticPackages';

export type AskOperationEffect = 'READ' | 'WRITE' | 'MONITOR' | 'BOUNDARY';
export type AskOperationMateriality = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AskOperationLanguageSemanticPack {
  language: string;
  semanticVersion: string;
  intentDescription: string;
  supportedJobs: string[];
  positiveExamples: string[];
  hardNegativeExamples: string[];
  answerPositiveExamples: string[];
  answerHardNegativeExamples: string[];
  clarificationPromptKey: string;
}

export interface AskOperationSemanticContract {
  operationId: AskOperationId;
  semanticVersion: string;
  intentDescription: string;
  supportedJobs: string[];
  positiveExamples: string[];
  hardNegativeExamples: string[];
  answerPositiveExamples: string[];
  answerHardNegativeExamples: string[];
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
  entityOutcome: 'NOT_REQUIRED' | 'RESOLVED' | 'MENTION_ONLY' | 'MISSING' | 'AMBIGUOUS';
  entityConfidenceBand: AskConfidenceBand | null;
  extractedEntities: Array<{ type: string; originalText: string; canonicalCandidateId?: string; confidenceBand: AskConfidenceBand }>;
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

function effectFor(definition: Pick<AskOperationDefinition, 'family' | 'safetyClass'>): AskOperationEffect {
  if (definition.safetyClass.endsWith('_BOUNDARY')) return 'BOUNDARY';
  if (definition.family === 'COMMAND' || definition.family === 'WORKFLOW_GUIDANCE') return 'WRITE';
  if (definition.family === 'MONITOR') return 'MONITOR';
  return 'READ';
}

export function createAskOperationSemanticContract(
  definition: Pick<AskOperationDefinition, 'operationId' | 'family' | 'safetyClass' | 'requiresProperty'>,
): AskOperationSemanticContract {
  const semanticPackage = getAskOperationSemanticPackage(definition.operationId);
  const label = semanticPackage.homeownerJob;
  const positiveExamples = [...semanticPackage.positiveExamples];
  const hardNegativeExamples = [...semanticPackage.hardNegativeExamples];
  const answerPositiveExamples = [...semanticPackage.answerPositiveExamples];
  const answerHardNegativeExamples = [...semanticPackage.answerHardNegativeExamples];
  const basis = JSON.stringify([
    definition.operationId,
    label,
    positiveExamples,
    hardNegativeExamples,
    answerPositiveExamples,
    answerHardNegativeExamples,
  ]);
  const semanticVersion = `1.0-${createHash('sha256').update(basis).digest('hex').slice(0, 8)}`;
  const clarificationPromptKey = `ask.clarification.${definition.operationId.toLowerCase()}`;
  const targetEntity = requiredAskTargetEntity(definition.operationId);
  const englishPack: AskOperationLanguageSemanticPack = Object.freeze({
    language: 'en',
    semanticVersion,
    intentDescription: `The homeowner wants to ${label}.`,
    supportedJobs: [label],
    positiveExamples,
    hardNegativeExamples,
    answerPositiveExamples,
    answerHardNegativeExamples,
    clarificationPromptKey,
  });
  return Object.freeze({
    operationId: definition.operationId,
    semanticVersion,
    intentDescription: englishPack.intentDescription,
    supportedJobs: englishPack.supportedJobs,
    positiveExamples: englishPack.positiveExamples,
    hardNegativeExamples: englishPack.hardNegativeExamples,
    answerPositiveExamples: englishPack.answerPositiveExamples,
    answerHardNegativeExamples: englishPack.answerHardNegativeExamples,
    entityTypes: [...(definition.requiresProperty ? ['PROPERTY'] : []), ...(targetEntity ? [targetEntity] : [])],
    requiredSlots: [...(definition.requiresProperty ? ['propertyId'] : []), ...(targetEntity ? [`${targetEntity.toLowerCase()}Id`] : [])],
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
  if (contract.answerPositiveExamples.length < 1) issues.push('requires at least one answer positive');
  if (contract.answerHardNegativeExamples.length < 1) issues.push('requires at least one answer hard negative');
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
    if (pack.answerPositiveExamples.length < 1) issues.push(`${language}: requires at least one answer positive`);
    if (pack.answerHardNegativeExamples.length < 1) issues.push(`${language}: requires at least one answer hard negative`);
    if (!pack.clarificationPromptKey.trim()) issues.push(`${language}: missing clarification prompt key`);
  }
  for (const language of Object.keys(contract.languagePacks)) {
    if (!contract.supportedLanguages.includes(language)) issues.push(`${language}: semantic pack is not declared supported`);
  }
  return issues;
}
