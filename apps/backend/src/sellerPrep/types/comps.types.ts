// apps/backend/src/sellerPrep/types/comps.types.ts
export type ComparableHome = {
    address: string;
    soldPrice: number | null;
    soldDate: string | null;
    sqft?: number;
    beds?: number;
    baths?: number;
    similarityReason: string;
  };
  
  export type ComparableResponse = {
    available: boolean;
    source: 'PUBLIC_RECORDS' | 'MARKET_TRENDS';
    comparables?: ComparableHome[];
    marketSummary?: {
      medianSoldPrice?: number;
      avgDaysOnMarket?: number;
      trend: 'UP' | 'DOWN' | 'STABLE';
    };
    disclaimer: string;
  };
  