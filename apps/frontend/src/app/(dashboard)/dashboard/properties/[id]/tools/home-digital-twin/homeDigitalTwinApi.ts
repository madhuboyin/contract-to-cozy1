import { api } from '@/lib/api/client';
import type {
  HomeDigitalTwinDTO,
  ScenarioSuggestionDTO,
  HomeTwinScenarioDTO,
  HomeTwinFactReadinessSummaryDTO,
  HomeTwinScenarioReadinessDTO,
  HomeTwinScenarioComparisonDTO,
  HomeTwinScenarioHandoffDTO,
  HomeTwinScenarioDecisionStatus,
  CreateScenarioInput,
  UpdateScenarioInput,
  HomeTwinScenarioRunDTO,
} from '@/types';

export async function getHomeDigitalTwin(propertyId: string): Promise<HomeDigitalTwinDTO | null> {
  try {
    return await api.getHomeDigitalTwin(propertyId);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: unknown }).status === 404) {
      return null;
    }
    throw err;
  }
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

const EMPTY_FACT_READINESS_SUMMARY: HomeTwinFactReadinessSummaryDTO = {
  hasTwin: false,
  knownFactCount: 0,
  needsAttentionCount: 0,
  confirmedComponentCount: 0,
  totalComponentCount: 0,
  items: [],
};

export async function getHomeDigitalTwinFactReadiness(
  propertyId: string,
): Promise<HomeTwinFactReadinessSummaryDTO> {
  const result = await api.getHomeDigitalTwinFactReadiness(propertyId);
  return result ?? EMPTY_FACT_READINESS_SUMMARY;
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

export async function listDigitalTwinScenarioRuns(
  propertyId: string,
  scenarioId: string,
): Promise<HomeTwinScenarioRunDTO[]> {
  return api.listDigitalTwinScenarioRuns(propertyId, scenarioId);
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

export async function deleteDigitalTwinScenario(propertyId: string, scenarioId: string): Promise<void> {
  return api.deleteDigitalTwinScenario(propertyId, scenarioId);
}

export async function getDigitalTwinScenarioReadiness(
  propertyId: string,
  params: { scenarioType: string; componentId?: string; componentType?: string },
): Promise<HomeTwinScenarioReadinessDTO | null> {
  return api.getDigitalTwinScenarioReadiness(propertyId, params);
}

export async function compareDigitalTwinScenarios(
  propertyId: string,
  componentId: string,
): Promise<HomeTwinScenarioComparisonDTO | null> {
  return api.compareDigitalTwinScenarios(propertyId, componentId);
}

export async function ensureDigitalTwinComparisonOptions(
  propertyId: string,
  componentId: string,
): Promise<HomeTwinScenarioComparisonDTO | null> {
  return api.ensureDigitalTwinComparisonOptions(propertyId, componentId);
}

export async function recordDigitalTwinScenarioDecision(
  propertyId: string,
  scenarioId: string,
  input: { decisionStatus: HomeTwinScenarioDecisionStatus; decisionReason?: string | null },
): Promise<HomeTwinScenarioDTO> {
  const result = await api.recordDigitalTwinScenarioDecision(propertyId, scenarioId, input);
  if (!result) throw new Error('Failed to record scenario decision');
  return result;
}

export async function getDigitalTwinScenarioHandoff(
  propertyId: string,
  scenarioId: string,
): Promise<HomeTwinScenarioHandoffDTO | null> {
  return api.getDigitalTwinScenarioHandoff(propertyId, scenarioId);
}
