import {
  PlantGoalType,
  PlantHumidityPreference,
  PlantLightLevel,
  PlantMaintenanceLevel,
  PlantRecommendationStatus,
  PlantToxicityLevel,
  RoomType,
} from '@prisma/client';

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

export interface PlantCatalogSummaryDTO {
  id: string;
  commonName: string;
  scientificName: string | null;
  shortDescription: string;
  lightLevel: PlantLightLevel;
  maintenanceLevel: PlantMaintenanceLevel;
  humidityPreference: PlantHumidityPreference;
  toxicityLevel: PlantToxicityLevel;
  isPetSafe: boolean;
  suitableRoomTypes: RoomType[];
  supportsAirQuality: boolean;
  hasFragrance: boolean;
  decorStyleTags: string[];
  placementTips: string | null;
  careSummary: string | null;
  wateringCadenceDays: number | null;
  baseConfidence: number;
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

