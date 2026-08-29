// apps/backend/src/services/agents/agentPropertyContext.service.ts
//
// §7.3.7: agents never import Prisma for property facts. Every fact read goes
// through modules/propertyContext's getPropertyContext, which authorizes the
// REAL resolved-owner user ID before assembling anything. `requestingAgentId`
// is attribution only and is never passed as the authorization principal.

import {
  getPropertyContext,
  PropertyContextAccessDeniedError,
  type PropertyContextScope,
  type PropertyContextSnapshot,
} from '../../modules/propertyContext';

export interface AgentContextRequest {
  propertyId: string;
  /** The session / resolved-owner user ID — the authorization principal. */
  principalUserId: string;
  requestingAgentId: string;
  scopes: readonly PropertyContextScope[];
  maxFacts: number;
}

export interface AgentContextResult {
  authorized: boolean;
  snapshot: PropertyContextSnapshot | null;
}

export type AgentPropertyContextReader = (request: AgentContextRequest) => Promise<AgentContextResult>;

export const readAgentPropertyContext: AgentPropertyContextReader = async (request) => {
  try {
    const snapshot = await getPropertyContext(
      request.propertyId,
      { userId: request.principalUserId },
      { scopes: [...request.scopes] },
    );
    const boundedFacts = Object.fromEntries(Object.entries(snapshot.facts).slice(0, request.maxFacts));
    return { authorized: true, snapshot: { ...snapshot, facts: boundedFacts } };
  } catch (error) {
    if (error instanceof PropertyContextAccessDeniedError) return { authorized: false, snapshot: null };
    throw error;
  }
};

/** Scopes the HVAC Specialist is allowed to request (mirrors the definition's requiredContext). */
export const HVAC_SPECIALIST_CONTEXT_SCOPES: readonly PropertyContextScope[] = [
  'SYSTEMS',
  'INVENTORY',
  'MAINTENANCE',
  'SAFETY',
];
