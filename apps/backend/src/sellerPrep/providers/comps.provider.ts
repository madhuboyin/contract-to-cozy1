// apps/backend/src/sellerPrep/providers/comps.provider.ts
import { ComparableResponse } from '../types/comps.types';

export interface CompsProvider {
  getComparables(input: {
    city: string;
    state: string;
    zip?: string;
    propertyType?: string;
  }): Promise<ComparableResponse>;
}
