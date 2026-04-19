export interface TrustMetadata {
  confidence: 'high' | 'medium' | 'low';
  confidenceScore?: number;
  source: string;
  lastUpdated?: string;
  estimatedUpside?: {
    amount: number;
    period: string;
    basis: string;
  };
  riskIfIgnored?: string;
  whyThisMatters?: string;
  userVerifiableAssumptions?: string[];
}
