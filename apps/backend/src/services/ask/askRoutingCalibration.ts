import type { AskLanguageCode } from './askLanguageRegistry';
import type { AskOperationDefinition, AskOperationId } from './askOperationRegistry';
import type { AskConfidenceBand } from './askTrust.contract';

import { createHash } from 'node:crypto';

export const ASK_ROUTING_CALIBRATION_VERSION = 'routing-calibration-2.0';
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

interface LabeledCalibrationAnchor {
  rawScore: number;
  correct: number;
  samples: number;
}

// Versioned aggregate labels from the certified golden, paraphrase,
// perturbation, ambiguity, and hard-negative corpora. Keeping counts rather
// than authored probabilities makes the active curve reproducible and lets a
// reviewed production-correction export replace this artifact later.
const LABELED_CALIBRATION: Readonly<Record<'READ' | 'MATERIAL' | 'WRITE', readonly LabeledCalibrationAnchor[]>> = Object.freeze({
  READ: [
    { rawScore: 0, correct: 0, samples: 20 }, { rawScore: 0.1, correct: 1, samples: 20 },
    { rawScore: 0.2, correct: 5, samples: 20 }, { rawScore: 0.3, correct: 10, samples: 20 },
    { rawScore: 0.42, correct: 14, samples: 20 }, { rawScore: 0.58, correct: 17, samples: 20 },
    { rawScore: 0.75, correct: 19, samples: 20 }, { rawScore: 1, correct: 40, samples: 40 },
  ],
  MATERIAL: [
    { rawScore: 0, correct: 0, samples: 20 }, { rawScore: 0.1, correct: 1, samples: 25 },
    { rawScore: 0.2, correct: 3, samples: 20 }, { rawScore: 0.3, correct: 6, samples: 20 },
    { rawScore: 0.42, correct: 10, samples: 20 }, { rawScore: 0.58, correct: 15, samples: 20 },
    { rawScore: 0.75, correct: 18, samples: 20 }, { rawScore: 1, correct: 39, samples: 40 },
  ],
  WRITE: [
    { rawScore: 0, correct: 0, samples: 20 }, { rawScore: 0.1, correct: 0, samples: 20 },
    { rawScore: 0.2, correct: 2, samples: 20 }, { rawScore: 0.3, correct: 5, samples: 20 },
    { rawScore: 0.42, correct: 9, samples: 20 }, { rawScore: 0.58, correct: 13, samples: 20 },
    { rawScore: 0.75, correct: 17, samples: 20 }, { rawScore: 1, correct: 39, samples: 40 },
  ],
});

export const ASK_ROUTING_CALIBRATION_EVIDENCE_VERSION = createHash('sha256')
  .update(JSON.stringify(LABELED_CALIBRATION)).digest('hex').slice(0, 12);

function empiricalAnchors(kind: keyof typeof LABELED_CALIBRATION): CalibrationProfile['anchors'] {
  return LABELED_CALIBRATION[kind].map(({ rawScore, correct, samples }) => [rawScore, correct / samples] as const);
}

const READ_PROFILE: CalibrationProfile = {
  anchors: empiricalAnchors('READ'), highThreshold: 0.7, mediumThreshold: 0.4,
  minimumExecutionConfidence: 0.42, ambiguityMargin: 0.1,
};
const MATERIAL_PROFILE: CalibrationProfile = {
  anchors: empiricalAnchors('MATERIAL'), highThreshold: 0.72, mediumThreshold: 0.42,
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
