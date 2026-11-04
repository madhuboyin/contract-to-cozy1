import type { AskExecutionResponse } from './types';

// UX-03 (consolidated plan Phase 5): the shared anatomy a normal answer follows, as a checkable contract. A domain joins the calm presentation
// by satisfying it (or by being one of the explicit variants below), not by being added to an id list. This module only judges; it renders nothing.
//
//   normal answer = one direct headline · at most one dominant artifact · at most one visible primary action · evidence reachable, not first
//
// SCOPE: this is a block-level static check. It counts artifacts and PRIMARY actions inside `blocks[].actions` only. It does NOT yet see governed
// suggested next actions, skill handoffs, capture/confirmation controls, controls rendered outside block.actions, or primary actions added by
// frontend renderers, so it cannot yet enforce "at most one visible primary action" for the whole rendered response.
//
// Emergency, clarification, balanced comparison, capture and confirmation are named exceptions with their own layouts, so they are reported as
// variants and not held to the normal-answer limits.

export type AnswerVariant = 'EMERGENCY' | 'CLARIFICATION' | 'CAPTURE' | 'CONFIRMATION' | 'COMPARISON' | 'NORMAL';

const DOMINANT_ARTIFACT_TYPES = new Set(['GROUPED_LIST', 'PRIORITY_LIST', 'TABLE', 'ENVIRONMENT_REPORT', 'TIMELINE', 'CHART']);

type AnatomyInput = Pick<AskExecutionResponse, 'blocks'> & Partial<Pick<AskExecutionResponse, 'clarification' | 'captureRequests' | 'confirmation'>>;

export function answerVariant(execution: AnatomyInput): AnswerVariant {
  if (execution.blocks.some((block) => block.type === 'SUMMARY' && block.tone === 'CRITICAL')) return 'EMERGENCY';
  if (execution.confirmation) return 'CONFIRMATION';
  if (execution.clarification) return 'CLARIFICATION';
  if (execution.captureRequests && execution.captureRequests.length > 0) return 'CAPTURE';
  if (execution.blocks.some((block) => block.type === 'COMPARISON')) return 'COMPARISON';
  return 'NORMAL';
}

export interface AnatomyReport {
  variant: AnswerVariant;
  violations: string[];
}

export function evaluateAnswerAnatomy(execution: AnatomyInput): AnatomyReport {
  const variant = answerVariant(execution);
  if (variant !== 'NORMAL') return { variant, violations: [] };
  const violations: string[] = [];
  const summary = execution.blocks.find((block) => block.type === 'SUMMARY');
  if (!summary || summary.type !== 'SUMMARY' || !(summary.headline?.trim() || summary.title?.trim())) violations.push('NO_HEADLINE');
  const artifacts = execution.blocks.filter((block) => DOMINANT_ARTIFACT_TYPES.has(block.type));
  if (artifacts.length > 1) violations.push(`MULTIPLE_DOMINANT_ARTIFACTS:${artifacts.map((block) => block.id).join(',')}`);
  const primaries = execution.blocks.flatMap((block) => ('actions' in block && Array.isArray(block.actions) ? block.actions : [])).filter((action) => action.style === 'PRIMARY');
  if (primaries.length > 1) violations.push(`MULTIPLE_PRIMARY_ACTIONS:${primaries.length}`);
  return { variant, violations };
}
