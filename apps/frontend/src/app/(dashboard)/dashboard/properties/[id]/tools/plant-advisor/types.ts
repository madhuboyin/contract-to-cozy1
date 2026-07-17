export type RoomType =
  | 'KITCHEN'
  | 'LIVING_ROOM'
  | 'BEDROOM'
  | 'BATHROOM'
  | 'DINING'
  | 'LAUNDRY'
  | 'GARAGE'
  | 'OFFICE'
  | 'BASEMENT'
  | 'OTHER';

export type PlantLightLevel = 'LOW' | 'MEDIUM' | 'BRIGHT_INDIRECT' | 'BRIGHT_DIRECT';

export type PlantMaintenanceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type PlantGoalType =
  | 'AIR_QUALITY'
  | 'FRAGRANCE'
  | 'DECOR'
  | 'PET_SAFE'
  | 'LOW_MAINTENANCE';

export type PlantRecommendationStatus = 'RECOMMENDED' | 'SAVED' | 'DISMISSED';
export type PlantRecommendationConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RoomPlantProfileDTO {
  id: string;
  propertyId: string;
  roomId: string;
  detectedRoomType: RoomType | null;
  lightLevel: PlantLightLevel | null;
  maintenancePreference: PlantMaintenanceLevel | null;
  hasPets: boolean;
  goals: PlantGoalType[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecommendationReasonDTO {
  summary: string;
  fitSignals: string[];
  warningFlags: string[];
}

export interface RoomPlantRecommendationDTO {
  id: string;
  propertyId: string;
  roomId: string;
  roomPlantProfileId: string;
  plantCatalogId: string;
  rank: number;
  score: number;
  confidence: number;
  confidenceBand: PlantRecommendationConfidenceBand;
  status: PlantRecommendationStatus;
  reasonSummary: string;
  reason: RecommendationReasonDTO;
  warningFlags: string[];
  plantName: string;
  scientificName: string | null;
  shortDescription: string;
  careSummary: string | null;
  placementTip: string | null;
}

export interface PlantAdvisorRoomSummaryDTO {
  roomId: string;
  name: string;
  roomType: RoomType | null;
  hasProfile: boolean;
  lastProfileUpdatedAt: string | null;
  lastRecommendationGeneratedAt: string | null;
  recommendationCounts: {
    total: number;
    recommended: number;
    saved: number;
    dismissed: number;
  };
}

export interface PlantAdvisorRoomStateDTO {
  room: PlantAdvisorRoomSummaryDTO;
  profile: RoomPlantProfileDTO | null;
  recommendations: RoomPlantRecommendationDTO[];
}

export interface RoomPlantProfileInput {
  detectedRoomType?: RoomType | null;
  lightLevel?: PlantLightLevel | null;
  maintenancePreference?: PlantMaintenanceLevel | null;
  hasPets?: boolean;
  goals?: PlantGoalType[];
  notes?: string | null;
}

export type PlantLocationType = 'INDOOR' | 'OUTDOOR';
export type GardenSunExposure = 'FULL_SUN' | 'PART_SUN' | 'SHADE' | 'UNKNOWN';
export type GardenSoilDrainage = 'FAST' | 'MODERATE' | 'SLOW' | 'UNKNOWN';
export type GardenIrrigationType = 'NONE' | 'MANUAL' | 'DRIP' | 'SPRINKLER' | 'UNKNOWN';

export interface HomePlantDTO {
  id: string;
  name: string;
  nickname: string | null;
  locationType: PlantLocationType;
  roomId: string | null;
  gardenZoneId: string | null;
  lastWateredAt: string | null;
  lastInspectedAt: string | null;
  room?: { name: string } | null;
  gardenZone?: { name: string } | null;
}

export interface GardenZoneDTO {
  id: string;
  name: string;
  sunExposure: GardenSunExposure;
  soilDrainage: GardenSoilDrainage;
  irrigationType: GardenIrrigationType;
  frostPocket: boolean;
  notes: string | null;
}

export interface PlantCareRecommendationDTO {
  id: string;
  homePlantId: string;
  plantName: string;
  locationName: string;
  priority: 'NOW' | 'SOON' | 'ROUTINE';
  title: string;
  guidance: string;
  wateringCadenceDays: number | null;
  adjustedCheckCadenceDays: number | null;
  placementWarning: string | null;
  triggers: string[];
}

export interface GardenZoneRecommendationDTO {
  id: string;
  gardenZoneId: string;
  zoneName: string;
  title: string;
  guidance: string;
  priority: 'NOW' | 'SOON' | 'SEASONAL';
  season: 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER';
  hardinessZone: string | null;
  actions: string[];
}

export interface PlantCareOutlookDTO {
  applicability: {
    feature: PropertyContextFeatureDecision;
    indoor: PropertyContextFeatureDecision;
    outdoor: PropertyContextFeatureDecision;
  };
  signals: Record<string, boolean | string | null>;
  hardinessZone: string | null;
  plants: HomePlantDTO[];
  zones: GardenZoneDTO[];
  careRecommendations: PlantCareRecommendationDTO[];
  gardenRecommendations: GardenZoneRecommendationDTO[];
}
import type { PropertyContextFeatureDecision } from '@/types';
