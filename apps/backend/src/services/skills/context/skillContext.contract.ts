import type { HouseholdRole } from '@prisma/client';
import type { AskOperationId, AskPropertyRoleFloor } from '../../ask/askOperationRegistry';

export type SkillContextProviderStatus =
  | 'AVAILABLE'
  | 'UNKNOWN'
  | 'STALE'
  | 'CONFLICTING'
  | 'UNAUTHORIZED'
  | 'UNAVAILABLE'
  | 'TIMED_OUT'
  | 'BUDGET_EXCEEDED'
  | 'NOT_APPLICABLE';

export type SkillContextSensitivity = 'STANDARD' | 'SENSITIVE' | 'RESTRICTED';

export interface SkillContextProviderRequest {
  userId: string;
  propertyId: string;
  operationId: AskOperationId;
  signal: AbortSignal;
}

export interface SkillContextProviderValue<T = unknown> {
  status: 'AVAILABLE' | 'UNKNOWN' | 'STALE' | 'CONFLICTING' | 'NOT_APPLICABLE';
  data?: T;
  observedAt?: string | null;
  sourceVersion?: string | null;
  entityCount?: number;
  factCount?: number;
  detail?: string;
}

export interface SkillContextProviderDefinition<T = unknown> {
  id: string;
  version: string;
  canonicalOwner: string;
  description: string;
  minimumRole: AskPropertyRoleFloor;
  sensitivity: SkillContextSensitivity;
  defaultTimeoutMs: number;
  maxSerializedBytes: number;
  supportedOperations: AskOperationId[];
  load(request: SkillContextProviderRequest): Promise<SkillContextProviderValue<T>>;
}

export interface SkillContextProvenance {
  providerId: string;
  providerVersion: string;
  canonicalOwner: string;
  sensitivity: SkillContextSensitivity;
  observedAt: string | null;
  sourceVersion: string | null;
}

export interface ComposedSkillContextEntry<T = unknown> {
  key: string;
  required: boolean;
  status: SkillContextProviderStatus;
  data?: T;
  provenance: SkillContextProvenance | null;
  serializedBytes: number;
  entityCount: number;
  factCount: number;
  detail?: string;
}

export interface SkillContextAuthorization {
  propertyId: string;
  role: HouseholdRole;
}

export interface ComposedSkillContext {
  status: 'READY' | 'DEGRADED' | 'BLOCKED';
  entries: ComposedSkillContextEntry[];
  values: Readonly<Record<string, unknown>>;
  totalSerializedBytes: number;
  totalEntities: number;
  totalFacts: number;
}
