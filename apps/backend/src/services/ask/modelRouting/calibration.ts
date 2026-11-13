// Phase 3 admission artifact. Runtime execution is fail-closed: source-model confidence is never a calibrated probability.
export interface UnderstandingCalibrationCertificate {
  readonly stratum: 'SINGLE_STAGE_READ_PLAN';
  readonly status: 'CERTIFIED' | 'UNCERTIFIED';
  readonly independentFamilies: number;
  readonly incorrectHighConfidence: number;
  readonly incorrectUpperBound: number;
  readonly sealedSetId?: string;
}

export const UNDERSTANDING_CALIBRATION: readonly UnderstandingCalibrationCertificate[] = Object.freeze([
  { stratum: 'SINGLE_STAGE_READ_PLAN', status: 'UNCERTIFIED', independentFamilies: 0, incorrectHighConfidence: 0, incorrectUpperBound: 1 },
]);

export function isUnderstandingStratumCertified(stratum: UnderstandingCalibrationCertificate['stratum']): boolean {
  const certificate = UNDERSTANDING_CALIBRATION.find((entry) => entry.stratum === stratum);
  return !!certificate && certificate.status === 'CERTIFIED'
    && certificate.independentFamilies >= 381
    && certificate.incorrectUpperBound < 0.01
    && !!certificate.sealedSetId;
}
