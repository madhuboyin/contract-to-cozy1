import type { OnboardingOwnershipState } from '@prisma/client';
import type { AskOperationId } from './askOperationRegistry';

export type AskLifecyclePromptCategory = 'UNDERSTAND' | 'MAINTAIN' | 'PROTECT' | 'SAVE' | 'DECIDE' | 'PLAN_MONITOR';

export interface AskLifecyclePromptDefinition {
  id: string;
  operationId: AskOperationId;
  categoryId: AskLifecyclePromptCategory;
  categoryLabel: string;
  question: string;
}

const BUYING_PROMPTS: readonly AskLifecyclePromptDefinition[] = Object.freeze([
  { id: 'buying-record-summary', operationId: 'PROPERTY_SUMMARY', categoryId: 'UNDERSTAND', categoryLabel: 'Understand', question: 'Summarize this home record before closing.' },
  { id: 'buying-attention', operationId: 'HOME_ACTIONS', categoryId: 'PLAN_MONITOR', categoryLabel: 'Plan', question: 'What should I do before closing?' },
  { id: 'buying-costs', operationId: 'OWNERSHIP_COSTS', categoryId: 'SAVE', categoryLabel: 'Save', question: 'What are the ownership costs for this home after purchase?' },
  { id: 'buying-coverage-records', operationId: 'COVERAGE_GAPS', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'Which items are missing coverage records?' },
]);

const RECENT_OWNER_PROMPTS: readonly AskLifecyclePromptDefinition[] = Object.freeze([
  { id: 'recent-owner-first-actions', operationId: 'HOME_ACTIONS', categoryId: 'PLAN_MONITOR', categoryLabel: 'Plan', question: 'What home actions should I handle in my first 90 days?' },
  { id: 'recent-owner-maintenance', operationId: 'MAINTENANCE_STATUS', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What maintenance tasks should I handle first?' },
  { id: 'recent-owner-coverage', operationId: 'COVERAGE_GAPS', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'Which systems or appliances are missing coverage records?' },
  { id: 'recent-owner-record', operationId: 'PROPERTY_SUMMARY', categoryId: 'UNDERSTAND', categoryLabel: 'Understand', question: 'Give me a summary of my new home record.' },
]);

const ESTABLISHED_OWNER_PROMPTS: readonly AskLifecyclePromptDefinition[] = Object.freeze([
  { id: 'established-maintenance', operationId: 'MAINTENANCE_STATUS', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What maintenance tasks are coming due?' },
  { id: 'established-actions', operationId: 'HOME_ACTIONS', categoryId: 'PLAN_MONITOR', categoryLabel: 'Plan', question: 'Which home actions should I plan for next?' },
  { id: 'established-coverage', operationId: 'COVERAGE_GAPS', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'Which items may be missing coverage?' },
  { id: 'established-savings', operationId: 'SAVINGS_OPPORTUNITIES', categoryId: 'SAVE', categoryLabel: 'Save', question: 'Where could I reduce ownership costs?' },
]);

const SELLING_PROMPTS: readonly AskLifecyclePromptDefinition[] = Object.freeze([
  { id: 'selling-preparation', operationId: 'MAJOR_EVENT_ENTRY', categoryId: 'PLAN_MONITOR', categoryLabel: 'Plan', question: 'Help me prepare for selling my home.' },
  { id: 'selling-record-summary', operationId: 'PROPERTY_SUMMARY', categoryId: 'UNDERSTAND', categoryLabel: 'Understand', question: 'Summarize my home record for a buyer.' },
  { id: 'selling-attention', operationId: 'HOME_ACTIONS', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What home actions need attention before listing?' },
  { id: 'selling-options', operationId: 'SELL_HOLD_RENT_ANALYSIS', categoryId: 'DECIDE', categoryLabel: 'Decide', question: 'Help me compare selling, holding, or renting this home.' },
]);

const UNKNOWN_PROMPTS: readonly AskLifecyclePromptDefinition[] = Object.freeze([
  { id: 'unknown-summary', operationId: 'PROPERTY_SUMMARY', categoryId: 'UNDERSTAND', categoryLabel: 'Understand', question: 'Give me a summary of this home record.' },
  { id: 'unknown-maintenance', operationId: 'MAINTENANCE_STATUS', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What maintenance tasks are pending?' },
  { id: 'unknown-coverage', operationId: 'COVERAGE_GAPS', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'Which items may be missing coverage?' },
  { id: 'unknown-actions', operationId: 'HOME_ACTIONS', categoryId: 'PLAN_MONITOR', categoryLabel: 'Plan', question: 'What should I plan for next?' },
]);

export function lifecyclePromptsFor(ownershipState: OnboardingOwnershipState | null): readonly AskLifecyclePromptDefinition[] {
  if (ownershipState === 'SHOPPING' || ownershipState === 'UNDER_CONTRACT') return BUYING_PROMPTS;
  if (ownershipState === 'RECENT_OWNER') return RECENT_OWNER_PROMPTS;
  if (ownershipState === 'ESTABLISHED_OWNER') return ESTABLISHED_OWNER_PROMPTS;
  if (ownershipState === 'PREPARING_TRANSFER') return SELLING_PROMPTS;
  return UNKNOWN_PROMPTS;
}
