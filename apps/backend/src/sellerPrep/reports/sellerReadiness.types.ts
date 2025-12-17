// apps/backend/src/sellerPrep/reports/sellerReadiness.types.ts
export type SellerReadinessReport = {
    propertyId: string;
  
    summary: {
      completionPercent: number;
      highPriorityRemaining: number;
      estimatedUpliftRange: string;
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
  };
  