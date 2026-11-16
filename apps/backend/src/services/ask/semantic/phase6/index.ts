export * from './semanticProviderOrchestrator';
export * from './riskStratifiedCalibration';
export * from './endToEndEvaluationHarness';

import { runPhase6EndToEndEvaluation, type Phase6EvaluationReport } from './endToEndEvaluationHarness';

export interface Phase6SummaryOutput {
  readonly version: string;
  readonly evaluatedAt: string;
  readonly evaluationNature: 'SEALED_PROXY';
  readonly isRealHomeownerTrafficDistribution: false;
  readonly sealedProxyInvariantsPassed: boolean;
  readonly statisticalWilsonClaimStatus: 'PASSED' | 'INSUFFICIENT_INDEPENDENT_SAMPLES';
  readonly passed: boolean;
  readonly passedGateCount: number;
  readonly totalGateCount: number;
  readonly failedDomains: readonly string[];
  readonly failedStrata: readonly string[];
  readonly totalMetricCountCovered: number;
  readonly calibrationObservedZeroErrorPassed: boolean;
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
    (max, stratum) => (typeof stratum.expectedCalibrationError === 'number' ? Math.max(max, stratum.expectedCalibrationError) : max),
    0,
  );
  const summaryLines = [
    `Ask Phase 6 Evaluation (${report.version}): invariants=${report.sealedProxyInvariantsPassed ? 'PASSED' : 'FAILED'}, fullFrEval4Gates=${report.passed ? 'PASSED' : report.statisticalWilsonClaimStatus} [corpus=${report.corpusProvenance.corpusType}, independentlyAuthored=${String(report.corpusProvenance.independentlyAuthored)}, isRealHomeownerTrafficDistribution=${String(report.isRealHomeownerTrafficDistribution)}]`,
    `FR-EVAL-4 Product Gates: ${passedGateCount}/${totalGateCount} passed`,
    `Entry-Path Routing (cascade + capabilityInvoke): rawCascadeNonFallback=${report.entryPathTelemetry.rawCascadeNonFallbackCount}/${report.entryPathTelemetry.totalCases}, semanticEntryPromoted=${report.entryPathTelemetry.semanticEntryPromotedCount}, entryCapabilityResolved=${report.entryPathTelemetry.entryCapabilityResolvedCount}/${report.entryPathTelemetry.entryCapabilityExecutedCount}, separateLegacyOps=${report.entryPathTelemetry.routedToSeparateLegacyOpCount}`,
    `Macro vs Per-Domain Lower 95% CI: macroPoint=${(report.frEval3Metrics.endToEndResolvedRateMacroByDomain * 100).toFixed(1)}%, meanDomainLower95=${(report.frEval3Metrics.macroDomainLower95Summary.meanDomainLower95 * 100).toFixed(2)}%, minDomainLower95=${(report.frEval3Metrics.macroDomainLower95Summary.minDomainLower95 * 100).toFixed(2)}% (pooledLower95=${(report.frEval3Metrics.endToEndResolvedConfidenceInterval95.lower * 100).toFixed(2)}%)`,
    `Risk-Stratified Calibration (${report.riskStratifiedCalibration.calibrationEvaluationMode}): observedZeroError=${report.riskStratifiedCalibration.observedZeroErrorPassed ? 'PASSED' : 'FAILED'}, wilsonUnder1PctBound=${report.riskStratifiedCalibration.overallPassed ? 'PASSED' : 'INSUFFICIENT_INDEPENDENT_SAMPLES'} (independentObs=${report.riskStratifiedCalibration.totalObservations}, maxStratumLOO_ECE=${maxStratumEce.toFixed(4)}, incorrectHighConfidence=${report.riskStratifiedCalibration.totalIncorrectHighConfidence})`,
    `Correlated Metamorphic Evidence (FR-EVAL-5, separate from Wilson n): passed=${String(report.correlatedMetamorphicEvidence.suitePassed)}, domainPairs=${report.correlatedMetamorphicEvidence.passedPairs}/${report.correlatedMetamorphicEvidence.totalPairsEvaluated}, phase6Variants=${report.correlatedMetamorphicEvidence.phase6InvarianceVariantsPassed}/${report.correlatedMetamorphicEvidence.phase6InvarianceVariantsChecked}`,
    `Provider Simulator Disclosure: kind=${report.providerEvaluationDisclosure.providerKind} (${report.providerEvaluationDisclosure.providerId}), liveExternalModelEvaluated=${String(report.providerEvaluationDisclosure.liveExternalModelEvaluated)}, simulatorIncremental=${(report.frEval3Metrics.providerExpandedIncrementalCoverageRate * 100).toFixed(1)}%, disagreements=${report.frEval3Metrics.producerDisagreementCount}`,
    `Security & Instrumented Replay: spanRoundTrip=${(report.frEval3Metrics.protectedSpanRoundTripAccuracy * 100).toFixed(1)}%, replayRedaction=${(report.frEval3Metrics.replayReauthorizationRedactionAccuracy * 100).toFixed(1)}%, measuredReplayQueries(N=5,25,100)=${report.frEval3Metrics.replayQueryCountBounds.queryCountsByPageSize.map((q) => q.authorizationQueryCount).join('/')}`,
    `External Provider Governance (§22.3/§22.4): status=${report.providerTrackPStatus.policy.approvalStatus}, liveExternalRuntimePendingApproval=${String(report.providerTrackPStatus.liveExternalRuntimePendingApproval)}`,
  ];

  return {
    version: report.version,
    evaluatedAt: report.evaluatedAt,
    evaluationNature: report.evaluationNature,
    isRealHomeownerTrafficDistribution: report.isRealHomeownerTrafficDistribution,
    sealedProxyInvariantsPassed: report.sealedProxyInvariantsPassed,
    statisticalWilsonClaimStatus: report.statisticalWilsonClaimStatus,
    passed: report.passed,
    passedGateCount,
    totalGateCount,
    failedDomains: report.failedDomains,
    failedStrata: report.failedStrata,
    totalMetricCountCovered: frEval3KeyCount,
    calibrationObservedZeroErrorPassed: report.riskStratifiedCalibration.observedZeroErrorPassed,
    calibrationOverallPassed: report.riskStratifiedCalibration.overallPassed,
    providerTrackPCompleted: report.providerTrackPStatus.trackCompleted,
    liveExternalRuntimePendingApproval: report.providerTrackPStatus.liveExternalRuntimePendingApproval,
    summaryLines,
    report,
  };
}
