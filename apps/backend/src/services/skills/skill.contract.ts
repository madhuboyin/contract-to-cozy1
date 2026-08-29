import type { AskOperationId, AskPropertyRoleFloor } from '../ask/askOperationRegistry';
import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';

export type SkillDomain =
  | 'HOME_CARE'
  | 'HOME_PROTECTION'
  | 'HOME_FINANCE'
  | 'HOME_TRANSACTION'
  | 'HOME_PROJECTS'
  | 'HOME_INTELLIGENCE'
  | 'HOUSEHOLD';

export type HomeownerJob = 'STAY_AHEAD' | 'DECIDE_WITH_CONFIDENCE' | 'NAVIGATE_MAJOR_MOMENTS';
export type SkillConsumer = 'ASK' | 'HOME_ACTIONS' | 'CONCIERGE_HOME' | 'PROACTIVE' | 'NOTIFICATION_CONTINUATION';
export type SkillLifecycleStatus = 'DRAFT' | 'DEVELOPMENT' | 'ACTIVE' | 'DEPRECATED' | 'RETIRED';
export type SkillOperationalStatus = 'ENABLED' | 'DISABLED';
export type SkillEffect = 'READ' | 'WRITE' | 'EXTERNAL_TRANSMISSION';
export type SkillMateriality = 'LOW' | 'MATERIAL' | 'CRITICAL';
export type SkillRiskDomain =
  | 'HOME_SAFETY'
  | 'FINANCIAL'
  | 'COVERAGE'
  | 'TAX_LEGAL'
  | 'HOUSEHOLD_SECURITY'
  | 'PRIVACY'
  | 'EXTERNAL_COMMUNICATION';
export type SkillReversibility = 'REVERSIBLE' | 'PARTIALLY_REVERSIBLE' | 'IRREVERSIBLE';
export type SkillAutonomyLevel = 0 | 1 | 2;

export interface VersionedSkillReference {
  id: string;
  version: string;
}

export interface SkillOperationReference {
  operationId: AskOperationId;
  version: string;
  requiredContextProviders?: VersionedSkillReference[];
  optionalContextProviders?: VersionedSkillReference[];
}

export interface SkillConsumerPolicy {
  consumer: SkillConsumer;
  operations: AskOperationId[];
}

export interface SkillRiskPolicy {
  effects: SkillEffect[];
  materiality: SkillMateriality;
  riskDomains: SkillRiskDomain[];
  reversibility: SkillReversibility;
}

export interface SkillContextBudget {
  maxFacts: number;
  maxEntities: number;
  maxDocuments: number;
  maxHistoryEvents: number;
  maxSerializedBytes: number;
  maxProviderLatencyMs: number;
  maxOverallLatencyMs: number;
}

export type SkillDependencyType =
  | 'CONTEXT_PROVIDER'
  | 'OPERATION_CONTRACT'
  | 'CANONICAL_SERVICE_CAPABILITY'
  | 'PLATFORM_CAPABILITY_AVAILABILITY'
  | 'WORKFLOW_PRECONDITION'
  | 'PRESENTATION_CAPABILITY';

export interface SkillDependency {
  type: SkillDependencyType;
  id: string;
  version: string;
  required: boolean;
}

export interface SkillDefinition {
  id: string;
  version: string;
  domain: SkillDomain;
  displayName: string;
  description: string;
  homeownerJobs: HomeownerJob[];
  supportedGoals: string[];
  aliases: string[];
  operations: SkillOperationReference[];
  requiredContextProviders: VersionedSkillReference[];
  optionalContextProviders: VersionedSkillReference[];
  allowedAdapters: VersionedSkillReference[];
  allowedExternalConnectors: VersionedSkillReference[];
  consumerPolicy: SkillConsumerPolicy[];
  autonomyLevel: SkillAutonomyLevel;
  riskPolicy: SkillRiskPolicy;
  authorizationFloor: AskPropertyRoleFloor;
  allowedResultBlocks: AskPresentationBlock['type'][];
  dependencies: SkillDependency[];
  contextBudget: SkillContextBudget;
  evaluationSuite: string;
  featureFlag: string;
  killSwitch: string;
  owner: string;
  lifecycleStatus: SkillLifecycleStatus;
  operationalStatus: SkillOperationalStatus;
}

export interface EffectiveSkillOperationPolicy {
  skillId: string;
  skillVersion: string;
  operationId: AskOperationId;
  operationVersion: string;
  consumer: SkillConsumer;
  authorizationFloor: AskPropertyRoleFloor;
  adapterKey: string;
  allowedResultBlocks: AskPresentationBlock['type'][];
  autonomyLevel: SkillAutonomyLevel;
  riskPolicy: SkillRiskPolicy;
}
