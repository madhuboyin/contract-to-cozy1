import type { AskLanguageCode } from './askLanguageRegistry';
import { ASK_OPERATION_DEFINITIONS, type AskOperationDefinition, type AskOperationId } from './askOperationRegistry';
import type { AskConfidenceBand } from './askTrust.contract';
import { ASK_ROUTING_CALIBRATION_EVIDENCE_METADATA, ASK_ROUTING_CALIBRATION_OBSERVATIONS } from './askRoutingCalibrationEvidence';

import { createHash } from 'node:crypto';

export const ASK_ROUTING_CALIBRATION_VERSION = 'routing-calibration-3.0';
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

export const ASK_ROUTING_CALIBRATION_EVIDENCE_VERSION = createHash('sha256')
  .update(JSON.stringify([ASK_ROUTING_CALIBRATION_EVIDENCE_METADATA, ASK_ROUTING_CALIBRATION_OBSERVATIONS]))
  .digest('hex').slice(0, 12);

export type AskRoutingCalibrationKind = 'READ' | 'MATERIAL' | 'WRITE';

export function askRoutingCalibrationKind(definition: AskOperationDefinition): AskRoutingCalibrationKind {
  if (definition.semantic.effect === 'WRITE') return 'WRITE';
  return definition.semantic.materiality === 'HIGH' ? 'MATERIAL' : 'READ';
}

// Pool-adjacent-violators turns reviewed row labels into a monotonic empirical
// calibration curve. No authored correct/sample aggregates participate in the
// active curve; changing a label, raw score, or fixture changes its version.
export function deriveAskRoutingCalibrationAnchors(
  observations: readonly typeof ASK_ROUTING_CALIBRATION_OBSERVATIONS[number][],
  kind: AskRoutingCalibrationKind,
): CalibrationProfile['anchors'] {
  const rows = observations
    .filter((row) => askRoutingCalibrationKind(ASK_OPERATION_DEFINITIONS[row.candidateOperationId]) === kind)
    .sort((left, right) => left.rawScore - right.rawScore);
  const groups = rows.map((row) => ({ scoreTotal: row.rawScore, correct: row.correct ? 1 : 0, samples: 1 }));
  for (let index = 0; index < groups.length - 1;) {
    const current = groups[index].correct / groups[index].samples;
    const next = groups[index + 1].correct / groups[index + 1].samples;
    if (current <= next) {
      index += 1;
      continue;
    }
    groups.splice(index, 2, {
      scoreTotal: groups[index].scoreTotal + groups[index + 1].scoreTotal,
      correct: groups[index].correct + groups[index + 1].correct,
      samples: groups[index].samples + groups[index + 1].samples,
    });
    if (index > 0) index -= 1;
  }
  const observed = groups.map((group) => [group.scoreTotal / group.samples, group.correct / group.samples] as const);
  if (!observed.length) return [[0, 0], [1, 1]];
  return Object.freeze([
    [0, 0] as const,
    ...observed.filter(([score]) => score > 0 && score < 1),
    [1, 1] as const,
  ]);
}

function empiricalAnchors(kind: AskRoutingCalibrationKind): CalibrationProfile['anchors'] {
  return deriveAskRoutingCalibrationAnchors(ASK_ROUTING_CALIBRATION_OBSERVATIONS, kind);
}

const READ_PROFILE: CalibrationProfile = {
  anchors: empiricalAnchors('READ'), highThreshold: 0.7, mediumThreshold: 0.4,
  minimumExecutionConfidence: 0.42, ambiguityMargin: 0.1,
};
const MATERIAL_PROFILE: CalibrationProfile = {
  anchors: empiricalAnchors('MATERIAL'), highThreshold: 0.7, mediumThreshold: 0.42,
  minimumExecutionConfidence: 0.52, ambiguityMargin: 0.12,
};
const WRITE_PROFILE: CalibrationProfile = {
  anchors: empiricalAnchors('WRITE'), highThreshold: 0.78, mediumThreshold: 0.46,
  minimumExecutionConfidence: 0.62, ambiguityMargin: 0.14,
};

function profileFor(definition: AskOperationDefinition, path: AskRetrievalPath, requiresEntityResolution: boolean): CalibrationProfile {
  const base = definition.semantic.effect === 'WRITE'
    ? WRITE_PROFILE
    : definition.semantic.materiality === 'HIGH'
      ? MATERIAL_PROFILE
      : READ_PROFILE;
  const pathAdjusted = path === 'HYBRID_LOCAL_EMBEDDING' ? base : {
    ...base,
    highThreshold: Math.min(0.95, base.highThreshold + 0.06),
    minimumExecutionConfidence: Math.min(0.95, base.minimumExecutionConfidence + 0.06),
    ambiguityMargin: Math.min(0.25, base.ambiguityMargin + 0.02),
  };
  return requiresEntityResolution ? {
    ...pathAdjusted,
    minimumExecutionConfidence: Math.min(0.95, pathAdjusted.minimumExecutionConfidence + 0.05),
    ambiguityMargin: Math.min(0.25, pathAdjusted.ambiguityMargin + 0.03),
  } : pathAdjusted;
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
  requiresEntityResolution?: boolean;
}): AskRoutingCalibrationResult {
  const requiresEntityResolution = input.requiresEntityResolution === true;
  const profile = profileFor(input.definition, input.routingPath, requiresEntityResolution);
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
    calibrationVersion: `${ASK_ROUTING_CALIBRATION_VERSION}:${ASK_ROUTING_CALIBRATION_EVIDENCE_VERSION}:${input.language}:${input.routingPath}:${input.definition.semantic.effect}:${input.definition.semantic.materiality}:${requiresEntityResolution ? 'ENTITY' : 'NO_ENTITY'}`,
  };
}
