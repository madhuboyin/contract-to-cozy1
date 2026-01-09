// backend/src/services/incidents/incident.decisionTrace.ts
export type DecisionTrace = {
    evaluatedAt: string; // ISO
    inputs: Record<string, any>;
    checks: Array<{
      id: string;
      label: string;
      passed: boolean;
      details?: Record<string, any>;
    }>;
    suppressions: Array<{
      source: 'SYSTEM' | 'USER';
      reason: string;
      ruleId?: string;
      until?: string | null;
    }>;
    actionPlan: Array<{
      actionType: string;
      actionKey: string;
      willCreate: boolean;
      reason: string;
      payload?: Record<string, any>;
    }>;
    outcome: {
      status: string; // evaluated status after orchestration step
      message: string;
    };
  };
  