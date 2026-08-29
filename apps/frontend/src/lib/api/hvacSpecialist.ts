// apps/frontend/src/lib/api/hvacSpecialist.ts
//
// Client for the HVAC Repair-or-Replace Specialist agent
// (C2C_INTELLIGENCE_AGENTIC_EVOLUTION_IMPLEMENTATION_PLAN.md §7.4). One
// endpoint, the closed operation set. Ask and this in-app surface call the
// same backend operation.

import { api } from '@/lib/api/client';

export type SpecialistOperation = 'START_OR_RESUME' | 'SUBMIT_CONTEXT' | 'DISPUTE_INPUT' | 'GET_STATUS';

export type SpecialistPhase =
  | 'WORKING'
  | 'NEEDS_CONTEXT'
  | 'NEEDS_DOCUMENT'
  | 'RECOMMENDATION_READY'
  | 'ABSTAINED';

export interface SpecialistOutstandingItem {
  key: string;
  label: string;
  correctionPath: string | null;
  kind: 'FACT' | 'DOCUMENT';
}

export interface SpecialistTypedClaim {
  claimId: string;
  text: string;
  sourceCode: string;
}

export interface SpecialistStatus {
  runId: string | null;
  agentId: string;
  agentVersion: string;
  phase: SpecialistPhase;
  decisionThreadId: string | null;
  currentRecommendationSnapshotId: string | null;
  verdict: 'REPAIR' | 'REPLACE' | 'MONITOR' | null;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  outstanding: SpecialistOutstandingItem[];
  explanation: SpecialistTypedClaim[];
  abstentionReason: string | null;
  paused: boolean;
  expectedOperation: SpecialistOperation | null;
}

export interface SpecialistResult {
  status: SpecialistStatus;
  mutated: boolean;
}

interface InvokeBody {
  inventoryItemId: string;
  contextIntake?: Record<string, unknown>;
  dispute?: { key: string; note?: string };
  expectedCasVersion?: number;
  homeActionId?: string;
}

async function invoke(
  propertyId: string,
  operation: SpecialistOperation,
  body: InvokeBody,
): Promise<SpecialistResult> {
  const res = await api.post<SpecialistResult>(
    `/api/properties/${propertyId}/agents/hvac-repair-replace/${operation}`,
    body,
  );
  return res.data;
}

export function getHvacSpecialistStatus(propertyId: string, inventoryItemId: string, homeActionId?: string) {
  return invoke(propertyId, 'GET_STATUS', { inventoryItemId, homeActionId });
}

export function startHvacSpecialist(propertyId: string, inventoryItemId: string, homeActionId?: string) {
  return invoke(propertyId, 'START_OR_RESUME', { inventoryItemId, homeActionId });
}

export function submitHvacSpecialistContext(
  propertyId: string,
  inventoryItemId: string,
  contextIntake: Record<string, unknown>,
  expectedCasVersion?: number,
) {
  return invoke(propertyId, 'SUBMIT_CONTEXT', { inventoryItemId, contextIntake, expectedCasVersion });
}
