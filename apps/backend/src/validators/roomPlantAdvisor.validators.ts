import {
  PlantGoalType,
  PlantLightLevel,
  PlantMaintenanceLevel,
  RoomType,
} from '@prisma/client';
import { z } from 'zod';

export const plantAdvisorPropertyParamsSchema = z.object({
  propertyId: z.string().uuid(),
});

export const plantAdvisorRoomParamsSchema = z.object({
  propertyId: z.string().uuid(),
  roomId: z.string().uuid(),
});

export const plantAdvisorRecommendationParamsSchema = z.object({
  propertyId: z.string().uuid(),
  roomId: z.string().uuid(),
  recommendationId: z.string().uuid(),
});

export const listPlantCatalogQuerySchema = z.object({
  roomType: z.nativeEnum(RoomType).optional(),
  lightLevel: z.nativeEnum(PlantLightLevel).optional(),
  maintenanceLevel: z.nativeEnum(PlantMaintenanceLevel).optional(),
  petSafeOnly: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .optional(),
  goal: z.nativeEnum(PlantGoalType).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const upsertRoomPlantProfileBodySchema = z.object({
  detectedRoomType: z.nativeEnum(RoomType).optional().nullable(),
  lightLevel: z.nativeEnum(PlantLightLevel).optional().nullable(),
  maintenancePreference: z.nativeEnum(PlantMaintenanceLevel).optional().nullable(),
  hasPets: z.boolean().optional(),
  goals: z.array(z.nativeEnum(PlantGoalType)).max(10).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export const generateRoomPlantRecommendationsBodySchema = z.object({
  limit: z.number().int().min(1).max(24).optional(),
  profile: upsertRoomPlantProfileBodySchema.optional(),
});

export const addRoomPlantRecommendationToHomeBodySchema = z.object({
  note: z.string().max(500).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
});
