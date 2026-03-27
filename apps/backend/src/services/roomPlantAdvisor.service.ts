import {
  HomeEventImportance,
  HomeEventType,
  HomeEventVisibility,
  PlantCatalog,
  PlantGoalType,
  PlantLightLevel,
  PlantMaintenanceLevel,
  PlantRecommendationStatus,
  PlantToxicityLevel,
  RoomType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  PlantAdvisorRoomSummaryDTO,
  PlantCatalogSummaryDTO,
  RecommendationReasonDTO,
  RoomPlantProfileDTO,
  RoomPlantRecommendationDTO,
} from '../types/roomPlantAdvisor.types';

type CatalogQuery = {
  roomType?: RoomType;
  lightLevel?: PlantLightLevel;
  maintenanceLevel?: PlantMaintenanceLevel;
  petSafeOnly?: boolean;
  goal?: PlantGoalType;
  limit?: number;
};

type RoomProfilePatch = {
  detectedRoomType?: RoomType | null;
  lightLevel?: PlantLightLevel | null;
  maintenancePreference?: PlantMaintenanceLevel | null;
  hasPets?: boolean;
  goals?: PlantGoalType[];
  notes?: string | null;
};

type GenerateInput = {
  limit?: number;
  profile?: RoomProfilePatch;
};

type AddToHomeInput = {
  note?: string | null;
  occurredAt?: string;
};

const LIGHT_SCORE: Record<PlantLightLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  BRIGHT_INDIRECT: 2,
  BRIGHT_DIRECT: 3,
};

const MAINTENANCE_SCORE: Record<PlantMaintenanceLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits: number) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function formatRoomType(roomType: RoomType | null) {
  if (!roomType) return 'room';
  return roomType
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function formatLight(light: PlantLightLevel) {
  switch (light) {
    case 'LOW':
      return 'low';
    case 'MEDIUM':
      return 'medium';
    case 'BRIGHT_INDIRECT':
      return 'bright indirect';
    case 'BRIGHT_DIRECT':
      return 'bright direct';
    default:
      return 'moderate';
  }
}

function formatMaintenance(level: PlantMaintenanceLevel) {
  switch (level) {
    case 'LOW':
      return 'low';
    case 'MEDIUM':
      return 'medium';
    case 'HIGH':
      return 'higher';
    default:
      return 'medium';
  }
}

function goalSignal(goal: PlantGoalType) {
  switch (goal) {
    case 'AIR_QUALITY':
      return 'Supports indoor air-quality goals.';
    case 'FRAGRANCE':
      return 'Adds natural fragrance to the room.';
    case 'DECOR':
      return 'Strong decorative fit for styled spaces.';
    case 'PET_SAFE':
      return 'Safer option for homes with pets.';
    case 'LOW_MAINTENANCE':
      return 'Matches a lower-maintenance routine.';
    default:
      return 'Matches one of your selected goals.';
  }
}

function buildShortDescription(plant: {
  commonName: string;
  scientificName: string | null;
  lightLevel: PlantLightLevel;
  maintenanceLevel: PlantMaintenanceLevel;
}) {
  const base = `${plant.commonName}${plant.scientificName ? ` (${plant.scientificName})` : ''}`;
  return `${base} thrives in ${formatLight(plant.lightLevel)} light with ${formatMaintenance(plant.maintenanceLevel)} upkeep.`;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => Boolean(v))
      .map(([k]) => String(k).trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function goalMatchesPlant(goal: PlantGoalType, plant: PlantCatalog): boolean {
  switch (goal) {
    case 'AIR_QUALITY':
      return plant.supportsAirQuality;
    case 'FRAGRANCE':
      return plant.hasFragrance;
    case 'DECOR':
      return plant.decorStyleTags.length > 0;
    case 'PET_SAFE':
      return plant.isPetSafe || plant.toxicityLevel === 'PET_SAFE';
    case 'LOW_MAINTENANCE':
      return plant.maintenanceLevel === 'LOW';
    default:
      return false;
  }
}

function roomGoalBoost(roomType: RoomType | null, goal: PlantGoalType, matched: boolean): number {
  if (!roomType || !matched) return 0;

  if (roomType === 'BATHROOM' && goal === 'AIR_QUALITY') return 4;
  if (roomType === 'BATHROOM' && goal === 'DECOR') return 2;

  if (roomType === 'KITCHEN' && goal === 'FRAGRANCE') return 5;
  if (roomType === 'KITCHEN' && goal === 'AIR_QUALITY') return 3;

  if (roomType === 'BEDROOM' && goal === 'FRAGRANCE') return 3;
  if (roomType === 'BEDROOM' && goal === 'AIR_QUALITY') return 4;

  if (roomType === 'OFFICE' && goal === 'AIR_QUALITY') return 6;
  if (roomType === 'OFFICE' && goal === 'DECOR') return 5;

  if (roomType === 'LIVING_ROOM' && goal === 'DECOR') return 4;

  return 0;
}

type ScoreResult = {
  score: number;
  confidence: number;
  fitSignals: string[];
  warningFlags: string[];
  reasonSummary: string;
};

function scorePlantCandidate(args: {
  plant: PlantCatalog;
  profile: {
    detectedRoomType: RoomType | null;
    lightLevel: PlantLightLevel | null;
    maintenancePreference: PlantMaintenanceLevel | null;
    hasPets: boolean;
    goals: PlantGoalType[];
  };
  roomType: RoomType | null;
}): ScoreResult {
  const { plant, profile } = args;
  const effectiveRoomType = profile.detectedRoomType ?? args.roomType ?? null;

  let score = round(clamp(plant.baseConfidence, 0, 1) * 40, 1);
  const fitSignals: string[] = [];
  const warningFlags: string[] = [];

  if (effectiveRoomType) {
    if (plant.suitableRoomTypes.includes(effectiveRoomType)) {
      score += 20;
      fitSignals.push(`Suitable for ${formatRoomType(effectiveRoomType).toLowerCase()} placement.`);
      if (
        effectiveRoomType === 'BATHROOM' ||
        effectiveRoomType === 'KITCHEN' ||
        effectiveRoomType === 'BEDROOM' ||
        effectiveRoomType === 'OFFICE'
      ) {
        score += 8;
        fitSignals.push(`Specifically tuned for ${formatRoomType(effectiveRoomType).toLowerCase()} conditions.`);
      }
    } else if (plant.suitableRoomTypes.length > 0) {
      score -= 12;
      warningFlags.push(`Lower room fit for ${formatRoomType(effectiveRoomType).toLowerCase()}.`);
    }
  } else {
    warningFlags.push('Room type not set; recommendations are more general.');
  }

  if (profile.lightLevel) {
    const diff = Math.abs(LIGHT_SCORE[plant.lightLevel] - LIGHT_SCORE[profile.lightLevel]);
    if (diff === 0) {
      score += 20;
      fitSignals.push('Light requirement aligns with this room.');
    } else if (diff === 1) {
      score += 8;
      fitSignals.push('Light level is close to ideal.');
    } else if (diff === 2) {
      score -= 12;
      warningFlags.push('Light mismatch may reduce plant performance.');
    } else {
      score -= 22;
      warningFlags.push('Strong light mismatch for this room.');
    }
  } else {
    warningFlags.push('Set room light level for tighter ranking.');
  }

  if (profile.maintenancePreference) {
    const diff = Math.abs(
      MAINTENANCE_SCORE[plant.maintenanceLevel] - MAINTENANCE_SCORE[profile.maintenancePreference]
    );
    if (diff === 0) {
      score += 12;
      fitSignals.push('Maintenance preference matches this plant.');
    } else if (diff === 1) {
      score += 2;
    } else {
      score -= 10;
      warningFlags.push('Maintenance demand may exceed your preference.');
    }
  }

  if (profile.hasPets) {
    if (plant.isPetSafe || plant.toxicityLevel === 'PET_SAFE') {
      score += 16;
      fitSignals.push('Pet-safety profile is favorable.');
    } else if (plant.toxicityLevel === 'MILDLY_TOXIC') {
      score -= 18;
      warningFlags.push('Mild toxicity warning for pets.');
    } else if (plant.toxicityLevel === 'TOXIC') {
      score -= 32;
      warningFlags.push('Toxic to pets: handle placement carefully.');
    } else {
      score -= 8;
      warningFlags.push('Pet-safety unknown; verify before bringing home.');
    }
  }

  if (profile.goals.length === 0) {
    warningFlags.push('No plant goals selected; goal-based boosts were skipped.');
  } else {
    for (const goal of profile.goals) {
      const matched = goalMatchesPlant(goal, plant);
      if (matched) {
        score += 7;
        fitSignals.push(goalSignal(goal));
      } else {
        score -= 2;
      }
      score += roomGoalBoost(effectiveRoomType, goal, matched);
    }
  }

  if (effectiveRoomType === 'BATHROOM') {
    if (plant.humidityPreference === 'HIGH') {
      score += 8;
      fitSignals.push('Humidity preference fits bathroom conditions.');
    } else if (plant.humidityPreference === 'LOW') {
      score -= 4;
      warningFlags.push('Lower-humidity plant for a typically humid room.');
    }
  }

  if (effectiveRoomType === 'OFFICE' && plant.humidityPreference === 'LOW') {
    score += 3;
    fitSignals.push('Works well in drier office air.');
  }

  score = round(clamp(score, 0, 100), 1);

  const completeness =
    ((effectiveRoomType ? 1 : 0) +
      (profile.lightLevel ? 1 : 0) +
      (profile.maintenancePreference ? 1 : 0) +
      (profile.goals.length > 0 ? 1 : 0) +
      1) /
    5;

  const confidence = round(
    clamp(plant.baseConfidence * 0.45 + completeness * 0.25 + (score / 100) * 0.3, 0.05, 0.99),
    2
  );

  const reasonSummary = fitSignals[0]
    ? warningFlags[0]
      ? `${fitSignals[0]} Caution: ${warningFlags[0]}`
      : fitSignals[0]
    : warningFlags[0]
      ? `Potential fit with caveat: ${warningFlags[0]}`
      : 'Balanced room fit based on available inputs.';

  return { score, confidence, fitSignals, warningFlags, reasonSummary };
}

export class RoomPlantAdvisorService {
  private async assertRoomBelongs(propertyId: string, roomId: string) {
    const room = await prisma.inventoryRoom.findFirst({
      where: { id: roomId, propertyId },
      select: { id: true, name: true, type: true, sortOrder: true },
    });

    if (!room) {
      throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    return room;
  }

  private mapProfileDTO(row: any): RoomPlantProfileDTO {
    return {
      id: row.id,
      propertyId: row.propertyId,
      roomId: row.roomId,
      detectedRoomType: row.detectedRoomType ?? null,
      lightLevel: row.lightLevel ?? null,
      maintenancePreference: row.maintenancePreference ?? null,
      hasPets: Boolean(row.hasPets),
      goals: Array.isArray(row.goals) ? row.goals : [],
      notes: row.notes ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapCatalogDTO(row: PlantCatalog): PlantCatalogSummaryDTO {
    return {
      id: row.id,
      commonName: row.commonName,
      scientificName: row.scientificName ?? null,
      shortDescription: buildShortDescription(row),
      lightLevel: row.lightLevel,
      maintenanceLevel: row.maintenanceLevel,
      humidityPreference: row.humidityPreference,
      toxicityLevel: row.toxicityLevel,
      isPetSafe: row.isPetSafe,
      suitableRoomTypes: row.suitableRoomTypes,
      supportsAirQuality: row.supportsAirQuality,
      hasFragrance: row.hasFragrance,
      decorStyleTags: row.decorStyleTags,
      placementTips: row.placementTips ?? null,
      careSummary: row.careSummary ?? null,
      wateringCadenceDays: row.wateringCadenceDays ?? null,
      baseConfidence: row.baseConfidence,
    };
  }

  private mapRecommendationDTO(row: any): RoomPlantRecommendationDTO {
    const fitSignals = parseStringArray(row.fitSignals);
    const warningFlags = parseStringArray(row.warningFlags);
    const reasonSummary = row.reasonSummary || fitSignals[0] || 'Balanced recommendation.';

    const reason: RecommendationReasonDTO = {
      summary: reasonSummary,
      fitSignals,
      warningFlags,
    };

    return {
      id: row.id,
      propertyId: row.propertyId,
      roomId: row.roomId,
      roomPlantProfileId: row.roomPlantProfileId,
      plantCatalogId: row.plantCatalogId,
      rank: row.rank,
      score: row.score,
      confidence: row.confidence,
      status: row.status,
      reasonSummary,
      reason,
      warningFlags,
      plantName: row.plantCatalog.commonName,
      scientificName: row.plantCatalog.scientificName ?? null,
      shortDescription: buildShortDescription(row.plantCatalog),
      careSummary: row.plantCatalog.careSummary ?? null,
      placementTip: row.plantCatalog.placementTips ?? null,
    };
  }

  private toRoomSummary(args: {
    room: { id: string; name: string; type: RoomType | null };
    latestProfile: any | null;
    recommendations: Array<{ status: PlantRecommendationStatus; createdAt: Date }>;
  }): PlantAdvisorRoomSummaryDTO {
    const total = args.recommendations.length;
    const recommended = args.recommendations.filter((r) => r.status === 'RECOMMENDED').length;
    const saved = args.recommendations.filter((r) => r.status === 'SAVED').length;
    const dismissed = args.recommendations.filter((r) => r.status === 'DISMISSED').length;
    const lastGeneratedAt = args.recommendations[0]?.createdAt ?? null;

    return {
      roomId: args.room.id,
      name: args.room.name,
      roomType: args.room.type ?? null,
      hasProfile: Boolean(args.latestProfile),
      lastProfileUpdatedAt: args.latestProfile?.updatedAt?.toISOString() ?? null,
      lastRecommendationGeneratedAt: lastGeneratedAt ? lastGeneratedAt.toISOString() : null,
      recommendationCounts: {
        total,
        recommended,
        saved,
        dismissed,
      },
    };
  }

  private async getLatestProfile(propertyId: string, roomId: string) {
    return prisma.roomPlantProfile.findFirst({
      where: { propertyId, roomId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async ensureProfile(propertyId: string, roomId: string, patch?: RoomProfilePatch) {
    const room = await this.assertRoomBelongs(propertyId, roomId);
    const existing = await this.getLatestProfile(propertyId, roomId);

    const data: Record<string, unknown> = {};
    if (patch && 'detectedRoomType' in patch) data.detectedRoomType = patch.detectedRoomType ?? null;
    if (patch && 'lightLevel' in patch) data.lightLevel = patch.lightLevel ?? null;
    if (patch && 'maintenancePreference' in patch) data.maintenancePreference = patch.maintenancePreference ?? null;
    if (patch && 'hasPets' in patch) data.hasPets = Boolean(patch.hasPets);
    if (patch && 'goals' in patch) data.goals = Array.isArray(patch.goals) ? patch.goals : [];
    if (patch && 'notes' in patch) data.notes = patch.notes ?? null;

    if (existing) {
      if (Object.keys(data).length === 0) return existing;
      return prisma.roomPlantProfile.update({
        where: { id: existing.id },
        data,
      });
    }

    return prisma.roomPlantProfile.create({
      data: {
        propertyId,
        roomId,
        detectedRoomType: room.type ?? null,
        lightLevel: null,
        maintenancePreference: null,
        hasPets: false,
        goals: [],
        notes: null,
        ...data,
      },
    });
  }

  async listEligibleRooms(propertyId: string) {
    const rooms = await prisma.inventoryRoom.findMany({
      where: { propertyId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        plantProfiles: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          include: {
            recommendations: {
              orderBy: [{ rank: 'asc' }],
              select: { status: true, createdAt: true },
            },
          },
        },
      },
    });

    const summaries = rooms.map((room) => {
      const latestProfile = room.plantProfiles[0] ?? null;
      return this.toRoomSummary({
        room: { id: room.id, name: room.name, type: room.type ?? null },
        latestProfile,
        recommendations: latestProfile?.recommendations ?? [],
      });
    });

    return { rooms: summaries };
  }

  async listCatalog(_propertyId: string, query: CatalogQuery) {
    const take = clamp(query.limit ?? 50, 1, 200);
    const where: Record<string, unknown> = {};

    if (query.lightLevel) where.lightLevel = query.lightLevel;
    if (query.maintenanceLevel) where.maintenanceLevel = query.maintenanceLevel;
    if (query.petSafeOnly) {
      where.OR = [{ isPetSafe: true }, { toxicityLevel: 'PET_SAFE' }];
    }
    if (query.roomType) {
      where.OR = [
        ...(Array.isArray(where.OR) ? (where.OR as any[]) : []),
        { suitableRoomTypes: { has: query.roomType } },
        { suitableRoomTypes: { isEmpty: true } },
      ];
    }
    if (query.goal === 'AIR_QUALITY') where.supportsAirQuality = true;
    if (query.goal === 'FRAGRANCE') where.hasFragrance = true;
    if (query.goal === 'PET_SAFE') {
      where.AND = [{ OR: [{ isPetSafe: true }, { toxicityLevel: 'PET_SAFE' }] }];
    }
    if (query.goal === 'LOW_MAINTENANCE') where.maintenanceLevel = 'LOW';
    if (query.goal === 'DECOR') where.decorStyleTags = { isEmpty: false };

    const plants = await prisma.plantCatalog.findMany({
      where,
      orderBy: [{ baseConfidence: 'desc' }, { commonName: 'asc' }],
      take,
    });

    return { plants: plants.map((p) => this.mapCatalogDTO(p)) };
  }

  async getRoomAdvisorState(propertyId: string, roomId: string) {
    const room = await this.assertRoomBelongs(propertyId, roomId);

    const latestProfile = await prisma.roomPlantProfile.findFirst({
      where: { propertyId, roomId },
      orderBy: { updatedAt: 'desc' },
      include: {
        recommendations: {
          orderBy: [{ rank: 'asc' }],
          include: {
            plantCatalog: true,
          },
        },
      },
    });

    const roomSummary = this.toRoomSummary({
      room: { id: room.id, name: room.name, type: room.type ?? null },
      latestProfile,
      recommendations: latestProfile?.recommendations ?? [],
    });

    return {
      room: roomSummary,
      profile: latestProfile ? this.mapProfileDTO(latestProfile) : null,
      recommendations: latestProfile
        ? latestProfile.recommendations.map((row) => this.mapRecommendationDTO(row))
        : [],
    };
  }

  async upsertRoomProfile(propertyId: string, roomId: string, input: RoomProfilePatch) {
    await this.assertRoomBelongs(propertyId, roomId);
    const profile = await this.ensureProfile(propertyId, roomId, input);
    return { profile: this.mapProfileDTO(profile) };
  }

  async generateRecommendations(propertyId: string, roomId: string, input: GenerateInput) {
    const room = await this.assertRoomBelongs(propertyId, roomId);
    const profile = await this.ensureProfile(propertyId, roomId, input.profile);
    const limit = clamp(input.limit ?? 8, 1, 24);

    const plants = await prisma.plantCatalog.findMany({
      orderBy: [{ baseConfidence: 'desc' }, { commonName: 'asc' }],
      take: 200,
    });

    const scored = plants
      .map((plant) => {
        const result = scorePlantCandidate({
          plant,
          roomType: room.type ?? null,
          profile: {
            detectedRoomType: profile.detectedRoomType ?? null,
            lightLevel: profile.lightLevel ?? null,
            maintenancePreference: profile.maintenancePreference ?? null,
            hasPets: profile.hasPets,
            goals: Array.isArray(profile.goals) ? profile.goals : [],
          },
        });

        return { plant, result };
      })
      .sort((a, b) => {
        if (b.result.score !== a.result.score) return b.result.score - a.result.score;
        if (b.result.confidence !== a.result.confidence) return b.result.confidence - a.result.confidence;
        return a.plant.commonName.localeCompare(b.plant.commonName);
      })
      .slice(0, limit);

    await prisma.$transaction(async (tx) => {
      await tx.roomPlantRecommendation.deleteMany({
        where: { propertyId, roomId, roomPlantProfileId: profile.id },
      });

      if (scored.length > 0) {
        await tx.roomPlantRecommendation.createMany({
          data: scored.map((entry, idx) => ({
            propertyId,
            roomId,
            roomPlantProfileId: profile.id,
            plantCatalogId: entry.plant.id,
            score: entry.result.score,
            confidence: entry.result.confidence,
            reasonSummary: entry.result.reasonSummary,
            fitSignals: entry.result.fitSignals,
            warningFlags: entry.result.warningFlags,
            status: 'RECOMMENDED',
            rank: idx + 1,
          })),
        });
      }
    });

    const recommendations = await prisma.roomPlantRecommendation.findMany({
      where: { propertyId, roomId, roomPlantProfileId: profile.id },
      orderBy: [{ rank: 'asc' }],
      include: {
        plantCatalog: true,
      },
    });

    return {
      profile: this.mapProfileDTO(profile),
      recommendations: recommendations.map((row) => this.mapRecommendationDTO(row)),
    };
  }

  private async getScopedRecommendation(propertyId: string, roomId: string, recommendationId: string) {
    const recommendation = await prisma.roomPlantRecommendation.findFirst({
      where: {
        id: recommendationId,
        propertyId,
        roomId,
      },
      include: {
        plantCatalog: true,
        room: { select: { id: true, name: true } },
      },
    });

    if (!recommendation) {
      throw new APIError('Recommendation not found', 404, 'RECOMMENDATION_NOT_FOUND');
    }

    return recommendation;
  }

  async saveRecommendation(propertyId: string, roomId: string, recommendationId: string) {
    await this.assertRoomBelongs(propertyId, roomId);
    await this.getScopedRecommendation(propertyId, roomId, recommendationId);

    const updated = await prisma.roomPlantRecommendation.update({
      where: { id: recommendationId },
      data: { status: 'SAVED' },
      include: { plantCatalog: true },
    });

    return { recommendation: this.mapRecommendationDTO(updated) };
  }

  async dismissRecommendation(propertyId: string, roomId: string, recommendationId: string) {
    await this.assertRoomBelongs(propertyId, roomId);
    await this.getScopedRecommendation(propertyId, roomId, recommendationId);

    const updated = await prisma.roomPlantRecommendation.update({
      where: { id: recommendationId },
      data: { status: 'DISMISSED' },
      include: { plantCatalog: true },
    });

    return { recommendation: this.mapRecommendationDTO(updated) };
  }

  async addRecommendationToHome(
    propertyId: string,
    roomId: string,
    recommendationId: string,
    userId: string | null,
    input: AddToHomeInput
  ) {
    const recommendation = await this.getScopedRecommendation(propertyId, roomId, recommendationId);

    const updated = await prisma.roomPlantRecommendation.update({
      where: { id: recommendationId },
      data: { status: 'SAVED' },
      include: { plantCatalog: true },
    });

    const idempotencyKey = `plant-advisor:add-to-home:${recommendationId}`;
    const existingEvent = await prisma.homeEvent.findFirst({
      where: { propertyId, idempotencyKey },
      select: { id: true },
    });

    let eventId = existingEvent?.id ?? null;
    if (!eventId) {
      const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
      const created = await prisma.homeEvent.create({
        data: {
          propertyId,
          createdById: userId ?? null,
          roomId,
          type: HomeEventType.NOTE,
          subtype: 'SMART_PLANT_ADVISOR',
          importance: HomeEventImportance.LOW,
          visibility: HomeEventVisibility.HOUSEHOLD,
          occurredAt,
          title: `Plant saved: ${recommendation.plantCatalog.commonName}`,
          summary:
            input.note ??
            `${recommendation.plantCatalog.commonName} saved for ${recommendation.room.name}. ${recommendation.reasonSummary || ''}`.trim(),
          meta: {
            source: 'SMART_PLANT_ADVISOR',
            recommendationId: recommendation.id,
            roomPlantProfileId: recommendation.roomPlantProfileId,
            plantCatalogId: recommendation.plantCatalogId,
            plantName: recommendation.plantCatalog.commonName,
            score: recommendation.score,
            confidence: recommendation.confidence,
            warningFlags: parseStringArray(recommendation.warningFlags),
          },
          idempotencyKey,
        },
        select: { id: true },
      });
      eventId = created.id;
    }

    return {
      recommendation: this.mapRecommendationDTO(updated),
      homeEventId: eventId,
    };
  }
}

