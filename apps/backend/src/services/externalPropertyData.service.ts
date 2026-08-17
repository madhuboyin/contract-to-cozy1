// apps/backend/src/services/externalPropertyData.service.ts

import { DwellingType } from '@prisma/client';
import { logger } from '../lib/logger';

export interface ExternalPropertyData {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  yearBuilt: number | null;
  propertySize: number | null; // in sqft
  dwellingType: DwellingType | null;
  bedrooms: number | null;
  bathrooms: number | null;
  lastSalePrice: number | null; // in cents
  lastSaleDate: Date | null;
  estimatedValue: number | null; // in cents
  lotSize: number | null; // in sqft
}

/**
 * ExternalPropertyDataService abstracts the fetching of property-specific data
 * from public record providers like RentCast or ATTOM.
 */
export class ExternalPropertyDataService {
  /** Fetches property data only when a real provider is available. */
  async getPropertyByAddress(address: string, zipCode?: string): Promise<ExternalPropertyData | null> {
    logger.info({ address, zipCode }, '[EXTERNAL-PROPERTY-DATA] Fetching data for address');

    // Synthetic property/location data must never cross the production lookup
    // boundary. Address onboarding can continue with user-confirmed fields while
    // unknown property facts stay null until a provider is integrated.
    if (!process.env.RENTCAST_API_KEY || !zipCode) {
      logger.info('[EXTERNAL-PROPERTY-DATA] Provider unavailable; returning no enrichment');
      return null;
    }

    return this.fetchFromRentCast(address, zipCode);
  }

  /**
   * Placeholder for future RentCast integration.
   * Logic will move here in Phase 2.2
   */
  private async fetchFromRentCast(_address: string, _zipCode: string): Promise<ExternalPropertyData | null> {
    // API_KEY would come from process.env.RENTCAST_API_KEY
    // const url = `https://api.rentcast.io/v1/properties/address/${encodeURIComponent(address)}?zipCode=${zipCode}`;
    return null;
  }
}

export const externalPropertyDataService = new ExternalPropertyDataService();
