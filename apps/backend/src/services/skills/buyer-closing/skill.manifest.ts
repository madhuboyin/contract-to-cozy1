import type { AskOperationId } from '../../ask/askOperationRegistry';
import type { SkillDefinition } from '../skill.contract';
import { PROPERTY_IDENTITY_CONTEXT_PROVIDER } from '../context/propertyIdentityContext.contract';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER } from '../context/propertyJourneyContext.contract';

/**
 * Home Intelligence Functional Completeness FRD Phase 6 (HI-SKL-003) —
 * these 18 BUYER_* operations were already fully defined, routed, and
 * executed in askOperationRegistry.ts/askOrchestrator.service.ts, but had
 * no owning Skill: getSkillForOperation() returned undefined for all of
 * them, so executeOperationCore() fell back to the raw operation
 * definition instead of enforcing Skill-level feature flag, kill switch,
 * adapter allowlist, result-block allowlist, and risk policy. This
 * manifest closes that governance gap without changing execution
 * behavior — every adapterKey/propertyRoleFloor/allowedBlockTypes value
 * below is copied from the existing operation definitions, not invented.
 */
export const BUYER_CLOSING_SKILL_OPERATIONS: AskOperationId[] = [
  'BUYER_PLAN_STATUS',
  'BUYER_DEADLINES',
  'BUYER_DOCUMENT_READINESS',
  'BUYER_INSPECTION_REVIEW',
  'BUYER_TASK_COMPLETE',
  'BUYER_TASK_CREATE',
  'BUYER_TASK_UPDATE',
  'BUYER_MOVE_STATUS',
  'BUYER_FINANCING_READINESS',
  'BUYER_TITLE_ESCROW_READINESS',
  'BUYER_WALKTHROUGH_READINESS',
  'BUYER_DISCLOSURE_FUNDS_READINESS',
  'BUYER_CLOSING_DAY_READINESS',
  'BUYER_CONTRACT_TIMELINE',
  'BUYER_NEGOTIATION_READINESS',
  'BUYER_COST_READINESS',
  'BUYER_FINDING_DISPOSITION',
  'BUYER_LIFECYCLE_UPDATE',
];

const BUYER_ADAPTER_KEY_BY_OPERATION: Record<string, string> = {
  BUYER_PLAN_STATUS: 'buyer.plan.status',
  BUYER_DEADLINES: 'buyer.deadlines',
  BUYER_DOCUMENT_READINESS: 'buyer.document-readiness',
  BUYER_INSPECTION_REVIEW: 'buyer.inspection-review',
  BUYER_TASK_COMPLETE: 'buyer.task.complete',
  BUYER_TASK_CREATE: 'buyer.task.create',
  BUYER_TASK_UPDATE: 'buyer.task.update',
  BUYER_MOVE_STATUS: 'buyer.move-status',
  BUYER_FINANCING_READINESS: 'buyer.financing-readiness',
  BUYER_TITLE_ESCROW_READINESS: 'buyer.title-escrow-readiness',
  BUYER_WALKTHROUGH_READINESS: 'buyer.walkthrough-readiness',
  BUYER_DISCLOSURE_FUNDS_READINESS: 'buyer.disclosure-funds-readiness',
  BUYER_CLOSING_DAY_READINESS: 'buyer.closing-day-readiness',
  BUYER_CONTRACT_TIMELINE: 'buyer.contract-timeline',
  BUYER_NEGOTIATION_READINESS: 'buyer.negotiation-readiness',
  BUYER_COST_READINESS: 'buyer.cost-readiness',
  BUYER_FINDING_DISPOSITION: 'buyer.finding.disposition',
  BUYER_LIFECYCLE_UPDATE: 'buyer.lifecycle.update',
};

export const BUYER_CLOSING_SKILL = Object.freeze({
  id: 'buyer-closing',
  version: '1.0.0',
  domain: 'HOME_TRANSACTION',
  displayName: 'Buyer & Closing',
  description: 'Track and progress an active home purchase from contract through closing — deadlines, documents, inspection findings, financing, title/escrow, walkthrough, and closing-day readiness.',
  homeownerJobs: ['NAVIGATE_MAJOR_MOMENTS', 'DECIDE_WITH_CONFIDENCE'],
  supportedGoals: [
    'review-buyer-plan-status',
    'track-buyer-deadlines',
    'review-buyer-document-readiness',
    'review-buyer-inspection-findings',
    'complete-buyer-task',
    'create-buyer-task',
    'update-buyer-task',
    'review-buyer-move-status',
    'review-buyer-financing-readiness',
    'review-buyer-title-escrow-readiness',
    'review-buyer-walkthrough-readiness',
    'review-buyer-disclosure-funds-readiness',
    'review-buyer-closing-day-readiness',
    'review-buyer-contract-timeline',
    'review-buyer-negotiation-readiness',
    'review-buyer-cost-readiness',
    'record-buyer-finding-disposition',
    'update-buyer-lifecycle-stage',
  ],
  aliases: ['buyer plan', 'home purchase plan', 'closing checklist', 'buyer closing readiness', 'home buying deadlines', 'under contract tasks'],
  operations: BUYER_CLOSING_SKILL_OPERATIONS.map((operationId) => ({
    operationId,
    version: '1.0',
    requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
    optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  })),
  requiredContextProviders: [PROPERTY_IDENTITY_CONTEXT_PROVIDER],
  optionalContextProviders: [PROPERTY_JOURNEY_CONTEXT_PROVIDER],
  allowedAdapters: BUYER_CLOSING_SKILL_OPERATIONS.map((operationId) => ({
    id: BUYER_ADAPTER_KEY_BY_OPERATION[operationId],
    version: '1.0',
  })),
  allowedExternalConnectors: [],
  consumerPolicy: [{ consumer: 'ASK', operations: BUYER_CLOSING_SKILL_OPERATIONS }],
  riskPolicy: {
    effects: ['READ', 'WRITE'],
    materiality: 'MATERIAL',
    riskDomains: ['FINANCIAL', 'PRIVACY'],
    reversibility: 'PARTIALLY_REVERSIBLE',
  },
  authorizationFloor: 'VIEWER',
  allowedResultBlocks: ['SUMMARY', 'GROUPED_LIST', 'EVIDENCE', 'WORKFLOW_PROGRESS', 'BOUNDARY'],
  dependencies: [
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_IDENTITY_CONTEXT_PROVIDER.id, version: PROPERTY_IDENTITY_CONTEXT_PROVIDER.version, required: true },
    { type: 'CONTEXT_PROVIDER', id: PROPERTY_JOURNEY_CONTEXT_PROVIDER.id, version: PROPERTY_JOURNEY_CONTEXT_PROVIDER.version, required: false },
    ...BUYER_CLOSING_SKILL_OPERATIONS.map((operationId) => ({
      type: 'OPERATION_CONTRACT' as const,
      id: operationId,
      version: '1.0',
      required: true,
    })),
  ],
  contextBudget: {
    maxFacts: 200,
    maxEntities: 80,
    maxDocuments: 5,
    maxHistoryEvents: 150,
    maxSerializedBytes: 220_000,
    maxProviderLatencyMs: 4_000,
    maxOverallLatencyMs: 20_000,
  },
  evaluationSuite: 'skill-buyer-closing-golden',
  featureFlag: 'ASK_SKILL_BUYER_CLOSING_ENABLED',
  killSwitch: 'ASK_SKILL_BUYER_CLOSING_KILL_SWITCH',
  owner: 'Homeowner Product / Home Transaction',
  lifecycleStatus: 'DEVELOPMENT',
  operationalStatus: 'ENABLED',
} satisfies SkillDefinition);
