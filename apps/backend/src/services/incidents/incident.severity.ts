// backend/src/services/incidents/incident.severity.ts
export type SeverityBreakdown = {
    riskImpact: number;          // 0-100 contribution
    likelihood: number;          // 0-100 contribution
    timeSensitivity: number;     // 0-100 contribution
    coveragePenalty: number;     // 0-100 contribution
    mitigationConfidence: number; // 0-100 contribution (subtract)
    total: number;              // final 0-100
  };
  
  export function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }
  
  export function computeSeverityFromBreakdown(b: Omit<SeverityBreakdown, 'total'>): SeverityBreakdown {
    const raw = b.riskImpact + b.likelihood + b.timeSensitivity + b.coveragePenalty - b.mitigationConfidence;
    const total = clamp(Math.round(raw), 0, 100);
    return { ...b, total };
  }
  
  export function mapSeverityLevel(score: number): 'INFO' | 'WARNING' | 'CRITICAL' {
    if (score >= 70) return 'CRITICAL';
    if (score >= 35) return 'WARNING';
    return 'INFO';
  }
  