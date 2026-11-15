export * from './semanticProviderOrchestrator';
export * from './riskStratifiedCalibration';
export * from './endToEndEvaluationHarness';

import { runPhase6EndToEndEvaluation, type Phase6EvaluationReport } from './endToEndEvaluationHarness';

export interface Phase6SummaryOutput {
  readonly version: string;
  readonly evaluatedAt: string;
  readonly evaluationNature: 'SEALED_PROXY';
  readonly isRealHomeownerTrafficDistribution: false;
  readonly passed: boolean;
  readonly passedGateCount: number;
  readonly totalGateCount: number;
  readonly failedDomains: readonly string[];
  readonly failedStrata: readonly string[];
  readonly totalMetricCountCovered: number;
  readonly calibrationOverallPassed: boolean;
  readonly providerTrackPCompleted: boolean;
  readonly liveExternalRuntimePendingApproval: boolean;
  readonly summaryLines: readonly string[];
  readonly report: Phase6EvaluationReport;
}

export async function buildPhase6CalibrationAndEvaluationSummary(): Promise<Phase6SummaryOutput> {
  const report = await runPhase6EndToEndEvaluation();
  const passedGateCount = report.frEval4ProductGates.filter((gate) => gate.passed).length;
  const totalGateCount = report.frEval4ProductGates.length;
  const frEval3KeyCount = Object.keys(report.frEval3Metrics).length;

  const maxStratumEce = report.riskStratifiedCalibration.strata.reduce(
    (max, stratum) => Math.max(max, stratum.expectedCalibrationError),
    0,
  );
  const summaryLines = [
    `Ask Phase 6 Evaluation (${report.version}): ${report.passed ? 'PASSED' : 'FAILED'} [${report.evaluationNature}, isRealHomeownerTrafficDistribution=${String(report.isRealHomeownerTrafficDistribution)}]`,
    `FR-EVAL-4 Product Gates: ${passedGateCount}/${totalGateCount} passed`,
    `Risk-Stratified Calibration: ${report.riskStratifiedCalibration.overallPassed ? 'PASSED' : 'FAILED'} (maxStratumECE=${maxStratumEce.toFixed(4)}, incorrectHighConfidence=${report.riskStratifiedCalibration.totalIncorrectHighConfidence})`,
    `End-to-End Sealed Proxy Resolved: macro=${(report.frEval3Metrics.endToEndResolvedRateMacroByDomain * 100).toFixed(1)}%, weighted=${(report.frEval3Metrics.endToEndResolvedRateWeighted * 100).toFixed(1)}%, wrongAnswerRate=${(report.frEval3Metrics.wrongAnswerRate * 100).toFixed(2)}%`,
    `Deterministic vs Provider: detCoverage=${(report.frEval3Metrics.deterministicParserCoverageRate * 100).toFixed(1)}%, providerIncremental=${(report.frEval3Metrics.providerExpandedIncrementalCoverageRate * 100).toFixed(1)}%, disagreements=${report.frEval3Metrics.producerDisagreementCount}`,
    `Security & Replay: spanRoundTrip=${(report.frEval3Metrics.protectedSpanRoundTripAccuracy * 100).toFixed(1)}%, replayRedaction=${(report.frEval3Metrics.replayReauthorizationRedactionAccuracy * 100).toFixed(1)}%, maxBatchQueries=${report.frEval3Metrics.replayQueryCountBounds.maxQueryCount}`,
    `External Provider Governance (§22.3/§22.4): status=${report.providerTrackPStatus.policy.approvalStatus}, liveExternalRuntimePendingApproval=${String(report.providerTrackPStatus.liveExternalRuntimePendingApproval)}`,
  ];

  return {
    version: report.version,
    evaluatedAt: report.evaluatedAt,
    evaluationNature: report.evaluationNature,
    isRealHomeownerTrafficDistribution: report.isRealHomeownerTrafficDistribution,
    passed: report.passed,
    passedGateCount,
    totalGateCount,
    failedDomains: report.failedDomains,
    failedStrata: report.failedStrata,
    totalMetricCountCovered: frEval3KeyCount,
    calibrationOverallPassed: report.riskStratifiedCalibration.overallPassed,
    providerTrackPCompleted: report.providerTrackPStatus.trackCompleted,
    liveExternalRuntimePendingApproval: report.providerTrackPStatus.liveExternalRuntimePendingApproval,
    summaryLines,
    report,
  };
}
