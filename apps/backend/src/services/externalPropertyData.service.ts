// apps/backend/src/services/externalPropertyData.service.ts

import { PropertyType } from '@prisma/client';
import { logger } from '../lib/logger';

export interface ExternalPropertyData {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  yearBuilt: number | null;
  propertySize: number | null; // in sqft
  propertyType: PropertyType | null;
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
  /**
   * Fetches property data from external providers (Mocked for now).
   * In production, this would call RentCast or ATTOM.
   */
  async getPropertyByAddress(address: string, zipCode?: string): Promise<ExternalPropertyData | null> {
    logger.info({ address, zipCode }, '[EXTERNAL-PROPERTY-DATA] Fetching data for address');

    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, 800));

    // MOCK LOGIC: In a real app, this would be a fetch() to RentCast/ATTOM
    // For now, we return high-quality mock data based on the address to simulate variety.
    
    // Simple deterministic mock logic
    const isModern = address.length % 2 === 0;
    const yearBuilt = isModern ? 2015 : 1995;
    const size = isModern ? 2450 : 1850;
    
    return {
      address,
      city: 'Austin', // Default mock city
      state: 'TX',
      zipCode: zipCode || '78701',
      yearBuilt,
      propertySize: size,
      propertyType: PropertyType.SINGLE_FAMILY,
      bedrooms: isModern ? 4 : 3,
      bathrooms: isModern ? 3.5 : 2.5,
      lastSalePrice: (isModern ? 550000 : 320000) * 100,
      lastSaleDate: new Date(isModern ? '2021-06-15' : '2012-11-20'),
      estimatedValue: (isModern ? 625000 : 410000) * 100,
      lotSize: 7500,
    };
  }

  /**
   * Placeholder for future RentCast integration.
   * Logic will move here in Phase 2.2
   */
  private async fetchFromRentCast(address: string, zipCode: string): Promise<any> {
    // API_KEY would come from process.env.RENTCAST_API_KEY
    // const url = `https://api.rentcast.io/v1/properties/address/${encodeURIComponent(address)}?zipCode=${zipCode}`;
    return null;
  }
}

export const externalPropertyDataService = new ExternalPropertyDataService();
