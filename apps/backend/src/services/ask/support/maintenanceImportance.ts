import { type AskOperationResult } from '../askOperationRegistry';
import { calendarAwareTimeZone, humanDate } from '../askFormatting';

// "Why is this important?" on an exact maintenance task. Answered only from that
// task's own record -- never from property-wide facts or a model -- so it cannot
// drift to unrelated items. It says plainly when the record gives no reason.

export interface MaintenanceImportanceTask {
  title: string;
  description: string | null;
  source: string;
  priority: string | null;
  riskLevel: string | null;
  status: string;
  nextDueDate: Date | null;
  isRecurring: boolean;
  frequency: string | null;
  estimatedCost: { toString(): string } | number | null;
  assetType: string | null;
  isSeasonal: boolean;
  updatedAt: Date;
}

const SOURCE_REASON: Record<string, string> = {
  SEASONAL: 'It comes from your home’s seasonal checklist.',
  ACTION_CENTER: 'It was created from an action Cozy flagged for your home.',
  USER_CREATED: 'You added this task yourself.',
  RISK_ASSESSMENT: 'It was created from your home’s risk assessment.',
  WARRANTY_RENEWAL: 'It was created to keep a warranty current.',
  TEMPLATE: 'It comes from a maintenance template for your home.',
  RECALL_ALERT: 'It was created from a recall alert.',
  PROJECT_COMPLETION: 'It was created when a project was completed.',
};

const plain = (value: string) => value.toLowerCase().replace(/_/g, ' ');

function calendarKey(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: calendarAwareTimeZone(value, timeZone) }).format(value);
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

export function maintenanceImportanceFacts(task: MaintenanceImportanceTask, now: Date, timeZone: string): string[] {
  const facts: string[] = [];
  facts.push(SOURCE_REASON[task.source] ?? 'It is part of your home’s maintenance record.');
  if (task.priority) facts.push(`It is marked ${plain(task.priority)} priority${task.riskLevel ? ` with ${plain(task.riskLevel)} risk` : ''}.`);
  else if (task.riskLevel) facts.push(`It is recorded with ${plain(task.riskLevel)} risk.`);
  if (task.nextDueDate) {
    const due = humanDate(task.nextDueDate);
    const days = daysBetween(calendarKey(task.nextDueDate, timeZone), calendarKey(now, timeZone));
    const open = !['COMPLETED', 'CANCELLED'].includes(task.status);
    if (open && days > 0) facts.push(`It is ${days} ${days === 1 ? 'day' : 'days'} overdue (it was due ${due}).`);
    else if (open && days === 0) facts.push('It is due today.');
    else if (open) facts.push(`It is due ${due}.`);
  } else {
    facts.push('It has no due date yet.');
  }
  if (task.isRecurring && task.frequency) facts.push(`It repeats ${plain(task.frequency)}.`);
  if (task.assetType) facts.push(`It is linked to your ${plain(task.assetType)}.`);
  if (task.estimatedCost != null && Number(task.estimatedCost.toString()) > 0) facts.push(`The estimated cost is $${Number(task.estimatedCost.toString()).toLocaleString('en-US')}.`);
  return facts;
}

export function buildMaintenanceImportanceResult(task: MaintenanceImportanceTask, now: Date, timeZone: string): AskOperationResult {
  const facts = maintenanceImportanceFacts(task, now, timeZone);
  const notes = task.description?.trim();
  const body = [
    ...facts,
    notes ? `Task notes: ${notes}` : 'The record has no notes explaining why this matters, and I don’t guess beyond what is recorded.',
  ].join(' ');
  return {
    status: 'ANSWERED',
    blocks: [
      { type: 'SUMMARY', id: 'maintenance-task-importance', title: `Why “${task.title}” is on your list`, body, tone: 'DEFAULT', actions: [] },
      { type: 'EVIDENCE', id: 'maintenance-task-importance-evidence', title: 'Sources used', items: [{ label: task.title, source: 'Maintenance record (exact task)', observedAt: task.updatedAt.toISOString() }] },
    ],
    suggestions: [],
  };
}
