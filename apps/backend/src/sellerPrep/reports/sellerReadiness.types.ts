// apps/backend/src/sellerPrep/reports/sellerReadiness.types.ts
export type SellerReadinessReport = {
    propertyId: string;
    saleIntentConfirmed: boolean;

    summary: {
      completionPercent: number;
      highPriorityRemaining: number;
    };
  
    topActions: {
      code: string;
      title: string;
      priority: string;
      roiRange: string;
      status: string;
    }[];
  
    comparables: {
      available: boolean;
      source: string;
      note: string;
    };
  
    disclaimers: string[];

    // Property Context sale-readiness decision backing this report.
    saleReadiness: {
      status: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
      reasonCodes: string[];
      missingFactKeys: string[];
      contextVersion: string;
    };
  };
  