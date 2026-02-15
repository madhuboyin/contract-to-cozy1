import { api } from './client';

export type DoNothingRiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
export type DoNothingDeductibleStrategy = 'KEEP_HIGH' | 'RAISE' | 'LOWER' | 'UNCHANGED';
export type DoNothingSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type DoNothingInputOverrides = {
  skipMaintenance?: boolean;
  skipWarranty?: boolean;
  deductibleStrategy?: DoNothingDeductibleStrategy;
  cashBufferCents?: number;
  ignoreTopRisks?: string[];
  riskTolerance?: DoNothingRiskTolerance;
};

export type DoNothingScenarioDTO = {
  id: string;
  propertyId: string;
  homeownerProfileId: string;
  name: string;
  horizonMonths: number;
  inputOverrides: DoNothingInputOverrides;
  createdAt: string;
  updatedAt: string;
};

export type DoNothingRunDTO = {
  id: string;
  propertyId: string;
  homeownerProfileId: string;
  scenarioId?: string | null;

  status: 'READY' | 'STALE' | 'ERROR';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  horizonMonths: number;

  summary?: string;

  riskScoreDelta?: number | null;
  expectedCostDeltaCentsMin?: number | null;
  expectedCostDeltaCentsMax?: number | null;
  incidentLikelihood?: 'LOW' | 'MEDIUM' | 'HIGH' | null;

  outputs: {
    topRiskDrivers: Array<{ code: string; title: string; detail: string; severity: DoNothingSeverity }>;
    topCostDrivers: Array<{ code: string; title: string; detail: string; severity: DoNothingSeverity }>;
    biggestAvoidableLosses: Array<{
      title: string;
      detail: string;
      estCostCentsMin?: number;
      estCostCentsMax?: number;
    }>;
  };

  nextSteps: Array<{ title: string; detail?: string; priority: DoNothingSeverity }>;
  decisionTrace: Array<{ label: string; detail?: string; impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' }>;

  computedAt: string;
};

export type DoNothingLatestRunResponse =
  | { exists: false }
  | { exists: true; run: DoNothingRunDTO };

export type CreateDoNothingScenarioPayload = {
  name: string;
  horizonMonths: 6 | 12 | 24 | 36;
  inputOverrides?: DoNothingInputOverrides;
};

export type UpdateDoNothingScenarioPayload = {
  name?: string;
  horizonMonths?: 6 | 12 | 24 | 36;
  inputOverrides?: DoNothingInputOverrides;
};

export type RunDoNothingSimulationPayload = {
  scenarioId?: string;
  horizonMonths: 6 | 12 | 24 | 36;
  inputOverrides?: DoNothingInputOverrides;
};

export async function listDoNothingScenarios(propertyId: string): Promise<DoNothingScenarioDTO[]> {
  const res = await api.get<{ scenarios: DoNothingScenarioDTO[] }>(
    `/api/properties/${propertyId}/do-nothing/scenarios`
  );
  return res.data.scenarios;
}

export async function createDoNothingScenario(
  propertyId: string,
  payload: CreateDoNothingScenarioPayload
): Promise<DoNothingScenarioDTO> {
  const res = await api.post<{ scenario: DoNothingScenarioDTO }>(
    `/api/properties/${propertyId}/do-nothing/scenarios`,
    payload
  );
  return res.data.scenario;
}

export async function updateDoNothingScenario(
  propertyId: string,
  scenarioId: string,
  payload: UpdateDoNothingScenarioPayload
): Promise<DoNothingScenarioDTO> {
  const res = await api.patch<{ scenario: DoNothingScenarioDTO }>(
    `/api/properties/${propertyId}/do-nothing/scenarios/${scenarioId}`,
    payload
  );
  return res.data.scenario;
}

export async function deleteDoNothingScenario(propertyId: string, scenarioId: string): Promise<void> {
  await api.delete(`/api/properties/${propertyId}/do-nothing/scenarios/${scenarioId}`);
}

export async function getLatestDoNothingRun(
  propertyId: string,
  params?: { scenarioId?: string; horizonMonths?: 6 | 12 | 24 | 36 }
): Promise<DoNothingLatestRunResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.scenarioId) {
    queryParams.scenarioId = params.scenarioId;
  }
  if (params?.horizonMonths) {
    queryParams.horizonMonths = String(params.horizonMonths);
  }

  const res = await api.get<DoNothingLatestRunResponse>(
    `/api/properties/${propertyId}/do-nothing/runs/latest`,
    Object.keys(queryParams).length > 0 ? { params: queryParams } : undefined
  );
  return res.data;
}

export async function runDoNothingSimulation(
  propertyId: string,
  payload: RunDoNothingSimulationPayload
): Promise<DoNothingRunDTO> {
  const res = await api.post<{ run: DoNothingRunDTO }>(
    `/api/properties/${propertyId}/do-nothing/run`,
    payload
  );
  return res.data.run;
}
