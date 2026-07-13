import { api } from '@/lib/api/client';
import type {
  PlantAdvisorRoomStateDTO,
  PlantAdvisorRoomSummaryDTO,
  RoomPlantProfileDTO,
  RoomPlantProfileInput,
  RoomPlantRecommendationDTO,
  PlantCareOutlookDTO,
  GardenZoneDTO,
  HomePlantDTO,
  GardenSunExposure,
  GardenSoilDrainage,
  GardenIrrigationType,
} from './types';

export async function listEligiblePlantAdvisorRooms(
  propertyId: string,
): Promise<PlantAdvisorRoomSummaryDTO[]> {
  const res = await api.get<{ rooms: PlantAdvisorRoomSummaryDTO[] }>(
    `/api/properties/${propertyId}/plant-advisor/rooms`,
  );

  return res.data?.rooms ?? [];
}

export async function getRoomPlantAdvisorState(
  propertyId: string,
  roomId: string,
): Promise<PlantAdvisorRoomStateDTO> {
  const res = await api.get<PlantAdvisorRoomStateDTO>(
    `/api/properties/${propertyId}/plant-advisor/rooms/${roomId}`,
  );

  return res.data;
}

export async function upsertRoomPlantProfile(
  propertyId: string,
  roomId: string,
  profile: RoomPlantProfileInput,
): Promise<RoomPlantProfileDTO> {
  const res = await api.put<{ profile: RoomPlantProfileDTO }>(
    `/api/properties/${propertyId}/plant-advisor/rooms/${roomId}/profile`,
    profile,
  );

  return res.data.profile;
}

export async function generateRoomPlantRecommendations(
  propertyId: string,
  roomId: string,
  payload: {
    limit?: number;
    profile?: RoomPlantProfileInput;
  } = {},
): Promise<{ profile: RoomPlantProfileDTO; recommendations: RoomPlantRecommendationDTO[] }> {
  const res = await api.post<{
    profile: RoomPlantProfileDTO;
    recommendations: RoomPlantRecommendationDTO[];
  }>(`/api/properties/${propertyId}/plant-advisor/rooms/${roomId}/recommendations/generate`, payload);

  return res.data;
}

export async function saveRoomPlantRecommendation(
  propertyId: string,
  roomId: string,
  recommendationId: string,
): Promise<RoomPlantRecommendationDTO> {
  const res = await api.post<{ recommendation: RoomPlantRecommendationDTO }>(
    `/api/properties/${propertyId}/plant-advisor/rooms/${roomId}/recommendations/${recommendationId}/save`,
    {},
  );

  return res.data.recommendation;
}

export async function dismissRoomPlantRecommendation(
  propertyId: string,
  roomId: string,
  recommendationId: string,
): Promise<RoomPlantRecommendationDTO> {
  const res = await api.post<{ recommendation: RoomPlantRecommendationDTO }>(
    `/api/properties/${propertyId}/plant-advisor/rooms/${roomId}/recommendations/${recommendationId}/dismiss`,
    {},
  );

  return res.data.recommendation;
}

export async function addRoomPlantRecommendationToHome(
  propertyId: string,
  roomId: string,
  recommendationId: string,
  payload: { note?: string; occurredAt?: string } = {},
): Promise<{ recommendation: RoomPlantRecommendationDTO; homeEventId: string | null; homePlantId: string }> {
  const res = await api.post<{ recommendation: RoomPlantRecommendationDTO; homeEventId: string | null; homePlantId: string }>(
    `/api/properties/${propertyId}/plant-advisor/rooms/${roomId}/recommendations/${recommendationId}/add-to-home`,
    payload,
  );

  return res.data;
}

export async function trackPlantAdvisorEvent(
  propertyId: string,
  payload: {
    event: string;
    section?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await api.trackHomeEventRadarEvent(propertyId, {
    event: payload.event,
    section: payload.section ?? 'plant_advisor',
    metadata: payload.metadata,
  });
}

export async function getPlantCareOutlook(propertyId: string): Promise<PlantCareOutlookDTO> {
  const res = await api.get<PlantCareOutlookDTO>(`/api/properties/${propertyId}/plant-advisor/care-outlook`);
  return res.data;
}

export async function createGardenZone(propertyId: string, payload: {
  name: string;
  sunExposure?: GardenSunExposure;
  soilDrainage?: GardenSoilDrainage;
  irrigationType?: GardenIrrigationType;
  frostPocket?: boolean;
}): Promise<GardenZoneDTO> {
  const res = await api.post<GardenZoneDTO>(`/api/properties/${propertyId}/plant-advisor/garden-zones`, payload);
  return res.data;
}

export async function createHomePlant(propertyId: string, payload: {
  name: string;
  locationType: 'INDOOR' | 'OUTDOOR';
  roomId?: string;
  gardenZoneId?: string;
}): Promise<HomePlantDTO> {
  const res = await api.post<HomePlantDTO>(`/api/properties/${propertyId}/plant-advisor/plants`, payload);
  return res.data;
}

export async function updateHomePlantCare(propertyId: string, plantId: string, payload: {
  lastWateredAt?: string;
  lastInspectedAt?: string;
}): Promise<HomePlantDTO> {
  const res = await api.patch<HomePlantDTO>(`/api/properties/${propertyId}/plant-advisor/plants/${plantId}/care`, payload);
  return res.data;
}
