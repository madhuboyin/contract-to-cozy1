// apps/backend/src/sellerPrep/types/sellerPrep.types.ts
export type SellerPrepItem = {
    code: string;
    title: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    roiRange: string;
    costBucket: '$' | '$$' | '$$$';
    reason: string;
    status?: 'PLANNED' | 'DONE' | 'SKIPPED';
  };
  
  export type SellerPrepOverview = {
    propertyId: string;
    items: SellerPrepItem[];
    completionPercent: number;
  };
  