// apps/backend/src/services/climateZone.service.ts
import { ClimateRegion, Property } from '@prisma/client';
import climateData from '../data/zipToClimateRegion.json';
import { prisma } from '../lib/prisma';

interface ClimateZoneMapping {
  metadata: {
    version: string;
    lastUpdated: string;
    description: string;
    regions: Record<string, string>;
  };
  zipPrefixMapping: Record<string, ClimateRegion>;
  stateDefaults: Record<string, ClimateRegion>;
}

const CLIMATE_DATA = climateData as ClimateZoneMapping;

export class ClimateZoneService {
  /**
   * Detect climate region from property ZIP code
   */
  static async detectClimateRegion(zipCode: string): Promise<ClimateRegion> {
    // Remove spaces and hyphens, get first 3 digits
    const cleanZip = zipCode.replace(/[\s-]/g, '');
    const zipPrefix = cleanZip.substring(0, 3);

    // Try exact 3-digit prefix match
    if (CLIMATE_DATA.zipPrefixMapping[zipPrefix]) {
      return CLIMATE_DATA.zipPrefixMapping[zipPrefix];
    }

    // Fallback to national average
    return 'MODERATE';
  }

  /**
   * Detect climate region from state
   */
  static getClimateRegionByState(state: string): ClimateRegion {
    const upperState = state.toUpperCase();
    return CLIMATE_DATA.stateDefaults[upperState] || 'MODERATE';
  }

  /**
   * Get or create climate settings for a property
   */
  static async getOrCreateClimateSettings(propertyId: string) {
    // Check if settings already exist
    let settings = await prisma.propertyClimateSetting.findUnique({
      where: { propertyId },
    });

    if (settings) {
      return settings;
    }

    // Get property to detect climate zone
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { zipCode: true, state: true },
    });

    if (!property) {
      throw new Error('Property not found');
    }

    // Detect climate region
    const climateRegion = await this.detectClimateRegion(property.zipCode);

    // Create settings
    settings = await prisma.propertyClimateSetting.create({
      data: {
        propertyId,
        climateRegion,
        climateRegionSource: 'AUTO_DETECTED',
        notificationTiming: 'STANDARD',
        notificationEnabled: true,
        autoGenerateChecklists: true,
        excludedTaskKeys: [],
      },
    });

    return settings;
  }

  /**
   * Update climate settings for a property
   */
  static async updateClimateSettings(
    propertyId: string,
    updates: {
      climateRegion?: ClimateRegion;
      notificationTiming?: 'EARLY' | 'STANDARD' | 'LATE';
      notificationEnabled?: boolean;
      autoGenerateChecklists?: boolean;
      excludedTaskKeys?: string[];
    }
  ) {
    const settings = await this.getOrCreateClimateSettings(propertyId);

    const updatedSettings = await prisma.propertyClimateSetting.update({
      where: { id: settings.id },
      data: {
        ...updates,
        climateRegionSource:
          updates.climateRegion !== undefined ? 'USER_OVERRIDE' : settings.climateRegionSource,
      },
    });

    return updatedSettings;
  }

  /**
   * Get climate info for a property
   */
  static async getClimateInfo(propertyId: string) {
    const settings = await this.getOrCreateClimateSettings(propertyId);
    const currentSeason = this.getCurrentSeason(settings.climateRegion);
    const nextSeason = this.getNextSeason(currentSeason);
    const nextSeasonDate = this.getSeasonStartDate(nextSeason, new Date().getFullYear());

    const daysUntilNextSeason = Math.ceil(
      (nextSeasonDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      propertyId,
      climateRegion: settings.climateRegion,
      climateRegionSource: settings.climateRegionSource,
      currentSeason,
      nextSeason,
      nextSeasonStartDate: nextSeasonDate.toISOString().split('T')[0],
      daysUntilNextSeason,
    };
  }

  /**
   * Get current season based on date and climate region
   */
  static getCurrentSeason(climateRegion: ClimateRegion): 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER' {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const day = now.getDate();

    // Standard astronomical seasons (most regions)
    if (climateRegion === 'MODERATE' || climateRegion === 'COLD') {
      if ((month === 2 && day >= 20) || month === 3 || month === 4 || (month === 5 && day < 21)) {
        return 'SPRING';
      }
      if ((month === 5 && day >= 21) || month === 6 || month === 7 || (month === 8 && day < 22)) {
        return 'SUMMER';
      }
      if ((month === 8 && day >= 22) || month === 9 || month === 10 || (month === 11 && day < 21)) {
        return 'FALL';
      }
      return 'WINTER';
    }

    // Very cold regions (earlier spring, shorter summer)
    if (climateRegion === 'VERY_COLD') {
      if (month === 3 || month === 4 || month === 5) return 'SPRING';
      if (month === 6 || month === 7 || (month === 8 && day < 16)) return 'SUMMER';
      if ((month === 8 && day >= 16) || month === 9 || month === 10) return 'FALL';
      return 'WINTER';
    }

    // Warm/tropical regions (earlier spring, longer summer)
    if (climateRegion === 'WARM' || climateRegion === 'TROPICAL') {
      if ((month === 1 && day >= 15) || month === 2 || month === 3 || month === 4) return 'SPRING';
      if (month === 5 || month === 6 || month === 7 || (month === 8 && day < 16)) return 'SUMMER';
      if ((month === 8 && day >= 16) || month === 9 || month === 10) return 'FALL';
      return 'WINTER';
    }

    return 'SPRING'; // Fallback
  }

  /**
   * Get next season
   */
  static getNextSeason(
    currentSeason: 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER'
  ): 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER' {
    const seasons: Array<'SPRING' | 'SUMMER' | 'FALL' | 'WINTER'> = ['SPRING', 'SUMMER', 'FALL', 'WINTER'];
    const currentIndex = seasons.indexOf(currentSeason);
    return seasons[(currentIndex + 1) % 4];
  }

  /**
   * Get season start date for a given year
   */
  static getSeasonStartDate(season: 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER', year: number): Date {
    // Standard astronomical dates
    switch (season) {
      case 'SPRING':
        return new Date(year, 2, 20); // March 20
      case 'SUMMER':
        return new Date(year, 5, 21); // June 21
      case 'FALL':
        return new Date(year, 8, 22); // September 22
      case 'WINTER':
        return new Date(year, 11, 21); // December 21
      default:
        return new Date(year, 2, 20);
    }
  }

  /**
   * Get season end date for a given year
   */
  static getSeasonEndDate(season: 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER', year: number): Date {
    const nextSeason = this.getNextSeason(season);
    const nextSeasonStart = this.getSeasonStartDate(nextSeason, year);
    
    // End date is one day before next season starts
    const endDate = new Date(nextSeasonStart);
    endDate.setDate(endDate.getDate() - 1);
    
    // Handle year boundary for WINTER
    if (season === 'WINTER') {
      return new Date(year + 1, 2, 19); // March 19 of next year
    }
    
    return endDate;
  }

  /**
   * Get notification offset based on timing preference
   */
  static getNotificationOffsetDays(timing: 'EARLY' | 'STANDARD' | 'LATE'): number {
    switch (timing) {
      case 'EARLY':
        return 21; // 3 weeks before
      case 'STANDARD':
        return 14; // 2 weeks before
      case 'LATE':
        return 7; // 1 week before
      default:
        return 14;
    }
  }
}

export default ClimateZoneService;