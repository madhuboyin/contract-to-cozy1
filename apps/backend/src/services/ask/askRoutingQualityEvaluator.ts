import { ASK_DEFAULT_LANGUAGE, type AskLanguageCode } from './askLanguageRegistry';
import type { AskOperationId } from './askOperationRegistry';
import { resolveAskRoutingCascade } from './askRoutingCascade';
import { retrieveAskOperationCandidates } from './askSemanticRouter';

export interface AskRoutingQualityFixture {
  operationId: AskOperationId;
  message: string;
  language?: AskLanguageCode;
}

export interface AskRoutingQualitySlice {
  language: AskLanguageCode;
  operationId: AskOperationId | 'ALL';
  samples: number;
  top1Correct: number;
  top3Recall: number;
  resolvedCorrect: number;
  incorrectHighConfidence: number;
  clarification: number;
}

export interface AskRoutingCalibrationBin {
  lowerBound: number;
  upperBound: number;
  samples: number;
  averageConfidence: number | null;
  observedAccuracy: number | null;
  calibrationGap: number | null;
}

export interface AskRoutingQualityReport {
  schemaVersion: '1.0';
  generatedAt: string;
  embeddingEnabled: boolean;
  aggregate: AskRoutingQualitySlice;
  byOperation: AskRoutingQualitySlice[];
  calibration: AskRoutingCalibrationBin[];
}

interface EvaluatedFixture {
  fixture: AskRoutingQualityFixture;
  top: AskOperationId | null;
  top3: AskOperationId[];
  selected: AskOperationId | null;
  confidence: number;
  highConfidence: boolean;
  clarification: boolean;
}

function qualitySlice(rows: EvaluatedFixture[], operationId: AskOperationId | 'ALL', language: AskLanguageCode): AskRoutingQualitySlice {
  return {
    language,
    operationId,
    samples: rows.length,
    top1Correct: rows.filter((row) => row.top === row.fixture.operationId).length,
    top3Recall: rows.filter((row) => row.top3.includes(row.fixture.operationId)).length,
    resolvedCorrect: rows.filter((row) => row.selected === row.fixture.operationId).length,
    incorrectHighConfidence: rows.filter((row) => row.highConfidence && row.selected != null && row.selected !== row.fixture.operationId).length,
    clarification: rows.filter((row) => row.clarification).length,
  };
}

export function evaluateAskRoutingQuality(
  fixtures: readonly AskRoutingQualityFixture[],
  options: { embeddingEnabled?: boolean; generatedAt?: string } = {},
): AskRoutingQualityReport {
  const embeddingEnabled = options.embeddingEnabled !== false;
  const rows: EvaluatedFixture[] = fixtures.map((fixture) => {
    const language = fixture.language ?? ASK_DEFAULT_LANGUAGE;
    const candidates = retrieveAskOperationCandidates(fixture.message, { topK: 100, language, embeddingEnabled });
    const retrievalRanked = [...candidates].sort((left, right) => right.rawScore - left.rawScore);
    const decision = resolveAskRoutingCascade(fixture.message, { language, embeddingRetrievalEnabled: embeddingEnabled });
    const selected = decision.requiresClarification || decision.stage === 'REMOTE_FALLBACK'
      ? null
      : decision.operation.operationId;
    return {
      fixture: { ...fixture, language },
      top: selected ?? retrievalRanked[0]?.operationId ?? decision.candidates[0]?.operationId ?? null,
      top3: [...new Set([...(selected ? [selected] : []), ...retrievalRanked.map((candidate) => candidate.operationId)])].slice(0, 3),
      selected,
      confidence: decision.operation.confidence,
      highConfidence: decision.candidates.find((candidate) => candidate.operationId === decision.operation.operationId)?.confidenceBand === 'HIGH'
        || (decision.stage === 'DETERMINISTIC' && decision.operation.confidence >= 0.9),
      clarification: decision.requiresClarification,
    };
  });
  const language = rows[0]?.fixture.language ?? ASK_DEFAULT_LANGUAGE;
  const byOperation = [...new Set(rows.map((row) => row.fixture.operationId))]
    .sort()
    .map((operationId) => qualitySlice(rows.filter((row) => row.fixture.operationId === operationId), operationId, language));
  const calibration = Array.from({ length: 5 }, (_, index): AskRoutingCalibrationBin => {
    const lowerBound = index * 0.2;
    const upperBound = (index + 1) * 0.2;
    const binRows = rows.filter((row) => row.selected != null && row.confidence >= lowerBound && (index === 4 ? row.confidence <= upperBound : row.confidence < upperBound));
    if (!binRows.length) return { lowerBound, upperBound, samples: 0, averageConfidence: null, observedAccuracy: null, calibrationGap: null };
    const averageConfidence = binRows.reduce((sum, row) => sum + row.confidence, 0) / binRows.length;
    const observedAccuracy = binRows.filter((row) => row.selected === row.fixture.operationId).length / binRows.length;
    return {
      lowerBound, upperBound, samples: binRows.length,
      averageConfidence: Number(averageConfidence.toFixed(4)),
      observedAccuracy: Number(observedAccuracy.toFixed(4)),
      calibrationGap: Number(Math.abs(averageConfidence - observedAccuracy).toFixed(4)),
    };
  });
  return {
    schemaVersion: '1.0',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    embeddingEnabled,
    aggregate: qualitySlice(rows, 'ALL', language),
    byOperation,
    calibration,
  };
}
