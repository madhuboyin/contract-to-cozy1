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
