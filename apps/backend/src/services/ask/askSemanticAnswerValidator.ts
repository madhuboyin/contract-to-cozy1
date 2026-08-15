import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import { getAskOperationDefinition, type AskOperationId, type AskOperationResult } from './askOperationRegistry';
import { askSemanticTextSimilarity, retrieveAskOperationCandidates } from './askSemanticRouter';
import { ASK_DEFAULT_LANGUAGE, requireCertifiedAskLanguage, type AskLanguageCode } from './askLanguageRegistry';
import { askEmbeddingCosine, embedAskSemanticText } from './askSemanticEmbedding';

export const ASK_SEMANTIC_ANSWER_VALIDATOR_VERSION = 'local-relevance-1.0';

export interface AskSemanticAnswerRelevanceResult {
  schemaVersion: '1.0';
  language: AskLanguageCode;
  outcome: 'PASS' | 'FAIL' | 'UNKNOWN' | 'SKIPPED';
  selectedOperationId: AskOperationId;
  competingOperationId: AskOperationId | null;
  selectedOperationScore: number;
  competingOperationScore: number;
  questionAnswerScore: number;
  reasonCodes: string[];
  validatorVersion: string;
  latencyMs: number;
}

const SUCCESS_STATUSES = new Set(['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS']);

function firstBlockText(block: AskPresentationBlock | undefined): string {
  if (!block) return '';
  switch (block.type) {
    case 'SUMMARY':
    case 'EMPTY_STATE':
    case 'ERROR_STATE':
    case 'BOUNDARY':
    case 'LIMITATION':
      return `${block.title} ${block.body}`;
    case 'CHANGE_SUMMARY': return `${block.title} ${block.summary}`;
    case 'DECISION_PROGRESS': return `${block.title} ${block.verdict ?? ''}`;
    case 'OUTCOME_SUMMARY': return `${block.title} ${block.limitation}`;
    case 'WORKFLOW_PROGRESS': return `${block.title} ${block.description}`;
    default: return `${block.title} ${'description' in block ? block.description ?? '' : ''}`;
  }
}

export function validateAskSemanticAnswerRelevance(input: {
  question: string;
  operationId: AskOperationId;
  result: AskOperationResult;
  language?: AskLanguageCode;
}): AskSemanticAnswerRelevanceResult {
  const startedAt = process.hrtime.bigint();
  const language = input.language ?? ASK_DEFAULT_LANGUAGE;
  requireCertifiedAskLanguage(language);
  const finish = (result: Omit<AskSemanticAnswerRelevanceResult, 'latencyMs' | 'schemaVersion' | 'validatorVersion' | 'language'>): AskSemanticAnswerRelevanceResult => ({
    schemaVersion: '1.0',
    language,
    validatorVersion: ASK_SEMANTIC_ANSWER_VALIDATOR_VERSION,
    latencyMs: Number((Number(process.hrtime.bigint() - startedAt) / 1_000_000).toFixed(3)),
    ...result,
  });
  if (!SUCCESS_STATUSES.has(input.result.status)) {
    return finish({
      outcome: 'SKIPPED', selectedOperationId: input.operationId, competingOperationId: null,
      selectedOperationScore: 0, competingOperationScore: 0, questionAnswerScore: 0,
      reasonCodes: ['NON_SUCCESS_RESULT'],
    });
  }
  const answer = firstBlockText(input.result.blocks[0]);
  if (!answer.trim()) {
    return finish({
      outcome: 'FAIL', selectedOperationId: input.operationId, competingOperationId: null,
      selectedOperationScore: 0, competingOperationScore: 0, questionAnswerScore: 0,
      reasonCodes: ['EMPTY_DIRECT_ANSWER'],
    });
  }
  const definition = getAskOperationDefinition(input.operationId);
  const semantic = definition.semantic.languagePacks[language];
  if (!semantic) {
    return finish({
      outcome: 'SKIPPED', selectedOperationId: input.operationId, competingOperationId: null,
      selectedOperationScore: 0, competingOperationScore: 0, questionAnswerScore: 0,
      reasonCodes: ['OPERATION_LANGUAGE_PACK_UNAVAILABLE'],
    });
  }
  const anchor = [semantic.intentDescription, ...semantic.supportedJobs, ...semantic.positiveExamples].join(' ');
  const selectedOperationScore = Math.max(
    askSemanticTextSimilarity(answer, anchor, language),
    askEmbeddingCosine(embedAskSemanticText(answer), embedAskSemanticText(anchor)),
  );
  const questionAnswerScore = Math.max(
    askSemanticTextSimilarity(input.question, answer, language),
    askEmbeddingCosine(embedAskSemanticText(input.question), embedAskSemanticText(answer)),
  );
  const ranked = retrieveAskOperationCandidates(answer, { topK: 3, language });
  const selectedCandidate = ranked.find((candidate) => candidate.operationId === input.operationId);
  const competitor = ranked.find((candidate) => candidate.operationId !== input.operationId) ?? null;
  const selectedScore = Math.max(selectedOperationScore, selectedCandidate?.score ?? 0);
  const competingScore = competitor?.score ?? 0;
  const clearMismatch = Boolean(competitor && questionAnswerScore < 0.24 && competingScore >= 0.34 && competingScore - selectedScore >= 0.12);
  if (clearMismatch) {
    return finish({
      outcome: 'FAIL', selectedOperationId: input.operationId, competingOperationId: competitor!.operationId,
      selectedOperationScore: selectedScore, competingOperationScore: competingScore, questionAnswerScore,
      reasonCodes: ['ANSWER_FAVORS_DIFFERENT_OPERATION'],
    });
  }
  if ((selectedCandidate?.operationId === input.operationId && selectedScore >= 0.2) || selectedScore >= 0.3 || questionAnswerScore >= 0.24) {
    return finish({
      outcome: 'PASS', selectedOperationId: input.operationId, competingOperationId: competitor?.operationId ?? null,
      selectedOperationScore: selectedScore, competingOperationScore: competingScore, questionAnswerScore,
      reasonCodes: [selectedCandidate?.operationId === input.operationId ? 'SELECTED_OPERATION_TOP_MATCH' : 'DIRECT_ANSWER_SEMANTIC_MATCH'],
    });
  }
  return finish({
    outcome: 'UNKNOWN', selectedOperationId: input.operationId, competingOperationId: competitor?.operationId ?? null,
    selectedOperationScore: selectedScore, competingOperationScore: competingScore, questionAnswerScore,
    reasonCodes: ['INSUFFICIENT_RELEVANCE_SIGNAL'],
  });
}
