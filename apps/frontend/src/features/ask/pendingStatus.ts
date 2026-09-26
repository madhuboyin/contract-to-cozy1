// ASK_COZY_INLINE_WORKSPACE_FRD §11.12 IW-CONV-006/012 (FRD v1.112): the status line shown while an answer is being prepared. The
// wording comes only from the homeowner's own question, never from a claim about what the server has actually done, and it stays
// generic when the question does not point at one area.

const AREAS: Array<[RegExp, string]> = [
  [/\b(maintenance|task|tasks|overdue|due|chore|checklist|seasonal)\b/i, 'maintenance records'],
  [/\b(coverage|insurance|insured|warranty|warranties|claim|claims|policy)\b/i, 'coverage and warranty records'],
  [/\b(inventory|appliance|appliances|furnace|hvac|water heater|roof|item|items)\b/i, 'home inventory'],
  [/\b(cost|costs|spend|spending|budget|save|savings|price|prices|expense|expenses|mortgage|refinance)\b/i, 'costs and finances'],
  [/\b(weather|storm|flood|freeze|wind|heat|alert|alerts|radar|hazard)\b/i, 'weather and local alerts'],
  [/\b(document|documents|receipt|receipts|invoice|invoices|manual|manuals)\b/i, 'documents'],
];

export function pendingStatusLabel(message: string): string {
  const area = AREAS.find(([pattern]) => pattern.test(message))?.[1];
  return area ? `Checking your ${area}…` : 'Checking your home record…';
}

export type PendingStage = 'WORKING' | 'STILL_WORKING' | 'SLOW';
export const STILL_WORKING_AFTER_MS = 6_000;
export const SLOW_AFTER_MS = 15_000;

/** What to say after this long: the plain line, then that it is still going, then that it can be stopped and retried. */
export function pendingStage(elapsedMs: number): PendingStage {
  if (elapsedMs >= SLOW_AFTER_MS) return 'SLOW';
  if (elapsedMs >= STILL_WORKING_AFTER_MS) return 'STILL_WORKING';
  return 'WORKING';
}

export function pendingStageText(stage: PendingStage, label: string): string {
  if (stage === 'SLOW') return 'This is taking longer than usual. You can stop and try again.';
  if (stage === 'STILL_WORKING') return 'Still working on this…';
  return label;
}
