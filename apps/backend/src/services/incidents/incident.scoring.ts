// apps/backend/src/services/incidents/incident.scoring.ts
import { IncidentSeverity } from '@prisma/client';

export type SeverityBreakdown = {
  impact: number;            // 0-30
  likelihood: number;        // 0-25
  timeSensitivity: number;   // 0-20
  coveragePenalty: number;   // 0-15
  mitigation: number;        // -20..0
  total: number;             // 0..100
};

export type IncidentScoringContext = {
  // optional normalized context used by rules (can be expanded later)
  typeKey: string;

  // assets / costs
  exposureUsd?: number | null;     // estimated damage / repair cost
  safetyCritical?: boolean | null; // fire, gas, flooding etc.

  // time
  timeWindowHours?: number | null; // how soon it may manifest

  // likelihood signals
  probabilityPct?: number | null;  // model probability 0..100

  // coverage
  isCovered?: boolean | null;      // true/false/unknown
  coverageClarity?: 'CLEAR' | 'UNCLEAR' | 'UNKNOWN' | null;

  // mitigation signals
  mitigationLevel?: 'ACTIVE_PROTECTION' | 'SCHEDULED' | 'CONFIRMED' | 'PARTIAL' | 'NONE' | null;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function bucketImpact(exposureUsd?: number | null, safetyCritical?: boolean | null): number {
  if (safetyCritical) return 30;

  const x = exposureUsd ?? 0;
  if (x <= 250) return 5;
  if (x <= 1500) return 15;
  if (x <= 5000) return 20;
  if (x <= 15000) return 25;
  return 30;
}

function bucketLikelihood(probabilityPct?: number | null): number {
  const p = probabilityPct ?? 0;
  if (p >= 85) return 25;
  if (p >= 60) return 18;
  if (p >= 35) return 10;
  return 5;
}

function bucketTimeSensitivity(timeWindowHours?: number | null): number {
  const h = timeWindowHours ?? 9999;
  if (h <= 24 * 7) return 20;      // <7 days
  if (h <= 24 * 30) return 15;     // 7-30 days
  if (h <= 24 * 90) return 10;     // 30-90 days
  return 5;
}

function bucketCoveragePenalty(
  isCovered?: boolean | null,
  clarity?: 'CLEAR' | 'UNCLEAR' | 'UNKNOWN' | null
): number {
  if (isCovered === true) return 0;
  if (isCovered === false) return 15;
  // unknown/unclear coverage
  if (clarity === 'UNCLEAR') return 10;
  if (clarity === 'UNKNOWN') return 10;
  return 10;
}

function bucketMitigation(mitigationLevel?: IncidentScoringContext['mitigationLevel']): number {
  switch (mitigationLevel) {
    case 'ACTIVE_PROTECTION': return -20;
    case 'SCHEDULED': return -15;
    case 'CONFIRMED': return -10;
    case 'PARTIAL': return -5;
    case 'NONE':
    default: return 0;
  }
}

export function computeSeverity(ctx: IncidentScoringContext): { severity: IncidentSeverity; breakdown: SeverityBreakdown } {
  const impact = bucketImpact(ctx.exposureUsd, ctx.safetyCritical);
  const likelihood = bucketLikelihood(ctx.probabilityPct);
  const timeSensitivity = bucketTimeSensitivity(ctx.timeWindowHours);
  const coveragePenalty = bucketCoveragePenalty(ctx.isCovered, ctx.coverageClarity ?? 'UNKNOWN');
  const mitigation = bucketMitigation(ctx.mitigationLevel);

  const total = clamp(impact + likelihood + timeSensitivity + coveragePenalty + mitigation, 0, 100);

  const severity =
    total >= 60 ? IncidentSeverity.CRITICAL :
    total >= 25 ? IncidentSeverity.WARNING :
    IncidentSeverity.INFO;

  return {
    severity,
    breakdown: { impact, likelihood, timeSensitivity, coveragePenalty, mitigation, total },
  };
}

/**
 * Confidence scoring (0..100)
 * - based on signal freshness, signal agreement, and model probability
 * - keep simple now; expand later for IoT + ML provenance
 */
export function computeConfidence(args: {
  probabilityPct?: number | null;
  hasMultipleSignals?: boolean;
  hasExternalAuthoritativeSignal?: boolean; // e.g., NOAA, insurer record
  signalAgeMinutes?: number | null;
}): number {
  const p = args.probabilityPct ?? 0;
  let score = 30;

  // probability influence
  score += Math.round((clamp(p, 0, 100) / 100) * 40); // +0..40

  if (args.hasMultipleSignals) score += 10;
  if (args.hasExternalAuthoritativeSignal) score += 10;

  const age = args.signalAgeMinutes ?? 999999;
  if (age <= 60) score += 10;
  else if (age <= 24 * 60) score += 5;
  else score -= 5;

  return clamp(score, 0, 100);
}
