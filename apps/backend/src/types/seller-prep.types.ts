// apps/frontend/src/types/seller-prep.types.ts

export interface SellerPrepItem {
    id: string;
    title: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    roiRange: string;
    costBucket: '$' | '$$' | '$$$';
    status: 'PLANNED' | 'DONE' | 'SKIPPED';
  }
  
  export interface SellerPrepOverviewResponse {
    items: SellerPrepItem[];
    completionPercent: number;
    propertyId: string;
  }
  
  export interface ComparableHome {
    address: string;
    soldPrice: number | null;
    soldDate: string | null;
    sqft?: number;
    beds?: number;
    baths?: number;
    similarityReason: string;
  }
  
  export interface ComparablesResponse {
    data: ComparableHome[];
    meta?: {
      available: boolean;
      source: 'PUBLIC_RECORDS' | 'MARKET_TRENDS';
      disclaimer: string;
      marketSummary?: {
        medianSoldPrice?: number;
        avgDaysOnMarket?: number;
        trend: 'UP' | 'DOWN' | 'STABLE';
      };
    };
  }
  
  export interface ReadinessReport {
    summary: string;
    highlights?: string[];
    risks?: string[];
    disclaimers?: string[];
    rawData?: {
      propertyId: string;
      summary: {
        completionPercent: number;
        highPriorityRemaining: number;
        estimatedUpliftRange: string;
      };
      topActions: SellerPrepItem[];
      comparables: {
        available: boolean;
        source: string;
        note: string;
      };
      disclaimers: string[];
    };
  }
  
  export interface UpdateItemStatusInput {
    status: 'PLANNED' | 'DONE' | 'SKIPPED';
  }
  
  export interface CreateLeadInput {
    propertyId: string;
    leadType: 'AGENT' | 'CONTRACTOR' | 'STAGER';
    context: string;
  }