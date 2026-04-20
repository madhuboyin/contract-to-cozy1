// apps/frontend/src/lib/types/trust.ts

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface EstimatedUpside {
  amount: number;
  period: 'monthly' | 'one-time' | 'annual';
  basis: string; // e.g., "current rate vs 30yr avg"
}

export interface TrustMetadata {
  confidence: ConfidenceLevel;
  confidenceScore?: number; // 0-100
  source: string; // e.g., "Your maintenance history + manufacturer specs"
  lastUpdated: string; // ISO date string
  estimatedUpside?: EstimatedUpside;
  riskIfIgnored?: string; // e.g., "Delay 30+ days → ~$400-800 repair risk"
  whyThisMatters?: string; // Human-language explanation
  userVerifiableAssumptions?: string[]; // List of assumptions the user can check
}
