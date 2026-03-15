// apps/backend/src/neighborhoodIntelligence/impactRules.ts
//
// Centralized deterministic impact rule map for the Neighborhood Intelligence Engine.
// Each NeighborhoodEventType entry defines:
//   - baseScore        : 0–100 severity baseline (before distance decay)
//   - defaultRadiusMiles : matching radius
//   - impacts          : list of structured impact outputs
//   - demographics     : relevant demographic shift signals (empty if not applicable)
//
// Language must be hedged, homeowner-friendly, and never make hard value guarantees.

import { NeighborhoodEventType } from '@prisma/client';
import { EventTypeRule } from './types';

export const NEIGHBORHOOD_IMPACT_RULES: Record<NeighborhoodEventType, EventTypeRule> = {
  TRANSIT_PROJECT: {
    baseScore: 82,
    defaultRadiusMiles: 2.0,
    impacts: [
      {
        category: 'PROPERTY_VALUE',
        direction: 'POSITIVE',
        description:
          'Transit infrastructure often correlates with increased long-term property demand in surrounding neighborhoods.',
        confidence: 0.78,
      },
      {
        category: 'RENTAL_DEMAND',
        direction: 'POSITIVE',
        description:
          'Improved transit access may increase rental demand, particularly among commuters and transit-dependent residents.',
        confidence: 0.80,
      },
      {
        category: 'AMENITIES',
        direction: 'POSITIVE',
        description:
          'New transit options may improve neighborhood connectivity and access to employment centers.',
        confidence: 0.85,
      },
      {
        category: 'NOISE',
        direction: 'NEGATIVE',
        description:
          'Construction activity associated with transit projects may temporarily increase noise levels.',
        confidence: 0.72,
      },
      {
        category: 'TRAFFIC',
        direction: 'NEGATIVE',
        description:
          'Construction phases may cause temporary traffic disruption near transit corridors.',
        confidence: 0.68,
      },
    ],
    demographics: [
      {
        segment: 'YOUNG_PROFESSIONALS',
        description:
          'Transit improvements may attract young professionals who prioritize commute access.',
        confidence: 0.75,
      },
      {
        segment: 'RENTERS',
        description:
          'Improved transit access often increases the neighborhood\'s appeal to renters.',
        confidence: 0.72,
      },
    ],
  },

  HIGHWAY_PROJECT: {
    baseScore: 58,
    defaultRadiusMiles: 2.0,
    impacts: [
      {
        category: 'TRAFFIC',
        direction: 'NEGATIVE',
        description:
          'Highway construction and expanded road capacity may increase vehicle traffic volumes near the property.',
        confidence: 0.80,
      },
      {
        category: 'NOISE',
        direction: 'NEGATIVE',
        description:
          'Highway infrastructure may increase persistent noise levels for nearby properties.',
        confidence: 0.78,
      },
      {
        category: 'LIVING_EXPERIENCE',
        direction: 'NEGATIVE',
        description:
          'Proximity to new highway infrastructure may affect outdoor quality of life and pedestrian experience.',
        confidence: 0.70,
      },
      {
        category: 'AMENITIES',
        direction: 'POSITIVE',
        description:
          'Improved regional road access may increase convenience for residents who rely on driving.',
        confidence: 0.55,
      },
    ],
    demographics: [],
  },

  COMMERCIAL_DEVELOPMENT: {
    baseScore: 65,
    defaultRadiusMiles: 1.5,
    impacts: [
      {
        category: 'AMENITIES',
        direction: 'POSITIVE',
        description:
          'New commercial development may expand local retail, dining, and services near the property.',
        confidence: 0.78,
      },
      {
        category: 'PROPERTY_VALUE',
        direction: 'POSITIVE',
        description:
          'Commercial activity often signals neighborhood growth, which may support long-term property demand.',
        confidence: 0.62,
      },
      {
        category: 'TRAFFIC',
        direction: 'NEGATIVE',
        description:
          'Commercial developments typically generate increased vehicle traffic and parking pressure.',
        confidence: 0.80,
      },
      {
        category: 'NOISE',
        direction: 'NEGATIVE',
        description:
          'Construction and commercial operations may temporarily or persistently elevate noise levels.',
        confidence: 0.65,
      },
    ],
    demographics: [
      {
        segment: 'YOUNG_PROFESSIONALS',
        description:
          'Vibrant commercial activity may increase neighborhood appeal for young professionals.',
        confidence: 0.58,
      },
    ],
  },

  RESIDENTIAL_DEVELOPMENT: {
    baseScore: 60,
    defaultRadiusMiles: 1.5,
    impacts: [
      {
        category: 'DEVELOPMENT_PRESSURE',
        direction: 'NEGATIVE',
        description:
          'Significant residential development nearby may signal increasing density and neighborhood change.',
        confidence: 0.72,
      },
      {
        category: 'TRAFFIC',
        direction: 'NEGATIVE',
        description:
          'New residential units increase the local population, which may contribute to additional traffic.',
        confidence: 0.70,
      },
      {
        category: 'PROPERTY_VALUE',
        direction: 'POSITIVE',
        description:
          'Active residential development can signal growing demand for the area, which may support property values.',
        confidence: 0.60,
      },
      {
        category: 'RENTAL_DEMAND',
        direction: 'POSITIVE',
        description:
          'Area growth from new residential development may support general rental demand.',
        confidence: 0.58,
      },
    ],
    demographics: [
      {
        segment: 'RENTERS',
        description:
          'Large multifamily residential projects often attract renters looking for newer housing options.',
        confidence: 0.65,
      },
      {
        segment: 'YOUNG_PROFESSIONALS',
        description:
          'New residential development can attract young professionals entering the housing market.',
        confidence: 0.55,
      },
    ],
  },

  INDUSTRIAL_PROJECT: {
    baseScore: 70,
    defaultRadiusMiles: 2.0,
    impacts: [
      {
        category: 'NOISE',
        direction: 'NEGATIVE',
        description:
          'Industrial facilities may generate persistent noise from operations and heavy equipment.',
        confidence: 0.82,
      },
      {
        category: 'TRAFFIC',
        direction: 'NEGATIVE',
        description:
          'Industrial operations typically generate heavy truck and commercial vehicle traffic.',
        confidence: 0.82,
      },
      {
        category: 'LIVING_EXPERIENCE',
        direction: 'NEGATIVE',
        description:
          'Nearby industrial activity may negatively affect the quality of life and neighborhood character.',
        confidence: 0.76,
      },
      {
        category: 'PROPERTY_VALUE',
        direction: 'NEGATIVE',
        description:
          'Industrial projects near residential areas may reduce property desirability over time.',
        confidence: 0.68,
      },
    ],
    demographics: [],
  },

  WAREHOUSE_PROJECT: {
    baseScore: 68,
    defaultRadiusMiles: 2.0,
    impacts: [
      {
        category: 'TRAFFIC',
        direction: 'NEGATIVE',
        description:
          'Warehouse and logistics facilities generate significant truck traffic, which may affect nearby roads.',
        confidence: 0.85,
      },
      {
        category: 'NOISE',
        direction: 'NEGATIVE',
        description:
          'Warehouse operations, loading docks, and deliveries can create persistent noise, particularly in early morning hours.',
        confidence: 0.80,
      },
      {
        category: 'LIVING_EXPERIENCE',
        direction: 'NEGATIVE',
        description:
          'Warehouse facilities near residential areas may negatively affect neighborhood livability and character.',
        confidence: 0.74,
      },
      {
        category: 'PROPERTY_VALUE',
        direction: 'NEGATIVE',
        description:
          'Proximity to warehouse or logistics operations may reduce residential property desirability.',
        confidence: 0.66,
      },
    ],
    demographics: [],
  },

  ZONING_CHANGE: {
    baseScore: 72,
    defaultRadiusMiles: 2.0,
    impacts: [
      {
        category: 'DEVELOPMENT_PRESSURE',
        direction: 'NEGATIVE',
        description:
          'Zoning changes may enable denser development in the area, increasing construction activity and neighborhood transformation.',
        confidence: 0.75,
      },
      {
        category: 'PROPERTY_VALUE',
        direction: 'POSITIVE',
        description:
          'Rezoning to higher-density or mixed-use may increase property value potential, particularly for parcels that become redevelopable.',
        confidence: 0.58,
      },
      {
        category: 'LIVING_EXPERIENCE',
        direction: 'NEGATIVE',
        description:
          'Neighborhood character may shift if zoning allows significantly different uses than what currently exists.',
        confidence: 0.65,
      },
      {
        category: 'RENTAL_DEMAND',
        direction: 'POSITIVE',
        description:
          'Upzoning can increase rental demand as more residents are permitted in the area.',
        confidence: 0.55,
      },
    ],
    demographics: [
      {
        segment: 'RENTERS',
        description:
          'Zoning changes enabling higher density often correlate with increased renter populations.',
        confidence: 0.60,
      },
    ],
  },

  SCHOOL_RATING_CHANGE: {
    baseScore: 75,
    defaultRadiusMiles: 3.0,
    impacts: [
      {
        category: 'PROPERTY_VALUE',
        direction: 'POSITIVE',
        description:
          'School quality improvements often correlate with stronger property demand from families, which may support home values.',
        confidence: 0.80,
      },
      {
        category: 'RENTAL_DEMAND',
        direction: 'POSITIVE',
        description:
          'Higher-rated schools may attract more families to rent in the area, increasing rental demand.',
        confidence: 0.72,
      },
      {
        category: 'LIVING_EXPERIENCE',
        direction: 'POSITIVE',
        description:
          'Improved school quality may positively affect the neighborhood\'s appeal for families.',
        confidence: 0.78,
      },
    ],
    demographics: [
      {
        segment: 'FAMILIES_WITH_CHILDREN',
        description:
          'School rating improvements typically increase neighborhood appeal for families with school-age children.',
        confidence: 0.82,
      },
      {
        segment: 'AFFLUENT_BUYERS',
        description:
          'High-performing schools are often a priority for buyers with greater purchasing power.',
        confidence: 0.68,
      },
    ],
  },

  SCHOOL_BOUNDARY_CHANGE: {
    baseScore: 62,
    defaultRadiusMiles: 3.0,
    impacts: [
      {
        category: 'PROPERTY_VALUE',
        direction: 'NEUTRAL',
        description:
          'School boundary changes may shift which school district a property belongs to, potentially affecting demand depending on the districts involved.',
        confidence: 0.60,
      },
      {
        category: 'RENTAL_DEMAND',
        direction: 'NEUTRAL',
        description:
          'A boundary change may shift family demand in or out of the area depending on the relative quality of assigned schools.',
        confidence: 0.55,
      },
      {
        category: 'LIVING_EXPERIENCE',
        direction: 'NEUTRAL',
        description:
          'School boundary adjustments can affect which school children in the neighborhood attend, which may matter to families evaluating the area.',
        confidence: 0.58,
      },
    ],
    demographics: [
      {
        segment: 'FAMILIES_WITH_CHILDREN',
        description:
          'School boundary changes are most relevant for families with school-age children evaluating the neighborhood.',
        confidence: 0.70,
      },
    ],
  },

  FLOOD_MAP_UPDATE: {
    baseScore: 78,
    defaultRadiusMiles: 2.5,
    impacts: [
      {
        category: 'INSURANCE_RISK',
        direction: 'NEGATIVE',
        description:
          'Flood map updates that expand flood zones may require flood insurance, increasing homeownership costs.',
        confidence: 0.85,
      },
      {
        category: 'PROPERTY_VALUE',
        direction: 'NEGATIVE',
        description:
          'Properties newly placed in flood zones may experience reduced buyer demand and resale friction.',
        confidence: 0.75,
      },
      {
        category: 'LIVING_EXPERIENCE',
        direction: 'NEGATIVE',
        description:
          'Flood zone designation changes may affect long-term peace of mind and financing terms for the property.',
        confidence: 0.70,
      },
    ],
    demographics: [],
  },

  UTILITY_INFRASTRUCTURE: {
    baseScore: 48,
    defaultRadiusMiles: 1.5,
    impacts: [
      {
        category: 'NOISE',
        direction: 'NEGATIVE',
        description:
          'Utility infrastructure work may cause temporary construction noise and disruption.',
        confidence: 0.65,
      },
      {
        category: 'AMENITIES',
        direction: 'POSITIVE',
        description:
          'Utility upgrades can improve service reliability and may support future development in the area.',
        confidence: 0.55,
      },
    ],
    demographics: [],
  },

  PARK_DEVELOPMENT: {
    baseScore: 65,
    defaultRadiusMiles: 1.5,
    impacts: [
      {
        category: 'AMENITIES',
        direction: 'POSITIVE',
        description:
          'New parks and green space often improve quality of life and neighborhood desirability.',
        confidence: 0.82,
      },
      {
        category: 'LIVING_EXPERIENCE',
        direction: 'POSITIVE',
        description:
          'Park development may enhance the outdoor experience and overall character of the neighborhood.',
        confidence: 0.80,
      },
      {
        category: 'PROPERTY_VALUE',
        direction: 'POSITIVE',
        description:
          'Proximity to parks and green space has historically been associated with stronger property demand.',
        confidence: 0.72,
      },
      {
        category: 'NOISE',
        direction: 'NEGATIVE',
        description:
          'Construction during park development may temporarily increase noise and disruption.',
        confidence: 0.55,
      },
    ],
    demographics: [
      {
        segment: 'FAMILIES_WITH_CHILDREN',
        description:
          'Park development may increase neighborhood appeal for families looking for outdoor recreation options.',
        confidence: 0.75,
      },
      {
        segment: 'RETIREES',
        description:
          'Green space and park access can improve livability for retirees seeking walkable, calming environments.',
        confidence: 0.62,
      },
    ],
  },

  LARGE_CONSTRUCTION: {
    baseScore: 55,
    defaultRadiusMiles: 1.5,
    impacts: [
      {
        category: 'NOISE',
        direction: 'NEGATIVE',
        description:
          'Large construction projects typically generate significant noise during active building phases.',
        confidence: 0.85,
      },
      {
        category: 'TRAFFIC',
        direction: 'NEGATIVE',
        description:
          'Construction vehicles and worker commutes may increase local traffic during the project period.',
        confidence: 0.75,
      },
      {
        category: 'LIVING_EXPERIENCE',
        direction: 'NEGATIVE',
        description:
          'Ongoing large-scale construction may temporarily reduce quality of life near the site.',
        confidence: 0.72,
      },
    ],
    demographics: [],
  },
};
