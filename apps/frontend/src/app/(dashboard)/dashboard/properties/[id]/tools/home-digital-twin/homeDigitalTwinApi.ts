import { api } from '@/lib/api/client';
import type {
  HomeDigitalTwinDTO,
  ScenarioSuggestionDTO,
  HomeTwinScenarioDTO,
  CreateScenarioInput,
  UpdateScenarioInput,
} from '@/types';

export async function getHomeDigitalTwin(propertyId: string): Promise<HomeDigitalTwinDTO | null> {
  return api.getHomeDigitalTwin(propertyId);
}

export async function initHomeDigitalTwin(
  propertyId: string,
  forceRefresh?: boolean,
): Promise<HomeDigitalTwinDTO> {
  const result = await api.initHomeDigitalTwin(propertyId, forceRefresh);
  if (!result) throw new Error('Failed to initialize digital twin');
  return result;
}

export async function refreshHomeDigitalTwin(propertyId: string): Promise<HomeDigitalTwinDTO> {
  const result = await api.refreshHomeDigitalTwin(propertyId);
  if (!result) throw new Error('Failed to refresh digital twin');
  return result;
}

export async function getDigitalTwinRecommendations(
  propertyId: string,
): Promise<ScenarioSuggestionDTO[]> {
  const result = await api.getDigitalTwinRecommendations(propertyId);
  return result ?? [];
}

export async function listDigitalTwinScenarios(
  propertyId: string,
  params?: { status?: string; includeArchived?: boolean },
): Promise<HomeTwinScenarioDTO[]> {
  const result = await api.listDigitalTwinScenarios(propertyId, params);
  return result ?? [];
}

export async function createDigitalTwinScenario(
  propertyId: string,
  input: CreateScenarioInput,
): Promise<HomeTwinScenarioDTO> {
  const result = await api.createDigitalTwinScenario(propertyId, input);
  if (!result) throw new Error('Failed to create scenario');
  return result;
}

export async function computeDigitalTwinScenario(
  propertyId: string,
  scenarioId: string,
): Promise<HomeTwinScenarioDTO> {
  const result = await api.computeDigitalTwinScenario(propertyId, scenarioId);
  if (!result) throw new Error('Failed to compute scenario');
  return result;
}

export async function updateDigitalTwinScenario(
  propertyId: string,
  scenarioId: string,
  input: UpdateScenarioInput,
): Promise<HomeTwinScenarioDTO> {
  const result = await api.updateDigitalTwinScenario(propertyId, scenarioId, input);
  if (!result) throw new Error('Failed to update scenario');
  return result;
}
