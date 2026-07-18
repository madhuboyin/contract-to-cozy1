export type PropertyContextDecision = {
  status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  reasonCodes: string[];
  usedFactKeys: string[];
  missingFactKeys: string[];
  conflictedFactKeys: string[];
  validUntil: string | null;
  correctionPaths?: string[];
};

export type PropertyContextEnvelope = {
  propertyId?: string;
  contextVersion: string;
  generatedContextVersion?: string | null;
  isStale?: boolean;
  decision: PropertyContextDecision;
  reconciliation?: {
    status: 'CURRENT' | 'REVIEW_REQUIRED';
    requiresReview: boolean;
    contextVersion?: string;
    reasonCodes: string[];
    affectedOutputs?: Array<{ factKey: string; outputType: string; count: number }>;
  };
};
