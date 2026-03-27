import { api } from '@/lib/api/client';
import type {
  PlantAdvisorRoomStateDTO,
  PlantAdvisorRoomSummaryDTO,
  RoomPlantProfileDTO,
  RoomPlantProfileInput,
  RoomPlantRecommendationDTO,
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
): Promise<{ recommendation: RoomPlantRecommendationDTO; homeEventId: string | null }> {
  const res = await api.post<{ recommendation: RoomPlantRecommendationDTO; homeEventId: string | null }>(
    `/api/properties/${propertyId}/plant-advisor/rooms/${roomId}/recommendations/${recommendationId}/add-to-home`,
    payload,
  );

  return res.data;
}
