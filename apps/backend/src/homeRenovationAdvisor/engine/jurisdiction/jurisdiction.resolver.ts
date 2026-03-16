// apps/backend/src/homeRenovationAdvisor/engine/jurisdiction/jurisdiction.resolver.ts
//
// Resolves jurisdiction context for a renovation advisor session.
// Derives state/county/city/postalCode from the property profile,
// applies any user override, and produces a normalizedJurisdictionKey.

import { AdvisorConfidenceLevel, RenovationJurisdictionLevel } from '@prisma/client';
import { JurisdictionContext, JurisdictionOverride } from '../../types/homeRenovationAdvisor.types';

// Property shape we need for resolution
export interface PropertyAddressContext {
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

export function resolveJurisdiction(
  property: PropertyAddressContext,
  override?: JurisdictionOverride | null,
): JurisdictionContext {
  // Start with property profile data
  let state = property.state?.trim().toUpperCase() || null;
  let city = property.city?.trim() || null;
  const postalCode = property.zipCode?.trim() || null;
  let county: string | null = null;
  let source: JurisdictionContext['source'] = 'property_profile';

  // Apply user override fields selectively
  if (override) {
    if (override.state) state = override.state.toUpperCase();
    if (override.county) county = override.county.trim();
    if (override.city) city = override.city.trim();
    source = 'user_override';
  }

  // Determine level and confidence
  const jurisdictionLevel = determineLevel(state, county, city, postalCode);
  const resolutionConfidence = scoreConfidence(state, county, city, postalCode);
  const normalizedJurisdictionKey = buildNormalizedKey(state, county, city, postalCode);

  // Handle truly unknown case
  if (!state && !postalCode) {
    return {
      state: null,
      county: null,
      city: null,
      postalCode: null,
      normalizedJurisdictionKey: null,
      jurisdictionLevel: RenovationJurisdictionLevel.UNKNOWN,
      resolutionConfidence: AdvisorConfidenceLevel.UNAVAILABLE,
      source: 'unknown',
    };
  }

  return {
    state,
    county,
    city,
    postalCode,
    normalizedJurisdictionKey,
    jurisdictionLevel,
    resolutionConfidence,
    source,
  };
}

function determineLevel(
  state: string | null,
  county: string | null,
  city: string | null,
  postalCode: string | null,
): RenovationJurisdictionLevel {
  if (city) return RenovationJurisdictionLevel.CITY;
  if (postalCode) return RenovationJurisdictionLevel.ZIP;
  if (county) return RenovationJurisdictionLevel.COUNTY;
  if (state) return RenovationJurisdictionLevel.STATE;
  return RenovationJurisdictionLevel.UNKNOWN;
}

function scoreConfidence(
  state: string | null,
  county: string | null,
  city: string | null,
  postalCode: string | null,
): AdvisorConfidenceLevel {
  if (city && state) return AdvisorConfidenceLevel.HIGH;
  if ((postalCode || county) && state) return AdvisorConfidenceLevel.MEDIUM;
  if (state) return AdvisorConfidenceLevel.LOW;
  return AdvisorConfidenceLevel.UNAVAILABLE;
}

function buildNormalizedKey(
  state: string | null,
  county: string | null,
  city: string | null,
  postalCode: string | null,
): string | null {
  if (!state) return null;
  const parts = ['US', state.toLowerCase()];
  if (county) parts.push(county.toLowerCase().replace(/\s+/g, '-'));
  if (city) parts.push(city.toLowerCase().replace(/\s+/g, '-'));
  if (postalCode) parts.push(postalCode);
  return parts.join('-');
}
