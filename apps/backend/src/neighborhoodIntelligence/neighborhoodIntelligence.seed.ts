// apps/backend/src/neighborhoodIntelligence/neighborhoodIntelligence.seed.ts
//
// Dev-only helper to seed sample neighborhood events for local QA.
// Run via:  npx ts-node src/neighborhoodIntelligence/neighborhoodIntelligence.seed.ts
//           or call seedNeighborhoodEvents() from your dev seed script.

import { NeighborhoodIntelligenceService } from './neighborhoodIntelligenceService';
import { NormalizedNeighborhoodEventInput } from './types';
import { logger } from '../lib/logger';

const SAMPLE_EVENTS: NormalizedNeighborhoodEventInput[] = [
  {
    externalSourceId: 'dev-transit-001',
    eventType: 'TRANSIT_PROJECT',
    title: 'Metro Blue Line Extension — Phase 2',
    description:
      'A planned extension of the Metro Blue Line adding 3 new stations through the district, with an expected completion in late 2027.',
    latitude: 33.749,
    longitude: -84.388,
    city: 'Atlanta',
    state: 'GA',
    country: 'US',
    sourceName: 'MARTA Capital Projects',
    sourceUrl: 'https://www.itsmarta.com',
    announcedDate: new Date('2024-06-01'),
    expectedStartDate: new Date('2025-03-01'),
    expectedEndDate: new Date('2027-12-01'),
  },
  {
    externalSourceId: 'dev-commercial-001',
    eventType: 'COMMERCIAL_DEVELOPMENT',
    title: 'Midtown Mall Redevelopment Project',
    description:
      'A 1.2M sq ft mixed-use development replacing an aging mall with retail, office, and hotel space.',
    latitude: 33.782,
    longitude: -84.383,
    city: 'Atlanta',
    state: 'GA',
    country: 'US',
    sourceName: 'Atlanta City Planning',
    announcedDate: new Date('2024-04-15'),
    expectedStartDate: new Date('2025-01-01'),
    expectedEndDate: new Date('2028-06-01'),
  },
  {
    externalSourceId: 'dev-warehouse-001',
    eventType: 'WAREHOUSE_PROJECT',
    title: 'Amazon Logistics Distribution Center',
    description:
      'A 500,000 sq ft distribution warehouse approved for construction on the south side of the city.',
    latitude: 33.710,
    longitude: -84.410,
    city: 'Atlanta',
    state: 'GA',
    country: 'US',
    sourceName: 'Fulton County Development Review',
    announcedDate: new Date('2024-08-01'),
    expectedStartDate: new Date('2025-06-01'),
    expectedEndDate: new Date('2026-09-01'),
  },
  {
    externalSourceId: 'dev-school-001',
    eventType: 'SCHOOL_RATING_CHANGE',
    title: 'Riverside Elementary School Rating Improved to A',
    description:
      'Riverside Elementary received an A rating from the state department of education, up from B+ in the prior cycle.',
    latitude: 33.760,
    longitude: -84.370,
    city: 'Atlanta',
    state: 'GA',
    country: 'US',
    sourceName: 'Georgia Department of Education',
    announcedDate: new Date('2024-09-01'),
  },
  {
    externalSourceId: 'dev-flood-001',
    eventType: 'FLOOD_MAP_UPDATE',
    title: 'FEMA Flood Zone Remap — Peachtree Creek Corridor',
    description:
      'FEMA has released a revised flood insurance rate map expanding the 100-year floodplain along Peachtree Creek, potentially affecting hundreds of properties.',
    latitude: 33.795,
    longitude: -84.365,
    city: 'Atlanta',
    state: 'GA',
    country: 'US',
    sourceName: 'FEMA National Flood Insurance Program',
    sourceUrl: 'https://www.fema.gov/flood-maps',
    announcedDate: new Date('2024-05-01'),
  },
];

export async function seedNeighborhoodEvents(): Promise<void> {
  const service = new NeighborhoodIntelligenceService();

  logger.info('[NeighborhoodIntelligence] Seeding sample events...');

  for (const event of SAMPLE_EVENTS) {
    try {
      const result = await service.ingestAndProcessEvent(event);
      logger.info(
        `[NeighborhoodIntelligence] Seeded: ${event.title} — eventId=${result.eventId} created=${result.created} matched=${result.matchedProperties}`,
      );
    } catch (err: any) {
      logger.error(`[NeighborhoodIntelligence] Failed to seed: ${event.title} — ${err.message}`);
    }
  }

  logger.info('[NeighborhoodIntelligence] Seed complete.');
}

// Allow running directly
if (require.main === module) {
  seedNeighborhoodEvents()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error(err);
      process.exit(1);
    });
}
