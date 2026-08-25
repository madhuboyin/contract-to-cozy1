import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../../ask/askOperationRegistry';
import type { SkillAdapterDefinition, SkillAdapterEffect } from './skillAdapter.contract';

const VERSION_PATTERN = /^\d+\.\d+$/;

function adapter(
  id: string,
  canonicalOwner: string,
  operationId: AskOperationId,
  effect: SkillAdapterEffect = 'READ',
): SkillAdapterDefinition {
  return Object.freeze({
    id,
    version: '1.0',
    canonicalOwner,
    allowedOperations: [operationId],
    inputContract: `ask.operation.${operationId}.input@1.0`,
    outputContract: 'ask.operation-result@1.0',
    effect,
    authorizationBehavior: 'PROPAGATE_EFFECTIVE_POLICY',
    timeoutMs: 15_000,
    retrySafety: effect === 'READ' ? 'SAFE' : 'CLAIM_GUARDED',
    idempotencyPolicy: effect === 'READ' ? 'NOT_APPLICABLE' : 'CONFIRMATION_RECEIPT',
    errorContract: 'ASK_TYPED_RESULT',
    healthContract: 'IN_PROCESS',
  });
}

const DEFINITIONS = [
  adapter('maintenance.status', 'PropertyMaintenanceTaskService', 'MAINTENANCE_STATUS'),
  adapter('maintenance.create', 'PropertyMaintenanceTaskService', 'MAINTENANCE_TASK_CREATE', 'MUTATION_PREPARATION'),
  adapter('maintenance.complete', 'PropertyMaintenanceTaskService', 'MAINTENANCE_TASK_COMPLETE', 'MUTATION_PREPARATION'),
  adapter('maintenance.update', 'PropertyMaintenanceTaskService', 'MAINTENANCE_TASK_UPDATE', 'MUTATION_PREPARATION'),
  adapter('home-deadline.monitor', 'Maintenance and Notification Preferences', 'HOME_DEADLINE_MONITOR', 'MUTATION_PREPARATION'),
  adapter('inventory.replacement', 'Inventory and ReplaceRepairService', 'REPLACEMENT_GUIDANCE'),
  adapter('decision-platform.hvac.start', 'Decision Platform', 'HVAC_DECISION_START', 'MUTATION_PREPARATION'),
  adapter('decision-platform.hvac.continue', 'Decision Platform', 'HVAC_DECISION_CONTINUE'),
  adapter('decision-platform.hvac.scenario', 'Decision Platform', 'HVAC_DECISION_SCENARIO', 'MUTATION_PREPARATION'),
  adapter('decision-platform.hvac.abandon', 'Decision Platform', 'HVAC_DECISION_ABANDON', 'MUTATION_PREPARATION'),
  adapter('decision-platform.hvac.preference.save', 'Decision Platform Preferences', 'HVAC_PREFERENCE_SAVE', 'MUTATION_PREPARATION'),
  adapter('decision-platform.hvac.preference.forget', 'Decision Platform Preferences', 'HVAC_PREFERENCE_FORGET', 'MUTATION_PREPARATION'),
  adapter('decision-platform.hvac.outcome.report', 'Decision Platform Outcomes', 'HVAC_DECISION_OUTCOME_REPORT', 'MUTATION_PREPARATION'),
  adapter('decision-platform.hvac.outcome.view', 'Decision Platform Outcomes', 'HVAC_DECISION_OUTCOME_VIEW'),
  adapter('decision-platform.hvac.outcome.unlink', 'Decision Platform Outcomes', 'HVAC_DECISION_OUTCOME_UNLINK', 'MUTATION_PREPARATION'),
  adapter('refinance.analysis', 'Refinance Radar', 'REFINANCE_ANALYSIS'),
  adapter('refinance.monitor', 'Refinance Rate Monitor', 'REFINANCE_RATE_MONITOR', 'MUTATION_PREPARATION'),
  adapter('property.summary', 'Property Record Overview', 'PROPERTY_SUMMARY'),
  adapter('inventory.lookup', 'InventoryService', 'INVENTORY_LOOKUP'),
  adapter('coverage.review', 'Coverage Intelligence', 'COVERAGE_GAPS'),
  adapter('savings.opportunities', 'Savings and Benefits Intelligence', 'SAVINGS_OPPORTUNITIES'),
  adapter('ownership.costs', 'Ownership Cost Intelligence', 'OWNERSHIP_COSTS'),
  adapter('sale-case.analysis', 'Seller Preparation Decision Service', 'SELL_HOLD_RENT_ANALYSIS'),
  adapter('household.invitation', 'Household Membership Service', 'HOUSEHOLD_INVITATION', 'MUTATION_PREPARATION'),
  adapter('quote-comparison.create', 'Quote Comparison Workspace', 'QUOTE_COMPARISON_CREATE', 'MUTATION_PREPARATION'),
  adapter('quote-comparison.review', 'Quote Comparison Workspace', 'QUOTE_COMPARISON_REVIEW'),
  adapter('capital-reserve.plan', 'Capital Planning Intelligence', 'CAPITAL_RESERVE_PLAN'),
  adapter('property-tax.appeal-readiness', 'Property Tax Intelligence', 'PROPERTY_TAX_APPEAL_READINESS'),
  adapter('renovation-permit.readiness', 'Renovation Readiness Service', 'RENOVATION_PERMIT_READINESS'),
  adapter('major-event.entry', 'Major Event Navigation', 'MAJOR_EVENT_ENTRY'),
  adapter('buyer.plan.status', 'HomeBuyerTaskService', 'BUYER_PLAN_STATUS'),
  adapter('buyer.deadlines', 'HomeBuyerTaskService', 'BUYER_DEADLINES'),
  adapter('buyer.document-readiness', 'HomeBuyerTaskService', 'BUYER_DOCUMENT_READINESS'),
  adapter('buyer.inspection-review', 'HomeBuyerTaskService', 'BUYER_INSPECTION_REVIEW'),
  adapter('buyer.task.complete', 'HomeBuyerTaskService', 'BUYER_TASK_COMPLETE', 'MUTATION_PREPARATION'),
  adapter('buyer.task.create', 'HomeBuyerTaskService', 'BUYER_TASK_CREATE', 'MUTATION_PREPARATION'),
  adapter('buyer.task.update', 'HomeBuyerTaskService', 'BUYER_TASK_UPDATE', 'MUTATION_PREPARATION'),
  adapter('buyer.move-status', 'HomeBuyerTaskService', 'BUYER_MOVE_STATUS'),
  adapter('buyer.financing-readiness', 'BuyerPurchaseLenderReadinessService', 'BUYER_FINANCING_READINESS'),
  adapter('buyer.title-escrow-readiness', 'BuyerTitleEscrowService', 'BUYER_TITLE_ESCROW_READINESS'),
  adapter('buyer.walkthrough-readiness', 'BuyerWalkthroughService', 'BUYER_WALKTHROUGH_READINESS'),
  adapter('buyer.disclosure-funds-readiness', 'BuyerClosingDisclosureService', 'BUYER_DISCLOSURE_FUNDS_READINESS'),
  adapter('buyer.closing-day-readiness', 'BuyerClosingDayService', 'BUYER_CLOSING_DAY_READINESS'),
  adapter('buyer.contract-timeline', 'BuyerContractService', 'BUYER_CONTRACT_TIMELINE'),
  adapter('buyer.negotiation-readiness', 'BuyerAcquisitionService', 'BUYER_NEGOTIATION_READINESS'),
  adapter('buyer.cost-readiness', 'HomeBuyerTaskService', 'BUYER_COST_READINESS'),
  adapter('buyer.finding.disposition', 'HomeBuyerTaskService', 'BUYER_FINDING_DISPOSITION', 'MUTATION_PREPARATION'),
  adapter('buyer.lifecycle.update', 'HomeBuyerTaskService', 'BUYER_LIFECYCLE_UPDATE', 'MUTATION_PREPARATION'),
  adapter('incident-claim.status', 'Incident and Claims Records', 'INCIDENT_CLAIM_STATUS'),
  adapter('incident-claim.file', 'ClaimsService', 'CLAIM_FILE', 'MUTATION_PREPARATION'),
  adapter('incident-claim.transition', 'ClaimsService', 'CLAIM_TRANSITION', 'MUTATION_PREPARATION'),
  adapter('incident-claim.continuation', 'Incident and Claims Records', 'INCIDENT_CONTINUATION'),
  adapter('home-actions.feed', 'Home Action Feed', 'HOME_ACTIONS'),
  adapter('home-operations.update', 'Operational Work application services', 'OPERATIONAL_WORK_UPDATE', 'MUTATION_PREPARATION'),
  adapter('inspection-findings.review', 'InspectionHubService', 'INSPECTION_FINDINGS'),
  adapter('inspection-findings.update', 'InspectionHubService', 'INSPECTION_FINDING_UPDATE', 'MUTATION_PREPARATION'),
  adapter('document-promotion.review', 'Document Promotion Registry', 'DOCUMENT_PROMOTION_REVIEW'),
  adapter('document-promotion.confirm', 'Canonical document promotion adapters', 'DOCUMENT_PROMOTION_CONFIRM', 'MUTATION_PREPARATION'),
  adapter('guidance.journey.create', 'GuidanceJourneyService', 'GUIDANCE_JOURNEY_CREATE', 'MUTATION_PREPARATION'),
  adapter('home-change.summary', 'PropertyChangeService', 'HOME_CHANGE_SUMMARY'),
] as const;

export function skillAdapterKey(adapterReference: { id: string; version: string }): string {
  return `${adapterReference.id}@${adapterReference.version}`;
}

export const SKILL_ADAPTER_DEFINITIONS: Readonly<Record<string, SkillAdapterDefinition>> = Object.freeze(
  Object.fromEntries(DEFINITIONS.map((definition) => [skillAdapterKey(definition), definition])),
);

export const REGISTERED_SKILL_ADAPTER_REFS: ReadonlySet<string> = new Set(Object.keys(SKILL_ADAPTER_DEFINITIONS));

export function getSkillAdapter(id: string, version: string): SkillAdapterDefinition | undefined {
  return SKILL_ADAPTER_DEFINITIONS[skillAdapterKey({ id, version })];
}

export function getSkillAdapterForOperation(operationId: AskOperationId): SkillAdapterDefinition | undefined {
  return DEFINITIONS.find((definition) => definition.allowedOperations.includes(operationId));
}

export function validateSkillAdapterDefinitions(
  definitions: Readonly<Record<string, SkillAdapterDefinition>> = SKILL_ADAPTER_DEFINITIONS,
): string[] {
  const issues: string[] = [];
  const operationOwners = new Map<AskOperationId, string>();
  for (const [key, definition] of Object.entries(definitions)) {
    if (key !== skillAdapterKey(definition)) issues.push(`${key}: adapter key mismatch`);
    if (!definition.id || !VERSION_PATTERN.test(definition.version)) issues.push(`${key}: invalid adapter identity or version`);
    if (!definition.canonicalOwner || !definition.allowedOperations.length) issues.push(`${key}: missing canonical owner or operations`);
    if (!definition.inputContract || !definition.outputContract) issues.push(`${key}: missing input or output contract`);
    if (!Number.isInteger(definition.timeoutMs) || definition.timeoutMs <= 0 || definition.timeoutMs > 120_000) issues.push(`${key}: invalid timeout`);
    if (definition.effect === 'READ' && definition.idempotencyPolicy !== 'NOT_APPLICABLE') issues.push(`${key}: read adapter has mutation idempotency policy`);
    if (definition.effect === 'MUTATION_PREPARATION' && definition.idempotencyPolicy !== 'CONFIRMATION_RECEIPT') issues.push(`${key}: mutation adapter lacks confirmation receipt policy`);
    for (const operationId of definition.allowedOperations) {
      const operation = ASK_OPERATION_DEFINITIONS[operationId];
      if (!operation) {
        issues.push(`${key}: unknown operation ${operationId}`);
        continue;
      }
      if (operation.adapterKey !== definition.id) issues.push(`${key}: operation ${operationId} declares adapter ${operation.adapterKey}`);
      const existingOwner = operationOwners.get(operationId);
      if (existingOwner) issues.push(`${key}: operation ${operationId} already mapped to ${existingOwner}`);
      else operationOwners.set(operationId, key);
    }
  }
  return issues;
}
