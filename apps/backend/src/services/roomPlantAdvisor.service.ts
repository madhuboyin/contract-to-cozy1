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
  PlantRecommendationConfidenceBand,
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

const RELATED_ROOM_TYPES: Partial<Record<RoomType, RoomType[]>> = {
  BEDROOM: ['OFFICE', 'LIVING_ROOM'],
  OFFICE: ['BEDROOM', 'LIVING_ROOM'],
  LIVING_ROOM: ['OFFICE', 'BEDROOM', 'DINING'],
  DINING: ['LIVING_ROOM', 'KITCHEN'],
  KITCHEN: ['DINING', 'LAUNDRY'],
  BATHROOM: ['LAUNDRY'],
  LAUNDRY: ['BATHROOM', 'KITCHEN'],
  BASEMENT: ['GARAGE', 'OFFICE'],
  GARAGE: ['BASEMENT'],
  OTHER: ['LIVING_ROOM'],
};

type FutureScoringSignals = {
  climateZone?: string | null;
  windowDirection?: string | null;
  roomScanSignals?: Record<string, unknown> | null;
  maintenanceReminderReadiness?: number | null;
};

function pushUnique(target: string[], message: string) {
  if (!message) return;
  if (!target.includes(message)) target.push(message);
}

function confidenceBand(confidence: number): PlantRecommendationConfidenceBand {
  if (confidence >= 0.75) return 'HIGH';
  if (confidence >= 0.5) return 'MEDIUM';
  return 'LOW';
}

function applyClimateWeighting(_args: {
  plant: PlantCatalog;
  roomType: RoomType | null;
  futureSignals: FutureScoringSignals;
}): number {
  return 0;
}

function applyWindowDirectionWeighting(_args: {
  plant: PlantCatalog;
  profileLightLevel: PlantLightLevel | null;
  futureSignals: FutureScoringSignals;
}): number {
  return 0;
}

function applyRoomScanWeighting(_args: {
  plant: PlantCatalog;
  futureSignals: FutureScoringSignals;
}): number {
  return 0;
}

function applyMaintenanceReadinessWeighting(_args: {
  plant: PlantCatalog;
  futureSignals: FutureScoringSignals;
}): number {
  return 0;
}

function isNearRoomFit(plant: PlantCatalog, roomType: RoomType): boolean {
  const roomTypes = Array.isArray(plant.suitableRoomTypes) ? plant.suitableRoomTypes : [];
  if (roomTypes.length === 0) return false;
  const near = RELATED_ROOM_TYPES[roomType] ?? [];
  return near.some((candidate) => roomTypes.includes(candidate));
}

type ScoreResult = {
  score: number;
  confidence: number;
  confidenceBand: PlantRecommendationConfidenceBand;
  fitSignals: string[];
  warningFlags: string[];
  reasonSummary: string;
  majorWarningCount: number;
  softBlockerCount: number;
  fitCategory: 'STRONG' | 'NEAR_FIT' | 'WEAK';
};

type ScoredPlantCandidate = {
  plant: PlantCatalog;
  result: ScoreResult;
};

function normalizePlantNameKey(plant: PlantCatalog): string {
  const scientific = (plant.scientificName ?? '').trim().toLowerCase();
  const common = (plant.commonName ?? '').trim().toLowerCase();
  if (scientific) return `scientific:${scientific}`;
  return `common:${common}`;
}

function recommendationSort(a: ScoredPlantCandidate, b: ScoredPlantCandidate): number {
  const categoryRank: Record<ScoreResult['fitCategory'], number> = {
    STRONG: 3,
    NEAR_FIT: 2,
    WEAK: 1,
  };

  const byCategory = categoryRank[b.result.fitCategory] - categoryRank[a.result.fitCategory];
  if (byCategory !== 0) return byCategory;
  if (b.result.score !== a.result.score) return b.result.score - a.result.score;
  if (b.result.confidence !== a.result.confidence) return b.result.confidence - a.result.confidence;
  if (a.result.majorWarningCount !== b.result.majorWarningCount) {
    return a.result.majorWarningCount - b.result.majorWarningCount;
  }
  if (a.result.softBlockerCount !== b.result.softBlockerCount) {
    return a.result.softBlockerCount - b.result.softBlockerCount;
  }
  const byName = a.plant.commonName.localeCompare(b.plant.commonName);
  if (byName !== 0) return byName;
  return a.plant.id.localeCompare(b.plant.id);
}

function dedupeScoredCandidates(candidates: ScoredPlantCandidate[]): ScoredPlantCandidate[] {
  const byPlantId = new Map<string, ScoredPlantCandidate>();
  for (const candidate of candidates) {
    const existing = byPlantId.get(candidate.plant.id);
    if (!existing || recommendationSort(candidate, existing) < 0) {
      byPlantId.set(candidate.plant.id, candidate);
    }
  }

  const byName = new Map<string, ScoredPlantCandidate>();
  for (const candidate of byPlantId.values()) {
    const key = normalizePlantNameKey(candidate.plant);
    const existing = byName.get(key);
    if (!existing || recommendationSort(candidate, existing) < 0) {
      byName.set(key, candidate);
    }
  }

  return [...byName.values()];
}

export function rankPlantCandidates(candidates: ScoredPlantCandidate[], limit: number): ScoredPlantCandidate[] {
  return dedupeScoredCandidates(candidates).sort(recommendationSort).slice(0, clamp(limit, 1, 24));
}

function normalizeGoalsForCompare(value: unknown): PlantGoalType[] {
  const goals = Array.isArray(value) ? value.filter(Boolean) : [];
  return [...new Set(goals as PlantGoalType[])].sort((a, b) => a.localeCompare(b));
}

function didScoringInputsChange(existing: any, patchData: Record<string, unknown>): boolean {
  if ('detectedRoomType' in patchData && (existing.detectedRoomType ?? null) !== (patchData.detectedRoomType ?? null)) {
    return true;
  }
  if ('lightLevel' in patchData && (existing.lightLevel ?? null) !== (patchData.lightLevel ?? null)) {
    return true;
  }
  if (
    'maintenancePreference' in patchData &&
    (existing.maintenancePreference ?? null) !== (patchData.maintenancePreference ?? null)
  ) {
    return true;
  }
  if ('hasPets' in patchData && Boolean(existing.hasPets) !== Boolean(patchData.hasPets)) {
    return true;
  }
  if ('goals' in patchData) {
    const left = normalizeGoalsForCompare(existing.goals);
    const right = normalizeGoalsForCompare(patchData.goals);
    if (left.length !== right.length) return true;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return true;
    }
  }

  return false;
}

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
  futureSignals?: FutureScoringSignals;
}): ScoreResult {
  const { plant, profile } = args;
  const effectiveRoomType = profile.detectedRoomType ?? args.roomType ?? null;

  let score = round(clamp(plant.baseConfidence, 0, 1) * 30, 1);
  const fitSignals: string[] = [];
  const warningFlags: string[] = [];
  let majorWarningCount = 0;
  let softBlockerCount = 0;
  let roomFitReason: string | null = null;
  let preferenceFitReason: string | null = null;
  let tradeoffReason: string | null = null;
  const futureSignals = args.futureSignals ?? {};
  let petSafetySeverity: 'NONE' | 'MILD' | 'HIGH' = 'NONE';
  const plantRoomTypes = Array.isArray(plant.suitableRoomTypes) ? plant.suitableRoomTypes : [];
  const plantLightLevel = (plant.lightLevel ?? 'MEDIUM') as PlantLightLevel;
  const plantMaintenanceLevel = (plant.maintenanceLevel ?? 'MEDIUM') as PlantMaintenanceLevel;

  if (!Array.isArray(plant.suitableRoomTypes)) {
    pushUnique(warningFlags, 'Plant room-fit metadata is incomplete; applying general fit assumptions.');
  }
  if (!plant.lightLevel) {
    pushUnique(warningFlags, 'Plant light metadata is incomplete; using a moderate-light assumption.');
  }
  if (!plant.maintenanceLevel) {
    pushUnique(warningFlags, 'Plant maintenance metadata is incomplete; using a moderate-care assumption.');
  }

  if (effectiveRoomType) {
    if (plantRoomTypes.includes(effectiveRoomType)) {
      score += 24;
      roomFitReason = `Fits ${formatRoomType(effectiveRoomType).toLowerCase()} conditions.`;
      pushUnique(fitSignals, roomFitReason);
      if (
        effectiveRoomType === 'BATHROOM' ||
        effectiveRoomType === 'KITCHEN' ||
        effectiveRoomType === 'BEDROOM' ||
        effectiveRoomType === 'OFFICE'
      ) {
        score += 6;
        pushUnique(
          fitSignals,
          `Comfortable in the micro-climate common to ${formatRoomType(effectiveRoomType).toLowerCase()} spaces.`,
        );
      }
    } else if (plantRoomTypes.length === 0) {
      score += 4;
      pushUnique(fitSignals, 'Flexible room placement profile.');
    } else if (isNearRoomFit(plant, effectiveRoomType)) {
      score -= 6;
      softBlockerCount += 1;
      tradeoffReason = `works in similar spaces, but is not a primary ${formatRoomType(effectiveRoomType).toLowerCase()} pick`;
      pushUnique(
        warningFlags,
        `Works, but not ideal for ${formatRoomType(effectiveRoomType).toLowerCase()} placement.`,
      );
    } else if (plantRoomTypes.length > 0) {
      score -= 16;
      majorWarningCount += 1;
      tradeoffReason = `room-type fit is limited for ${formatRoomType(effectiveRoomType).toLowerCase()} use`;
      pushUnique(
        warningFlags,
        `Room-type fit is limited for ${formatRoomType(effectiveRoomType).toLowerCase()}.`,
      );
    }
  } else {
    pushUnique(warningFlags, 'Room type not set; recommendations are more general.');
  }

  if (profile.lightLevel) {
    const lightDelta = LIGHT_SCORE[profile.lightLevel] - LIGHT_SCORE[plantLightLevel];
    const diff = Math.abs(lightDelta);
    if (diff === 0) {
      score += 22;
      pushUnique(fitSignals, 'Light requirement aligns with this room.');
    } else if (diff === 1) {
      score += 10;
      pushUnique(fitSignals, 'Light level is close to ideal with mindful placement.');
      softBlockerCount += 1;
      if (!tradeoffReason) {
        tradeoffReason = 'light is close to ideal but may need careful placement';
      }
    } else if (diff === 2) {
      score -= 14;
      majorWarningCount += 1;
      const message =
        lightDelta < 0
          ? 'Current room light appears lower than this plant prefers; try a brighter spot near a window.'
          : 'Current room light may be stronger than ideal; diffuse direct sun to reduce stress.';
      pushUnique(warningFlags, message);
      if (!tradeoffReason) {
        tradeoffReason =
          lightDelta < 0
            ? 'insufficient light may slow growth'
            : 'stronger light may require filtered placement';
      }
    } else {
      score -= 28;
      majorWarningCount += 1;
      const message =
        lightDelta < 0
          ? 'Insufficient light for this plant under current conditions.'
          : 'Light intensity likely too high for this plant under current conditions.';
      pushUnique(warningFlags, message);
      if (!tradeoffReason) {
        tradeoffReason =
          lightDelta < 0
            ? 'light conditions are substantially below this plant’s target'
            : 'light conditions are substantially above this plant’s target';
      }
    }
  } else {
    pushUnique(warningFlags, 'Set room light level for tighter ranking.');
  }

  if (profile.maintenancePreference) {
    const maintenanceDelta =
      MAINTENANCE_SCORE[plantMaintenanceLevel] - MAINTENANCE_SCORE[profile.maintenancePreference];
    const diff = Math.abs(
      maintenanceDelta
    );
    if (diff === 0) {
      score += 14;
      preferenceFitReason = 'Matches your maintenance preference.';
      pushUnique(fitSignals, preferenceFitReason);
    } else if (diff === 1) {
      score += 5;
      softBlockerCount += 1;
      pushUnique(
        warningFlags,
        maintenanceDelta > 0
          ? 'Maintenance is slightly above your preference; a lower-touch alternative may be easier long term.'
          : 'Care routine is slightly lighter than requested; consider a more hands-on option if you want more interaction.',
      );
      if (!tradeoffReason) {
        tradeoffReason =
          maintenanceDelta > 0
            ? 'care cadence is a bit higher than your preferred routine'
            : 'care cadence is slightly lower than your preferred routine';
      }
    } else {
      score -= 14;
      majorWarningCount += 1;
      pushUnique(
        warningFlags,
        'Maintenance mismatch: this plant may require more ongoing care than requested.',
      );
      if (!tradeoffReason) {
        tradeoffReason = 'maintenance demand is materially above your target';
      }
    }
  }

  if (profile.hasPets) {
    if (plant.isPetSafe || plant.toxicityLevel === 'PET_SAFE') {
      score += 18;
      pushUnique(fitSignals, 'Pet-safety profile is favorable.');
    } else if (plant.toxicityLevel === 'MILDLY_TOXIC') {
      petSafetySeverity = 'MILD';
      score -= 22;
      majorWarningCount += 1;
      pushUnique(
        warningFlags,
        'Pet toxicity warning: mild toxicity risk; keep out of reach of curious pets.',
      );
      if (!tradeoffReason) {
        tradeoffReason = 'pet safety is a concern with this plant';
      }
    } else if (plant.toxicityLevel === 'TOXIC') {
      petSafetySeverity = 'HIGH';
      score -= 40;
      majorWarningCount += 1;
      pushUnique(
        warningFlags,
        'Pet toxicity warning: not pet-safe; choose a safer option if pets have access to this room.',
      );
      if (!tradeoffReason) {
        tradeoffReason = 'toxicity makes this a higher-risk choice around pets';
      }
    } else {
      score -= 12;
      softBlockerCount += 1;
      pushUnique(warningFlags, 'Pet-safety data is limited; verify before bringing this plant home.');
    }
  }

  if (profile.goals.length === 0) {
    pushUnique(warningFlags, 'No plant goals selected; goal-based boosts were skipped.');
  } else {
    let matchedGoalCount = 0;
    for (const goal of profile.goals) {
      const matched = goalMatchesPlant(goal, plant);
      if (matched) {
        matchedGoalCount += 1;
        score += 8;
        pushUnique(fitSignals, goalSignal(goal));
      } else {
        score -= 1;
      }
      score += roomGoalBoost(effectiveRoomType, goal, matched);
    }

    if (matchedGoalCount === 0) {
      softBlockerCount += 1;
      pushUnique(
        warningFlags,
        'Goal alignment is limited with current picks; try adjusting goals or selecting a lower-maintenance focus.',
      );
    } else if (!preferenceFitReason) {
      preferenceFitReason =
        matchedGoalCount === 1
          ? 'Matches one of your selected goals.'
          : `Matches ${matchedGoalCount} of your selected goals.`;
    }
  }

  if (effectiveRoomType === 'BATHROOM') {
    if (plant.humidityPreference === 'HIGH') {
      score += 8;
      pushUnique(fitSignals, 'Humidity preference fits bathroom conditions.');
    } else if (plant.humidityPreference === 'LOW') {
      score -= 6;
      softBlockerCount += 1;
      pushUnique(
        warningFlags,
        'Humidity mismatch: this plant prefers drier air than many bathrooms provide.',
      );
    }
  }

  if (effectiveRoomType === 'OFFICE' && plant.humidityPreference === 'LOW') {
    score += 3;
    pushUnique(fitSignals, 'Works well in drier office air.');
  }

  score += applyClimateWeighting({ plant, roomType: effectiveRoomType, futureSignals });
  score += applyWindowDirectionWeighting({
    plant,
    profileLightLevel: profile.lightLevel ?? null,
    futureSignals,
  });
  score += applyRoomScanWeighting({ plant, futureSignals });
  score += applyMaintenanceReadinessWeighting({ plant, futureSignals });

  score = round(clamp(score, 0, 100), 1);

  if (profile.hasPets && petSafetySeverity === 'HIGH') {
    score = Math.min(score, 62);
  } else if (profile.hasPets && petSafetySeverity === 'MILD') {
    score = Math.min(score, 72);
  }

  const completeness =
    ((effectiveRoomType ? 1 : 0) +
      (profile.lightLevel ? 1 : 0) +
      (profile.maintenancePreference ? 1 : 0) +
      (profile.goals.length > 0 ? 1 : 0)) /
    4;

  let confidence =
    0.18 +
    clamp(plant.baseConfidence, 0, 1) * 0.15 +
    completeness * 0.12 +
    (score / 100) * 0.55;
  confidence -= majorWarningCount * 0.12;
  confidence -= softBlockerCount * 0.05;
  if (score < 55) confidence -= 0.06;
  if (profile.hasPets && petSafetySeverity === 'HIGH') {
    confidence = Math.min(confidence, 0.56);
  } else if (profile.hasPets && petSafetySeverity === 'MILD') {
    confidence = Math.min(confidence, 0.64);
  }
  confidence = round(clamp(confidence, 0.05, 0.98), 2);
  const confidenceBandValue = confidenceBand(confidence);

  let fitCategory: ScoreResult['fitCategory'] =
    score >= 78 && majorWarningCount === 0
      ? 'STRONG'
      : score >= 55
        ? 'NEAR_FIT'
        : 'WEAK';

  if (profile.hasPets && petSafetySeverity === 'MILD' && fitCategory === 'STRONG') {
    fitCategory = 'NEAR_FIT';
  }
  if (profile.hasPets && petSafetySeverity === 'HIGH') {
    fitCategory = 'WEAK';
  }

  if (fitCategory !== 'STRONG') {
    pushUnique(warningFlags, 'Works, but not ideal under current room inputs.');
  }

  if (fitSignals.length === 0) {
    pushUnique(fitSignals, 'Best available near-fit option given current room constraints.');
  }

  const summaryParts: string[] = [];
  if (roomFitReason) summaryParts.push(roomFitReason);
  if (preferenceFitReason) summaryParts.push(preferenceFitReason);
  if (tradeoffReason) summaryParts.push(`Tradeoff: ${tradeoffReason}.`);
  if (summaryParts.length === 0 && warningFlags[0]) {
    summaryParts.push(`Near-fit recommendation: ${warningFlags[0]}`);
  }
  if (summaryParts.length === 0) {
    summaryParts.push('Balanced recommendation based on available room inputs.');
  }
  const reasonSummary = summaryParts.join(' ');

  return {
    score,
    confidence,
    confidenceBand: confidenceBandValue,
    fitSignals: fitSignals.slice(0, 6),
    warningFlags: warningFlags.slice(0, 6),
    reasonSummary,
    majorWarningCount,
    softBlockerCount,
    fitCategory,
  };
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
    const normalizedConfidence = clamp(Number(row.confidence ?? 0), 0, 1);

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
      confidence: normalizedConfidence,
      confidenceBand: confidenceBand(normalizedConfidence),
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
      const scoringInputsChanged = didScoringInputsChange(existing, data);

      return prisma.$transaction(async (tx) => {
        const updated = await tx.roomPlantProfile.update({
          where: { id: existing.id },
          data,
        });

        // Guardrail: recommendations become stale when scoring inputs change.
        if (scoringInputsChanged) {
          await tx.roomPlantRecommendation.deleteMany({
            where: {
              propertyId,
              roomId,
              roomPlantProfileId: existing.id,
            },
          });
        }

        return updated;
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

    const scored = rankPlantCandidates(
      plants
      .filter((plant) => Boolean(plant.id && plant.commonName))
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
          futureSignals: {
            // Future-ready extension points (kept deterministic in Phase 1).
            climateZone: null,
            windowDirection: null,
            roomScanSignals: null,
            maintenanceReminderReadiness: null,
          },
        });

        return { plant, result };
      }),
      limit,
    );

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
    const existing = await this.getScopedRecommendation(propertyId, roomId, recommendationId);

    if (existing.status === 'SAVED') {
      return { recommendation: this.mapRecommendationDTO(existing) };
    }

    const updated = await prisma.roomPlantRecommendation.update({
      where: { id: recommendationId },
      data: { status: 'SAVED' },
      include: { plantCatalog: true },
    });

    return { recommendation: this.mapRecommendationDTO(updated) };
  }

  async dismissRecommendation(propertyId: string, roomId: string, recommendationId: string) {
    await this.assertRoomBelongs(propertyId, roomId);
    const existing = await this.getScopedRecommendation(propertyId, roomId, recommendationId);

    if (existing.status === 'DISMISSED') {
      return { recommendation: this.mapRecommendationDTO(existing) };
    }

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

export const __roomPlantAdvisorTestables = {
  scorePlantCandidate,
  rankPlantCandidates,
  confidenceBand,
};
