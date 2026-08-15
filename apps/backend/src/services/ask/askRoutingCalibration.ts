import type { AskLanguageCode } from './askLanguageRegistry';
import type { AskOperationDefinition, AskOperationId } from './askOperationRegistry';
import type { AskConfidenceBand } from './askTrust.contract';

export const ASK_ROUTING_CALIBRATION_VERSION = 'routing-calibration-1.0';
export type AskRetrievalPath = 'HYBRID_LOCAL_EMBEDDING' | 'LEXICAL_LOCAL';

export interface AskRoutingCalibrationResult {
  operationId: AskOperationId;
  language: AskLanguageCode;
  routingPath: AskRetrievalPath;
  rawScore: number;
  calibratedConfidence: number;
  confidenceBand: AskConfidenceBand;
  minimumExecutionConfidence: number;
  ambiguityMargin: number;
  calibrationVersion: string;
}

interface CalibrationProfile {
  anchors: readonly (readonly [number, number])[];
  highThreshold: number;
  mediumThreshold: number;
  minimumExecutionConfidence: number;
  ambiguityMargin: number;
}

const READ_PROFILE: CalibrationProfile = {
  anchors: [[0, 0], [0.1, 0.08], [0.2, 0.25], [0.3, 0.48], [0.42, 0.7], [0.58, 0.86], [0.75, 0.95], [1, 0.99]],
  highThreshold: 0.7, mediumThreshold: 0.4, minimumExecutionConfidence: 0.42, ambiguityMargin: 0.1,
};

const MATERIAL_PROFILE: CalibrationProfile = {
  anchors: [[0, 0], [0.1, 0.04], [0.2, 0.14], [0.3, 0.3], [0.42, 0.52], [0.58, 0.72], [0.75, 0.88], [1, 0.98]],
  highThreshold: 0.72, mediumThreshold: 0.42, minimumExecutionConfidence: 0.52, ambiguityMargin: 0.12,
};

const WRITE_PROFILE: CalibrationProfile = {
  anchors: [[0, 0], [0.1, 0.02], [0.2, 0.1], [0.3, 0.24], [0.42, 0.44], [0.58, 0.65], [0.75, 0.84], [1, 0.98]],
  highThreshold: 0.78, mediumThreshold: 0.46, minimumExecutionConfidence: 0.62, ambiguityMargin: 0.14,
};

function profileFor(definition: AskOperationDefinition, path: AskRetrievalPath): CalibrationProfile {
  const base = definition.semantic.effect === 'WRITE'
    ? WRITE_PROFILE
    : definition.semantic.materiality === 'HIGH'
      ? MATERIAL_PROFILE
      : READ_PROFILE;
  if (path === 'HYBRID_LOCAL_EMBEDDING') return base;
  return {
    ...base,
    highThreshold: Math.min(0.95, base.highThreshold + 0.06),
    minimumExecutionConfidence: Math.min(0.95, base.minimumExecutionConfidence + 0.06),
    ambiguityMargin: Math.min(0.25, base.ambiguityMargin + 0.02),
  };
}

function interpolate(raw: number, anchors: CalibrationProfile['anchors']): number {
  const bounded = Math.max(0, Math.min(1, raw));
  for (let index = 1; index < anchors.length; index += 1) {
    const [upperRaw, upperValue] = anchors[index];
    const [lowerRaw, lowerValue] = anchors[index - 1];
    if (bounded <= upperRaw) {
      const position = (bounded - lowerRaw) / Math.max(0.0001, upperRaw - lowerRaw);
      return lowerValue + ((upperValue - lowerValue) * position);
    }
  }
  return anchors[anchors.length - 1][1];
}

export function calibrateAskRoutingConfidence(input: {
  definition: AskOperationDefinition;
  language: AskLanguageCode;
  routingPath: AskRetrievalPath;
  rawScore: number;
  minimumConfidenceOverride?: number;
  ambiguityMarginOverride?: number;
}): AskRoutingCalibrationResult {
  const profile = profileFor(input.definition, input.routingPath);
  const calibratedConfidence = Number(interpolate(input.rawScore, profile.anchors).toFixed(4));
  return {
    operationId: input.definition.operationId,
    language: input.language,
    routingPath: input.routingPath,
    rawScore: Number(input.rawScore.toFixed(4)),
    calibratedConfidence,
    confidenceBand: calibratedConfidence >= profile.highThreshold ? 'HIGH' : calibratedConfidence >= profile.mediumThreshold ? 'MEDIUM' : 'LOW',
    minimumExecutionConfidence: Math.max(input.minimumConfidenceOverride ?? 0, profile.minimumExecutionConfidence),
    ambiguityMargin: Math.max(input.ambiguityMarginOverride ?? 0, profile.ambiguityMargin),
    calibrationVersion: `${ASK_ROUTING_CALIBRATION_VERSION}:${input.language}:${input.routingPath}:${input.definition.semantic.effect}:${input.definition.semantic.materiality}`,
  };
}
