import { canonicalBypassAllowed, matchesCanonicalAnswerBlocks } from './support/canonicalAnswerBlocks';
import { canonicalBypassDecision } from './support/answerGateBypass';
import type { AskEntityResolutionResult } from './askEntityResolution';
import { isAskHonestNoAnswerResult } from './askRemoteFallbackTypedClaims';
import { getAskOperationDefinition, type AskOperationId, type AskOperationResult } from './askOperationRegistry';
import { askSemanticTextSimilarity, retrieveAskOperationCandidates } from './askSemanticRouter';
import { ASK_DEFAULT_LANGUAGE, requireCertifiedAskLanguage, type AskLanguageCode } from './askLanguageRegistry';
import { askEmbeddingCosine, embedAskSemanticText } from './askSemanticEmbedding';
import { projectAskSemanticResponse } from './askSemanticResponseProjection';
import { matchesInventoryAnswerContract } from './askInventoryIntent';
import { matchesMaintenanceStatusAnswerContract } from './askMaintenanceIntent';
import { matchesSavingsOpportunitiesAnswerContract } from './askSavingsIntent';
import { matchesHomeUpgradeScenariosAnswerContract } from './askHomeUpgradeIntent';
import { matchesOwnershipCostsAnswerContract } from './askOwnershipCostsIntent';
import { matchesHomeActionsAnswerContract } from './askHomeActionsIntent';
import { matchesQuoteComparisonReviewAnswerContract } from './askQuoteReviewIntent';
import { matchesSellerPrepChecklistAnswerContract } from './askSellerPrepIntent';
import { matchesRefinanceAnalysisAnswerContract, matchesRefinanceScenarioAnswerContract } from './askRefinanceScenarioIntent';
import { matchesCapitalPlanAnswerContract } from './askCapitalPlanIntent';
import { matchesHomeChangeSummaryAnswerContract } from './askHomeChangeIntent';
import { matchesStatusBoardAnswerContract } from './askStatusBoardIntent';
import { matchesPropertySummaryAnswerContract } from './askPropertySummaryIntent';
import { matchesCoverageGapsAnswerContract } from './askCoverageIntent';
import { matchesSavedResultsAnswerContract, matchesWorkOverviewAnswerContract } from './askWorkSavedIntent';
import { matchesOperationAnswerContract } from './answerContract/operationAnswerContract';

export const ASK_SEMANTIC_ANSWER_VALIDATOR_VERSION = 'local-relevance-3.8';

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

const AUTHORED_GUIDE_RESULT_CODES: Partial<Record<AskOperationId, readonly string[]>> = {
  HOME_BASICS_GUIDE: ['HOME_BASICS_READY'],
  SEASONAL_HOME_CARE: ['SEASONAL_HOME_CARE_READY', 'SEASONAL_HOME_CARE_NO_GENERAL_TASKS'],
  HIRING_GUIDE: ['HIRING_GUIDE_READY'],
};

/**
 * Typed answer contracts (one per operation that has one): the stable, adapter-owned shape of that operation's normal answer. A match proves the handler produced its normal output; whether that may SKIP the relevance
 * check is a separate decision (canonicalBypassDecision, FR-GATE-3), because a canonical answer does not prove the question was about this entity or was a single question.
 */
const TYPED_ANSWER_CONTRACTS: Readonly<Partial<Record<AskOperationId, (i: { question: string; result: AskOperationResult }) => boolean>>> = {
  INVENTORY_LOOKUP: (i) => matchesInventoryAnswerContract(i.question, i.result),
  PROPERTY_SUMMARY: (i) => matchesPropertySummaryAnswerContract(i.result),
  WORK_OVERVIEW: (i) => matchesWorkOverviewAnswerContract(i.result),
  SAVED_RESULTS: (i) => matchesSavedResultsAnswerContract(i.result),
  MAINTENANCE_STATUS: (i) => matchesMaintenanceStatusAnswerContract(i.result),
  COVERAGE_GAPS: (i) => matchesCoverageGapsAnswerContract(i.result),
  SAVINGS_OPPORTUNITIES: (i) => matchesSavingsOpportunitiesAnswerContract(i.result),
  OWNERSHIP_COSTS: (i) => matchesOwnershipCostsAnswerContract(i.result),
  HOME_ACTIONS: (i) => matchesHomeActionsAnswerContract(i.result),
  HOME_CHANGE_SUMMARY: (i) => matchesHomeChangeSummaryAnswerContract(i.result),
  HOME_STATUS_BOARD: (i) => matchesStatusBoardAnswerContract(i.result),
  SELLER_PREP_CHECKLIST: (i) => matchesSellerPrepChecklistAnswerContract(i.result),
  QUOTE_COMPARISON_REVIEW: (i) => matchesQuoteComparisonReviewAnswerContract(i.result),
  CAPITAL_RESERVE_PLAN: (i) => matchesCapitalPlanAnswerContract(i.result),
  REFINANCE_ANALYSIS: (i) => (matchesRefinanceScenarioAnswerContract(i.result) || matchesRefinanceAnalysisAnswerContract(i.result)),
  HOME_UPGRADE_SCENARIOS: (i) => matchesHomeUpgradeScenariosAnswerContract(i.result),
  ENVIRONMENT_REPORT: (i) => i.result.blocks.some((block) => block.type === 'ENVIRONMENT_REPORT'),
};

export function validateAskSemanticAnswerRelevance(input: {
  question: string;
  operationId: AskOperationId;
  result: AskOperationResult;
  language?: AskLanguageCode;
  operationConfirmedByUser?: boolean;
  routedDeterministically?: boolean;
  /** The routing decision's entity state (FR-GATE-3 b): a canonical answer may skip the relevance check only when the entity and every required slot were resolved. Omitted = not applicable. */
  entityResolution?: AskEntityResolutionResult | null;
  /** FR-GATE-3 c1: deterministic decomposition positively certified the full-message segmentation, so a compound message may keep the canonical bypass. */
  segmentationCertified?: boolean;
}): AskSemanticAnswerRelevanceResult {
  const startedAt = process.hrtime.bigint();
  const language = input.language ?? ASK_DEFAULT_LANGUAGE;
  requireCertifiedAskLanguage(language);
  const bypassDenialCodes: string[] = [];
  const finish = (result: Omit<AskSemanticAnswerRelevanceResult, 'latencyMs' | 'schemaVersion' | 'validatorVersion' | 'language'>): AskSemanticAnswerRelevanceResult => ({
    schemaVersion: '1.0',
    language,
    validatorVersion: ASK_SEMANTIC_ANSWER_VALIDATOR_VERSION,
    latencyMs: Number((Number(process.hrtime.bigint() - startedAt) / 1_000_000).toFixed(3)),
    ...result,
    reasonCodes: [...result.reasonCodes, ...bypassDenialCodes],
  });
  if (!SUCCESS_STATUSES.has(input.result.status)) {
    return finish({
      outcome: 'SKIPPED', selectedOperationId: input.operationId, competingOperationId: null,
      selectedOperationScore: 0, competingOperationScore: 0, questionAnswerScore: 0,
      reasonCodes: ['NON_SUCCESS_RESULT'],
    });
  }
  if (isAskHonestNoAnswerResult(input.operationId, input.result)) {
    return finish({
      outcome: 'PASS', selectedOperationId: input.operationId, competingOperationId: null,
      selectedOperationScore: 1, competingOperationScore: 0, questionAnswerScore: 1,
      reasonCodes: ['HONEST_NO_ANSWER_STATED'],
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
  // FR-GATE-3: a canonical answer (typed contract, authored guide, canonical blocks) may skip the relevance check only when the entity and every slot were resolved and the message is not an unsegmented compound
  // or conditional one. Otherwise the ordinary relevance check below decides, and the reason the bypass was withheld is recorded on the result.
  const bypass = canonicalBypassDecision({ question: input.question, entityResolution: input.entityResolution, segmentationCertified: input.segmentationCertified });
  const canonicalShapeMatch = Boolean(TYPED_ANSWER_CONTRACTS[input.operationId]?.({ question: input.question, result: input.result }))
    || Boolean(AUTHORED_GUIDE_RESULT_CODES[input.operationId]?.includes(input.result.reasonCode ?? ''))
    || matchesCanonicalAnswerBlocks(input.operationId, input.result);
  const canonicalMatch = canonicalShapeMatch && canonicalBypassAllowed(input.operationId, input);
  if (canonicalMatch && bypass.permitted) {
    return finish({
      outcome: 'PASS', selectedOperationId: input.operationId, competingOperationId: null,
      selectedOperationScore: 1, competingOperationScore: 0, questionAnswerScore: 1,
      reasonCodes: ['CANONICAL_TYPED_ANSWER_CONTRACT_MATCH'],
    });
  }
  if (canonicalShapeMatch && !canonicalBypassAllowed(input.operationId, input)) bypassDenialCodes.push('CANONICAL_BYPASS_WITHHELD_ROUTE_NOT_TRUSTED');
  else if (canonicalMatch && bypass.denial) bypassDenialCodes.push(`CANONICAL_BYPASS_WITHHELD_${bypass.denial}`);
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
  // A declared handler variant may corroborate an answer only after explicit
  // source-operation and competing-operation mismatch checks have passed.
  if (matchesOperationAnswerContract(input.operationId, input.result)) {
    return finish({
      outcome: 'PASS', selectedOperationId: input.operationId, competingOperationId: competitor?.operationId ?? null,
      selectedOperationScore: selectedScore, competingOperationScore: competingScore, questionAnswerScore,
      reasonCodes: ['DECLARED_OPERATION_VARIANT_MATCH'],
    });
  }
  const selectedDominates = Boolean(selectedCandidate && selectedCandidate.rawScore >= competingScore - 0.02);
  const strongOperationLead = selectedScore >= 0.18
    && selectedScore - competingScore >= 0.05
    && (questionAnswerScore >= 0.075 || definition.safetyClass.endsWith('_BOUNDARY'));
  const corroboratedOperationMatch = selectedDominates && selectedScore >= 0.18 && questionAnswerScore >= 0.12;
  const strongDirectEntailment = selectedScore >= 0.18 && selectedScore >= competingScore - 0.1 && questionAnswerScore >= 0.25;
  const strongAnswerContractMatch = answerPositiveScore >= 0.28 && questionAnswerScore >= 0.12;
  const confirmedOperationMatch = Boolean(input.operationConfirmedByUser)
    && selectedScore >= 0.18
    && selectedScore >= competingScore - 0.02;
  if (strongOperationLead || corroboratedOperationMatch || strongDirectEntailment || strongAnswerContractMatch || confirmedOperationMatch) {
    return finish({
      outcome: 'PASS', selectedOperationId: input.operationId, competingOperationId: competitor?.operationId ?? null,
      selectedOperationScore: selectedScore, competingOperationScore: competingScore, questionAnswerScore,
      reasonCodes: [confirmedOperationMatch ? 'HOMEOWNER_CONFIRMED_OPERATION_MATCH' : strongOperationLead || selectedDominates ? 'SELECTED_OPERATION_TOP_MATCH' : strongAnswerContractMatch ? 'OPERATION_ANSWER_CONTRACT_MATCH' : 'DIRECT_ANSWER_SEMANTIC_MATCH', ...(questionAnswerScore >= 0.12 ? ['QUESTION_ANSWER_CORROBORATION'] : [])],
    });
  }
  return finish({
    outcome: 'UNKNOWN', selectedOperationId: input.operationId, competingOperationId: competitor?.operationId ?? null,
    selectedOperationScore: selectedScore, competingOperationScore: competingScore, questionAnswerScore,
    reasonCodes: ['INSUFFICIENT_RELEVANCE_SIGNAL'],
  });
}
