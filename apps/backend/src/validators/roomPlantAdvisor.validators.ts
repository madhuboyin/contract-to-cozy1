import {
  GardenIrrigationType,
  GardenSoilDrainage,
  GardenSunExposure,
  PlantLocationType,
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

export const createHomePlantBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  nickname: z.string().trim().max(120).optional().nullable(),
  locationType: z.nativeEnum(PlantLocationType),
  roomId: z.string().uuid().optional().nullable(),
  gardenZoneId: z.string().uuid().optional().nullable(),
  acquiredAt: z.coerce.date().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.locationType === 'INDOOR' && !value.roomId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['roomId'], message: 'Indoor plants require a room.' });
  if (value.locationType === 'OUTDOOR' && !value.gardenZoneId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gardenZoneId'], message: 'Outdoor plants require a garden zone.' });
});

export const updateHomePlantCareBodySchema = z.object({
  lastWateredAt: z.coerce.date().optional().nullable(),
  lastInspectedAt: z.coerce.date().optional().nullable(),
  nickname: z.string().trim().max(120).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const gardenZoneBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  sunExposure: z.nativeEnum(GardenSunExposure).optional(),
  soilDrainage: z.nativeEnum(GardenSoilDrainage).optional(),
  irrigationType: z.nativeEnum(GardenIrrigationType).optional(),
  frostPocket: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateGardenZoneBodySchema = gardenZoneBodySchema.partial();
