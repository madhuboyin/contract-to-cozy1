// apps/backend/src/sellerPrep/providers/compsFallback.provider.ts
import { CompsProvider } from './comps.provider';
import { ComparableResponse } from '../types/comps.types';

export class CompsFallbackProvider implements CompsProvider {
    async getComparables(input: {
      city: string;
      state: string;
      zip?: string;
      propertyType?: string;
    }): Promise<ComparableResponse> {
      return {
        available: false,
        source: 'MARKET_TRENDS' as const,
        marketSummary: {
          medianSoldPrice: undefined,
          avgDaysOnMarket: undefined,
          trend: 'STABLE' as const,
        },
        disclaimer:
          'Market trends shown instead of property-level comparables.',
      };
    }
  }
  