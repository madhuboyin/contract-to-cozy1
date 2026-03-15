// apps/backend/src/neighborhoodIntelligence/neighborhoodIntelligence.validators.ts

import { z } from 'zod';
import { NeighborhoodEventType } from '@prisma/client';

const neighborhoodEventTypeValues = Object.values(NeighborhoodEventType) as [string, ...string[]];

export const ingestEventBodySchema = z.object({
  externalSourceId: z.string().min(1).optional(),
  eventType: z.enum(neighborhoodEventTypeValues as [NeighborhoodEventType, ...NeighborhoodEventType[]]),
  title: z.string().min(5).max(500),
  description: z.string().max(2000).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().max(200).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  sourceName: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional().or(z.literal('')),
  announcedDate: z.coerce.date().optional(),
  expectedStartDate: z.coerce.date().optional(),
  expectedEndDate: z.coerce.date().optional(),
  rawCategory: z.string().max(200).optional(),
  projectSize: z.number().positive().optional(),
  distanceRadiusMiles: z.number().positive().max(50).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const eventListQuerySchema = z.object({
  sortBy: z.enum(['impact', 'date']).optional(),
  filterType: z
    .enum(neighborhoodEventTypeValues as [NeighborhoodEventType, ...NeighborhoodEventType[]])
    .optional(),
  filterEffect: z.enum(['POSITIVE', 'NEGATIVE', 'MIXED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type IngestEventBody = z.infer<typeof ingestEventBodySchema>;
export type EventListQuery = z.infer<typeof eventListQuerySchema>;
