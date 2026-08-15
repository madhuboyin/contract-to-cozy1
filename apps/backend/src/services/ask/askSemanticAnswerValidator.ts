import { getAskOperationDefinition, type AskOperationId, type AskOperationResult } from './askOperationRegistry';
import { askSemanticTextSimilarity, retrieveAskOperationCandidates } from './askSemanticRouter';
import { ASK_DEFAULT_LANGUAGE, requireCertifiedAskLanguage, type AskLanguageCode } from './askLanguageRegistry';
import { askEmbeddingCosine, embedAskSemanticText } from './askSemanticEmbedding';
import { projectAskSemanticResponse } from './askSemanticResponseProjection';

export const ASK_SEMANTIC_ANSWER_VALIDATOR_VERSION = 'local-relevance-3.0';

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
  const answer = projectAskSemanticResponse(input.result.blocks);
  if (!answer.trim()) {
    return finish({
      outcome: 'FAIL', selectedOperationId: input.operationId, competingOperationId: null,
      selectedOperationScore: 0, competingOperationScore: 0, questionAnswerScore: 0,
      reasonCodes: ['EMPTY_DIRECT_ANSWER'],
    });
  }
  const sourceEvidence = (input.result.parameters as { answerTrustEvidence?: { sources?: Array<{ operationId?: AskOperationId }> } } | undefined)
    ?.answerTrustEvidence?.sources ?? [];
  const mismatchedSource = sourceEvidence.find((source) => source.operationId && source.operationId !== input.operationId);
  if (mismatchedSource?.operationId) {
    return finish({
      outcome: 'FAIL', selectedOperationId: input.operationId, competingOperationId: mismatchedSource.operationId,
      selectedOperationScore: 0, competingOperationScore: 1, questionAnswerScore: 0,
      reasonCodes: ['ANSWER_SOURCE_OPERATION_MISMATCH'],
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
  const anchor = [semantic.intentDescription, ...semantic.answerPositiveExamples].join(' ');
  const answerPositiveScore = Math.max(0, ...semantic.answerPositiveExamples.map((example) => Math.max(
    askSemanticTextSimilarity(answer, example, language),
    askEmbeddingCosine(embedAskSemanticText(answer), embedAskSemanticText(example)),
  )));
  const selectedOperationScore = Math.max(answerPositiveScore,
    askSemanticTextSimilarity(answer, anchor, language),
    askEmbeddingCosine(embedAskSemanticText(answer), embedAskSemanticText(anchor)),
  );
  const hardNegativeScore = Math.max(0, ...semantic.answerHardNegativeExamples.map((example) => Math.max(
    askSemanticTextSimilarity(answer, example, language),
    askEmbeddingCosine(embedAskSemanticText(answer), embedAskSemanticText(example)),
  )));
  const questionAnswerScore = Math.max(
    askSemanticTextSimilarity(input.question, answer, language),
    askEmbeddingCosine(embedAskSemanticText(input.question), embedAskSemanticText(answer)),
  );
  // Relevance compares operation congruence on uncalibrated semantic evidence.
  // Routing confidence profiles intentionally differ by effect/materiality and
  // must not make a WRITE answer appear more relevant than a READ answer.
  const ranked = retrieveAskOperationCandidates(answer, { topK: 39, language })
    .sort((left, right) => right.rawScore - left.rawScore);
  const selectedCandidate = ranked.find((candidate) => candidate.operationId === input.operationId);
  const competitor = ranked.find((candidate) => candidate.operationId !== input.operationId) ?? null;
  const selectedScore = Math.max(selectedOperationScore, selectedCandidate?.rawScore ?? 0);
  const competingScore = competitor?.rawScore ?? 0;
  // Question/answer word overlap is corroborating evidence only. It must never
  // override an answer that clearly belongs to a different registered
  // operation (for example, "equipment" appearing in both a coverage question
  // and an inventory answer).
  const competitorLead = competingScore - selectedScore;
  const clearMismatch = Boolean(competitor && competingScore >= 0.34 && (
    competitorLead >= 0.12
    || (selectedScore < 0.16 && competingScore >= 0.55)
  ));
  const selectedHardNegative = hardNegativeScore >= 0.42 && hardNegativeScore >= selectedScore - 0.04;
  if (clearMismatch || selectedHardNegative) {
    return finish({
      outcome: 'FAIL', selectedOperationId: input.operationId, competingOperationId: competitor!.operationId,
      selectedOperationScore: selectedScore, competingOperationScore: competingScore, questionAnswerScore,
      reasonCodes: [selectedHardNegative ? 'ANSWER_MATCHES_OPERATION_HARD_NEGATIVE' : 'ANSWER_FAVORS_DIFFERENT_OPERATION'],
    });
  }
  const selectedDominates = Boolean(selectedCandidate && selectedCandidate.rawScore >= competingScore - 0.02);
  const strongOperationLead = selectedScore >= 0.18
    && selectedScore - competingScore >= 0.05
    && (questionAnswerScore >= 0.075 || definition.safetyClass.endsWith('_BOUNDARY'));
  const corroboratedOperationMatch = selectedDominates && selectedScore >= 0.18 && questionAnswerScore >= 0.12;
  const strongDirectEntailment = selectedScore >= 0.18 && selectedScore >= competingScore - 0.1 && questionAnswerScore >= 0.25;
  const strongAnswerContractMatch = answerPositiveScore >= 0.28 && questionAnswerScore >= 0.12;
  if (strongOperationLead || corroboratedOperationMatch || strongDirectEntailment || strongAnswerContractMatch) {
    return finish({
      outcome: 'PASS', selectedOperationId: input.operationId, competingOperationId: competitor?.operationId ?? null,
      selectedOperationScore: selectedScore, competingOperationScore: competingScore, questionAnswerScore,
      reasonCodes: [strongOperationLead || selectedDominates ? 'SELECTED_OPERATION_TOP_MATCH' : strongAnswerContractMatch ? 'OPERATION_ANSWER_CONTRACT_MATCH' : 'DIRECT_ANSWER_SEMANTIC_MATCH', ...(questionAnswerScore >= 0.12 ? ['QUESTION_ANSWER_CORROBORATION'] : [])],
    });
  }
  return finish({
    outcome: 'UNKNOWN', selectedOperationId: input.operationId, competingOperationId: competitor?.operationId ?? null,
    selectedOperationScore: selectedScore, competingOperationScore: competingScore, questionAnswerScore,
    reasonCodes: ['INSUFFICIENT_RELEVANCE_SIGNAL'],
  });
}
