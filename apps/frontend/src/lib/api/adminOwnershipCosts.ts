import { api } from '@/lib/api/client';

export type OwnershipCostAnomaly = {
  type: string;
  severity: 'WARNING' | 'CRITICAL';
  propertyId?: string;
  adapterKey?: string;
  snapshotId?: string;
  detail: string;
};

export type OwnershipCostOperationsDashboard = {
  contractVersion: string;
  generatedAt: string;
  window: { start: string; end: string };
  sourceCoverage: {
    expectedAdapters: string[];
    propertiesObserved: number;
    adapterRuns: Record<string, number>;
    sourceRecords: number;
    observations: number;
  };
  staleness: {
    staleAfterHours: number;
    stalePropertyCount: number;
  };
  calculations: {
    snapshotCount: number;
    coverage: Record<string, number>;
    persistedAdapterFailures: number;
    definitionMismatchCount: number;
  };
  actionFunnel: {
    decisionsRecorded: number;
    engaged: number;
    resolvedOutcomes: number;
    dismissedOrNoAction: number;
    planningHandoffs: number;
    rule: string;
  };
  anomalies: OwnershipCostAnomaly[];
  limitations: string[];
};

export type OwnershipCostLaunchGate = {
  contractVersion: string;
  capabilityId: 'ownership-costs';
  state: 'READY' | 'BLOCKED';
  blockers: string[];
  valueFunnel: string[];
  evidence: Record<string, string | null>;
  approvals: {
    accessibility: boolean;
    responsive: boolean;
    contentSafety: boolean;
    commercialIntegrity: boolean;
    governanceEnforced: boolean;
    missingGovernanceRoles: string[];
    rejectedGovernanceRoles: string[];
  };
  openHighRiskGapIds: string[];
};

export async function fetchOwnershipCostOperations(windowDays = 30) {
  return (
    await api.get<OwnershipCostOperationsDashboard>(
      `/api/admin/ownership-costs/operations?windowDays=${windowDays}`,
    )
  ).data;
}

export async function fetchOwnershipCostLaunchGate() {
  return (
    await api.get<OwnershipCostLaunchGate>(
      '/api/admin/ownership-costs/launch-gate',
    )
  ).data;
}

export async function replayOwnershipCostSnapshot(input: {
  propertyId: string;
  inputFingerprint: string;
  methodVersion: string;
}) {
  return (
    await api.post('/api/admin/ownership-costs/replay', input)
  ).data as {
    reproduced: boolean;
    mutationPerformed: false;
    differences: string[];
    snapshotId: string;
  };
}
