// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { HouseholdRole, MaintenanceTaskPriority, MaintenanceTaskStatus, RecurrenceFrequency } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { PropertyMaintenanceTaskService } from '../../PropertyMaintenanceTask.service';
import { skillContextProviderKey } from '../../skills/context/skillContextProviderRegistry';
import { loadCanonicalMaintenanceTaskSet, type MaintenanceTaskContext, type MaintenanceTaskContextTask } from '../../skills/context/maintenanceTaskContext.provider';
import type { SeasonalChecklistContext } from '../../skills/context/seasonalChecklistContext.provider';
import { MAINTENANCE_TASK_CONTEXT_PROVIDER, SEASONAL_CHECKLIST_CONTEXT_PROVIDER } from '../../skills/maintenance/skill.manifest';
import { generateForecast, listForecast } from '../../maintenancePrediction.service';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate } from '../askFormatting';
import { AskViewState, durableFreeTextClarification, ensurePropertyAccess, MaintenanceCompletionWorkflowInput, MaintenanceCompletionWorkflowInputSchema, MaintenanceTaskUpdateInputSchema, MaintenanceTaskWorkflowInput, MaintenanceTaskWorkflowInputSchema, MAX_RESULT_ITEMS, safeTimezone } from '../askHandlerSupport';
import { formatAskMaintenanceDescription, formatAskMaintenanceScope, formatAskMaintenanceTitle } from '../askMaintenancePresentation';
import { extractMaintenanceTaskTitle } from '../askMaintenanceTaskInput';
import { buildSeasonalMaintenanceResult } from '../askSeasonalMaintenance';

type MaintenanceTimeframe = {
  label: string;
  matches: (date: Date) => boolean;
};

function dateParts(value: Date, timeZone: string): { year: number; month: number; day: number; serial: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = number('year');
  const month = number('month');
  const day = number('day');
  return { year, month, day, serial: Date.UTC(year, month - 1, day) };
}

function localDateKey(value: Date, timeZone: string): string {
  const { year, month, day } = dateParts(value, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function maintenanceDate(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone,
  }).format(value);
}

function resolveMaintenanceTimeframe(message: string, now: Date, timeZone: string, purchaseDate: Date | null): { timeframe: MaintenanceTimeframe | null; missingPurchaseDate: boolean } {
  const explicitDates = [...message.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  if (explicitDates.length >= 2) {
    const [start, end] = explicitDates[0] <= explicitDates[1] ? explicitDates : [explicitDates[1], explicitDates[0]];
    return { timeframe: { label: `${start} through ${end}`, matches: (date) => {
      const key = localDateKey(date, timeZone);
      return key >= start && key <= end;
    } }, missingPurchaseDate: false };
  }
  if (/\bsince (?:i|we) (?:bought|purchased)|since (?:buying|purchasing)|since closing\b/i.test(message)) {
    return purchaseDate
      ? { timeframe: { label: `since ${maintenanceDate(purchaseDate, timeZone)}`, matches: (date) => date >= purchaseDate }, missingPurchaseDate: false }
      : { timeframe: null, missingPurchaseDate: true };
  }
  const current = dateParts(now, timeZone);
  if (/\btoday\b/i.test(message)) return {
    timeframe: { label: 'today', matches: (date) => localDateKey(date, timeZone) === localDateKey(now, timeZone) }, missingPurchaseDate: false,
  };
  if (/\bthis week\b/i.test(message)) {
    const weekdayName = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
    const weekday = Math.max(0, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName));
    const start = current.serial - weekday * 86_400_000;
    return { timeframe: { label: 'this week', matches: (date) => {
      const serial = dateParts(date, timeZone).serial;
      return serial >= start && serial < start + 7 * 86_400_000;
    } }, missingPurchaseDate: false };
  }
  if (/\bthis month\b/i.test(message)) return {
    timeframe: { label: 'this month', matches: (date) => {
      const part = dateParts(date, timeZone);
      return part.year === current.year && part.month === current.month;
    } }, missingPurchaseDate: false,
  };
  if (/\blast year\b/i.test(message)) return {
    timeframe: { label: 'last year', matches: (date) => dateParts(date, timeZone).year === current.year - 1 }, missingPurchaseDate: false,
  };
  if (/\bthis year\b/i.test(message)) return {
    timeframe: { label: 'this year', matches: (date) => dateParts(date, timeZone).year === current.year }, missingPurchaseDate: false,
  };
  const rollingDays = message.match(/\blast\s+(30|90)\s+days?\b/i)?.[1];
  if (rollingDays) {
    const days = Number(rollingDays);
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    return { timeframe: { label: `last ${days} days`, matches: (date) => date >= cutoff && date <= now }, missingPurchaseDate: false };
  }
  return { timeframe: null, missingPurchaseDate: false };
}

function maintenanceScopeTerms(message: string): string[] {
  const aliases: Array<[RegExp, string[]]> = [
    [/\b(?:hvac|furnace|air conditioner|heat pump|boiler)\b/i, ['hvac', 'furnace', 'air conditioner', 'heat pump', 'boiler']],
    [/\b(?:roof|gutter|exterior)\b/i, ['roof', 'gutter', 'exterior']],
    [/\b(?:plumbing|water heater|pipe|drain)\b/i, ['plumbing', 'water heater', 'pipe', 'drain']],
    [/\b(?:electrical|breaker|panel|outlet)\b/i, ['electrical', 'breaker', 'panel', 'outlet']],
    [/\b(?:refrigerator|fridge)\b/i, ['refrigerator', 'fridge']],
    [/\b(?:seasonal|winter|spring|summer|fall|autumn)\b/i, ['seasonal', 'winter', 'spring', 'summer', 'fall', 'autumn']],
    [/\b(?:safety|smoke detector|carbon monoxide|co detector)\b/i, ['safety', 'smoke detector', 'carbon monoxide', 'co detector']],
  ];
  return aliases.find(([pattern]) => pattern.test(message))?.[1] ?? [];
}

function maintenanceTaskText(task: MaintenanceTaskContextTask): string {
  return [task.title, task.description, task.category, task.assetType, task.serviceCategory, task.inventoryItem?.name, task.room?.name, task.season]
    .filter(Boolean).join(' ').toLowerCase();
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * IW-CALM-001/011 (FRD v1.111): the maintenance answer as one sentence and one supporting line. Deterministic, from typed
 * counts only. The headline states what needs attention; completed work is mentioned once, as hidden, so the numbers in
 * the headline, the supporting line and the chips never appear to disagree.
 */
export function maintenanceCalmCopy(counts: {
  overdueCount: number; dueSoonCount: number; openCount: number; unscheduledCount: number; hiddenCompletedCount: number;
}): { headline: string; supportLine?: string } {
  const { overdueCount, dueSoonCount, openCount, unscheduledCount, hiddenCompletedCount } = counts;
  let headline: string;
  if (overdueCount > 0 && dueSoonCount > 0) {
    headline = `${plural(overdueCount, 'task is', 'tasks are')} overdue, and ${dueSoonCount} more ${dueSoonCount === 1 ? 'is' : 'are'} due in the next 30 days.`;
  } else if (overdueCount > 0) {
    headline = `${plural(overdueCount, 'task is', 'tasks are')} overdue.`;
  } else if (dueSoonCount > 0) {
    headline = `${plural(dueSoonCount, 'task is', 'tasks are')} due in the next 30 days.`;
  } else {
    headline = openCount > 0 ? `${plural(openCount, 'open task', 'open tasks')}, none overdue or due soon.` : 'No open maintenance tasks.';
  }
  const notes = [
    unscheduledCount > 0 ? `${plural(unscheduledCount, 'open task has', 'open tasks have')} no due date.` : null,
    hiddenCompletedCount > 0 ? `${plural(hiddenCompletedCount, 'completed task is', 'completed tasks are')} hidden.` : null,
  ].filter((note): note is string => Boolean(note));
  return notes.length > 0 ? { headline, supportLine: notes.join(' ') } : { headline };
}

/**
 * The questions of the completion capture, in the order they are asked (FRD §11.12 IW-CONV-004). Each carries a plain `prompt`.
 * The project follow-up outcome is asked only for a project follow-up task: picking any other task never shows it, and a task
 * that turns out to be a project follow-up is asked again with the outcome required.
 */
export function maintenanceCompletionFields(
  openTasks: Array<{ id: string; title: string; nextDueDate?: Date | string | null }>,
  projectOutcomeRequired: boolean,
) {
  return [
    { key: 'taskId', label: 'Open task', prompt: 'Which task did you complete?', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: openTasks.slice(0, 50).map((task) => ({
      label: `${task.title}${task.nextDueDate ? ` · due ${humanDate(task.nextDueDate as Date)}` : ''}`, value: task.id,
    })) } },
    { key: 'actualCostUsd', label: 'Actual cost', prompt: 'Was there an actual cost?', helpText: 'Optional', required: false, inputSchema: { type: 'DECIMAL' as const, min: 0, max: 10_000_000, unit: 'USD' } },
    ...(projectOutcomeRequired ? [{ key: 'outcomeHealth', label: 'Project follow-up outcome', prompt: 'How is it working now?', required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: [
      { label: 'Working as expected', value: 'CONFIRMED_HEALTHY' }, { label: 'Needs attention', value: 'NEEDS_ATTENTION' }, { label: 'Failed again', value: 'FAILED' },
    ] } }] : []),
  ];
}

export function maintenanceMoney(value: { toString(): string } | number | null | undefined): string | null {
  if (value == null) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value));
}

export async function maintenanceWorkflowVersion(propertyId: string): Promise<string> {
  const tasks = await prisma.propertyMaintenanceTask.findMany({
    where: { propertyId }, orderBy: { id: 'asc' },
    select: { id: true, status: true, updatedAt: true },
  });
  return createHash('sha256').update(JSON.stringify({ propertyId, tasks })).digest('hex');
}

function shiftedDateOnly(now: Date, timeZone: string, input: { days?: number; weeks?: number; months?: number }): string {
  const current = dateParts(now, timeZone);
  const date = new Date(Date.UTC(current.year, current.month - 1, current.day));
  if (input.days) date.setUTCDate(date.getUTCDate() + input.days);
  if (input.weeks) date.setUTCDate(date.getUTCDate() + input.weeks * 7);
  if (input.months) {
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + input.months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

export function extractMaintenanceDueDate(message: string, now: Date, timeZone: string): string | undefined {
  const explicit = message.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (explicit) return explicit;
  if (/\btoday\b/i.test(message)) return shiftedDateOnly(now, timeZone, {});
  if (/\btomorrow\b/i.test(message)) return shiftedDateOnly(now, timeZone, { days: 1 });
  if (/\bnext week\b/i.test(message)) return shiftedDateOnly(now, timeZone, { weeks: 1 });
  if (/\bnext month\b/i.test(message)) return shiftedDateOnly(now, timeZone, { months: 1 });
  const relative = message.match(/\bin\s+(\d{1,3})\s+(days?|weeks?|months?)\b/i);
  if (!relative) return undefined;
  const amount = Number(relative[1]);
  const unit = relative[2].toLowerCase();
  return shiftedDateOnly(now, timeZone, unit.startsWith('day') ? { days: amount } : unit.startsWith('week') ? { weeks: amount } : { months: amount });
}

function extractMaintenanceFrequency(message: string): RecurrenceFrequency | undefined {
  if (/\b(?:every day|daily)\b/i.test(message)) return RecurrenceFrequency.DAILY;
  if (/\b(?:every week|weekly)\b/i.test(message)) return RecurrenceFrequency.WEEKLY;
  if (/\b(?:every (?:three|3) months|quarterly)\b/i.test(message)) return RecurrenceFrequency.QUARTERLY;
  if (/\b(?:twice a year|twice yearly|semi[ -]?annually)\b/i.test(message)) return RecurrenceFrequency.SEMI_ANNUALLY;
  if (/\b(?:every year|yearly|annually|annual)\b/i.test(message)) return RecurrenceFrequency.ANNUALLY;
  if (/\b(?:every month|monthly)\b/i.test(message)) return RecurrenceFrequency.MONTHLY;
  return undefined;
}

function extractMaintenanceTaskInput(message: string, now: Date, timeZone: string): Partial<MaintenanceTaskWorkflowInput> {
  const frequency = extractMaintenanceFrequency(message);
  const cost = message.match(/(?:estimated cost(?:s| is| of)?|budget(?: of)?|for)\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1];
  return {
    title: extractMaintenanceTaskTitle(message),
    priority: /\b(?:urgent|critical)\b/i.test(message)
      ? MaintenanceTaskPriority.URGENT
      : /\bhigh priority\b/i.test(message) ? MaintenanceTaskPriority.HIGH
        : /\blow priority\b/i.test(message) ? MaintenanceTaskPriority.LOW : MaintenanceTaskPriority.MEDIUM,
    nextDueDate: extractMaintenanceDueDate(message, now, timeZone),
    estimatedCostUsd: cost ? Number(cost.replace(/,/g, '')) : undefined,
    isRecurring: Boolean(frequency),
    frequency,
  };
}

export async function maintenanceTaskCreateResult(
  userId: string,
  propertyId: string,
  message: string,
  suppliedInput?: MaintenanceTaskWorkflowInput,
  sourceExecutionId?: string | null,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`;
  if (access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{
        type: 'SUMMARY', id: 'maintenance-create-permission', title: 'A contributor or owner needs to create this task',
        body: 'Creating a maintenance task changes the shared home record. Viewers can review tasks but cannot add or modify them.',
        tone: 'CAUTION', actions: [{ id: 'open-maintenance', label: 'Review maintenance', href: maintenanceHref, style: 'SECONDARY' }],
      }],
      suggestions: ['What maintenance is pending?'],
    };
  }

  const [property, workflowVersion] = await Promise.all([
    prisma.property.findUnique({ where: { id: propertyId }, select: { timezone: true } }),
    maintenanceWorkflowVersion(propertyId),
  ]);
  const candidate = suppliedInput ?? extractMaintenanceTaskInput(message, new Date(), safeTimezone(property?.timezone));
  const parsed = MaintenanceTaskWorkflowInputSchema.safeParse(candidate);
  if (!parsed.success) {
    const currentAnswer = Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== undefined));
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MAINTENANCE_TASK_INPUT_REQUIRED', contextVersion: workflowVersion,
      parameters: { maintenanceWorkflowVersion: workflowVersion, sourceExecutionId: sourceExecutionId ?? null },
      blocks: [{
        type: 'SUMMARY', id: 'maintenance-create-input', title: 'Add the task details',
        body: 'Nothing has been created yet. Add the minimum useful details, then review the task before it is saved.',
        tone: 'DEFAULT', actions: [{ id: 'open-maintenance', label: 'Open Maintenance instead', href: maintenanceHref, style: 'SECONDARY' }],
      }],
      captureRequests: [{
        requirementId: `maintenance-task-${workflowVersion.slice(0, 20)}`,
        captureKey: 'MAINTENANCE_TASK_INPUTS', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
        title: 'Maintenance task details', question: 'What task should be added, and when should it be due?',
        helpText: 'A due date, estimate, and recurrence are optional. You will review everything before the task is created.',
        inputSchema: { type: 'GROUP', fields: [
          { key: 'title', label: 'Task', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } },
          { key: 'description', label: 'Notes', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 1000 } },
          { key: 'priority', label: 'Priority', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [
            { label: 'Low', value: MaintenanceTaskPriority.LOW }, { label: 'Medium', value: MaintenanceTaskPriority.MEDIUM },
            { label: 'High', value: MaintenanceTaskPriority.HIGH }, { label: 'Urgent', value: MaintenanceTaskPriority.URGENT },
          ] } },
          { key: 'nextDueDate', label: 'Due date', helpText: 'Optional', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 10 } },
          { key: 'estimatedCostUsd', label: 'Estimated cost', helpText: 'Optional', required: false, inputSchema: { type: 'DECIMAL', min: 0, max: 10_000_000, unit: 'USD' } },
          { key: 'isRecurring', label: 'Does this repeat?', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Recurring', falseLabel: 'One-time' } },
          { key: 'frequency', label: 'Repeat', required: true, when: { fieldKey: 'isRecurring', operator: 'EQUALS', value: true }, inputSchema: { type: 'SINGLE_SELECT', options: [
            { label: 'Daily', value: RecurrenceFrequency.DAILY }, { label: 'Weekly', value: RecurrenceFrequency.WEEKLY },
            { label: 'Monthly', value: RecurrenceFrequency.MONTHLY }, { label: 'Quarterly', value: RecurrenceFrequency.QUARTERLY },
            { label: 'Twice a year', value: RecurrenceFrequency.SEMI_ANNUALLY }, { label: 'Annually', value: RecurrenceFrequency.ANNUALLY },
          ] } },
        ] },
        currentAnswer, allowNotSure: false, sensitivity: 'STANDARD',
        destinationLabel: 'Used to prepare this task; nothing is saved until you confirm', confirmationText: null,
        expectedContextVersion: workflowVersion,
      }],
      suggestions: ['Open Maintenance instead'],
    };
  }

  const confirmationVersion = 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MAINTENANCE_TASK_CONFIRMATION_REQUIRED', contextVersion: workflowVersion,
    parameters: {
      maintenanceTitle: parsed.data.title,
      maintenanceDescription: parsed.data.description ?? null,
      maintenancePriority: parsed.data.priority,
      maintenanceNextDueDate: parsed.data.nextDueDate ?? null,
      maintenanceEstimatedCostUsd: parsed.data.estimatedCostUsd ?? null,
      maintenanceIsRecurring: parsed.data.isRecurring,
      maintenanceFrequency: parsed.data.frequency ?? null,
      maintenanceWorkflowVersion: workflowVersion,
      sourceExecutionId: sourceExecutionId ?? null,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{
      type: 'SUMMARY', id: 'maintenance-create-review', title: 'Review this maintenance task',
      body: 'No task has been created yet. Confirm the shared-home record below or cancel without saving.',
      tone: 'DEFAULT', actions: [{ id: 'open-maintenance', label: 'Open Maintenance', href: maintenanceHref, style: 'SECONDARY' }],
    }],
    confirmation: {
      confirmationId: `maintenance-task-${propertyId}-${confirmationVersion}`,
      version: confirmationVersion,
      title: 'Create this maintenance task?',
      description: 'This adds one pending task to the selected home’s canonical Maintenance record.',
      fields: [
        { label: 'Task', value: parsed.data.title },
        { label: 'Priority', value: parsed.data.priority.toLowerCase().replace(/_/g, ' ') },
        { label: 'Due', value: parsed.data.nextDueDate ?? 'Not scheduled' },
        { label: 'Estimated cost', value: parsed.data.estimatedCostUsd == null ? 'Not recorded' : maintenanceMoney(parsed.data.estimatedCostUsd) ?? 'Not recorded' },
        { label: 'Recurrence', value: parsed.data.isRecurring && parsed.data.frequency ? parsed.data.frequency.toLowerCase().replace(/_/g, ' ') : 'One-time' },
      ],
      editableFields: [], confirmLabel: 'Create task',
      consentText: 'I confirm these task details are correct and authorize adding them to this home’s shared Maintenance record.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

export function maintenanceTaskVersion(task: { id: string; status: MaintenanceTaskStatus; updatedAt: Date }): string {
  return createHash('sha256').update(JSON.stringify({ id: task.id, status: task.status, updatedAt: task.updatedAt })).digest('hex');
}

// External review [P1] FRESH-002/A10: a detected maintenance-task
// confirmation conflict used to become a generic "This task changed
// while the confirmation was open. Review its current state and try
// again" message, regardless of what actually happened -- it never said
// whether another session had already finished the job, cancelled it, or
// just moved its date. Returning the CURRENT task's own state in the
// message (rather than a fresh proposal, which would require a much
// larger per-operation redesign across all 25 confirmation-capable
// commands) at least tells the homeowner what to expect before they ask
// again, and explicitly names the "someone else already completed this"
// case the review specifically called out.
export function maintenanceConflictDescription(task: { title: string; status: MaintenanceTaskStatus; priority: MaintenanceTaskPriority; nextDueDate: Date | null }): string {
  if (task.status === MaintenanceTaskStatus.COMPLETED) {
    return `"${task.title}" was already completed in another session. No further action was taken here.`;
  }
  if (task.status === MaintenanceTaskStatus.CANCELLED) {
    return `"${task.title}" was cancelled in another session before this change could be applied.`;
  }
  // External review [P2] follow-up: this fallback used to describe ONLY the
  // due date no matter what actually changed, so a conflict caused by a
  // priority change or a PENDING -> IN_PROGRESS transition still produced
  // the same due-date-only message -- correct but uninformative about the
  // change that actually caused the conflict. Naming the current status
  // (when not the ordinary PENDING) and priority alongside the due date
  // means the homeowner sees what's actually different, not just whichever
  // field this helper originally happened to describe.
  const statusPhrase = task.status === MaintenanceTaskStatus.IN_PROGRESS
    ? 'is now in progress'
    : task.status === MaintenanceTaskStatus.NEEDS_REVIEW
      ? 'now needs review'
      : null;
  const priorityPhrase = `${task.priority.toLowerCase()} priority`;
  const duePhrase = task.nextDueDate ? `due ${humanDate(task.nextDueDate) ?? 'on an unrecorded date'}` : 'unscheduled';
  return `"${task.title}" changed in another session before this could be confirmed -- it ${statusPhrase ? `${statusPhrase}, ` : ''}is now ${priorityPhrase} and ${duePhrase}. Review its current state and try again.`;
}

function maintenanceCompletionSubject(message: string): string {
  return message.toLowerCase()
    .replace(/^\s*(?:please\s+)?(?:mark|set|complete|finish)\s+/i, '')
    .replace(/^\s*(?:i|we)\s+(?:completed|finished)\s+/i, '')
    .replace(/\b(?:as\s+)?(?:complete|completed|done)\b/gi, ' ')
    .replace(/(?:actual cost(?: was| is)?|cost(?: me| us)?|for)\s*\$\s*[\d,]+(?:\.\d{1,2})?/gi, ' ')
    .replace(/\b(?:and )?(?:it is |it was )?(?:working (?:as expected|fine)|needs attention|failed again)\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:the|my|our|a|an|task|maintenance)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function maintenanceCompletionMatch<T extends { title: string; inventoryItem?: { name: string } | null; room?: { name: string } | null }>(message: string, tasks: T[]): T | null {
  if (tasks.length === 1) return tasks[0];
  const subject = maintenanceCompletionSubject(message);
  if (!subject) return null;
  const subjectTokens = new Set(subject.split(' ').filter((token) => token.length > 2));
  const ranked = tasks.map((task) => {
    const text = [task.title, task.inventoryItem?.name, task.room?.name].filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const tokens = new Set(text.split(' ').filter((token) => token.length > 2));
    const overlap = [...subjectTokens].filter((token) => tokens.has(token)).length;
    const score = text === subject ? 100 : text.includes(subject) || subject.includes(text) ? 80 : subjectTokens.size ? overlap / subjectTokens.size * 60 : 0;
    return { task, score };
  }).sort((left, right) => right.score - left.score);
  return ranked[0]?.score >= 35 && ranked[0].score > (ranked[1]?.score ?? -1) ? ranked[0].task : null;
}

export function extractMaintenanceCompletionInput(message: string, taskId: string | undefined): Partial<MaintenanceCompletionWorkflowInput> {
  const cost = message.match(/(?:actual cost(?: was| is)?|cost(?: me| us)?|for)\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1];
  const outcomeHealth = /\b(?:failed again|failed|not working)\b/i.test(message)
    ? 'FAILED' as const
    : /\b(?:needs attention|still has|still needs|issue remains|problem remains)\b/i.test(message)
      ? 'NEEDS_ATTENTION' as const
      : /\b(?:working as expected|working fine|looks good|resolved)\b/i.test(message)
        ? 'CONFIRMED_HEALTHY' as const
        : undefined;
  return {
    taskId,
    actualCostUsd: cost ? Number(cost.replace(/,/g, '')) : undefined,
    outcomeHealth,
  };
}

export async function maintenanceTaskCompleteResult(
  userId: string,
  propertyId: string,
  message: string,
  suppliedInput?: MaintenanceCompletionWorkflowInput,
  sourceExecutionId?: string | null,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`;
  if (access.role === HouseholdRole.VIEWER) {
    return {
      status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
      blocks: [{
        type: 'SUMMARY', id: 'maintenance-complete-permission', title: 'A contributor or owner needs to complete this task',
        body: 'Completing a task changes the shared Maintenance record and may update recurring schedules and Home Actions. Viewers remain read-only.',
        tone: 'CAUTION', actions: [{ id: 'open-maintenance', label: 'Review maintenance', href: maintenanceHref, style: 'SECONDARY' }],
      }],
      suggestions: ['What maintenance is pending?'],
    };
  }

  const [allTasks, workflowVersion] = await Promise.all([
    PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: true }),
    maintenanceWorkflowVersion(propertyId),
  ]);
  const openTasks = allTasks.filter((task) => task.status !== MaintenanceTaskStatus.COMPLETED && task.status !== MaintenanceTaskStatus.CANCELLED);
  if (!openTasks.length) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'NO_OPEN_MAINTENANCE_TASKS', contextVersion: workflowVersion,
      blocks: [{
        type: 'SUMMARY', id: 'maintenance-complete-empty', title: 'No open maintenance task is available to complete',
        body: 'No pending, in-progress, or needs-review task is recorded for this home. Ask will not create a completion without a canonical task.',
        tone: 'DEFAULT', actions: [{ id: 'open-maintenance', label: 'Open maintenance', href: maintenanceHref, style: 'PRIMARY' }],
      }],
      suggestions: ['Create a maintenance task'],
    };
  }

  const matched = suppliedInput
    ? openTasks.find((task) => task.id === suppliedInput.taskId) ?? null
    : maintenanceCompletionMatch(message, openTasks);
  const extracted = suppliedInput ?? extractMaintenanceCompletionInput(message, matched?.id);
  const projectOutcomeRequired = Boolean(matched?.actionKey?.match(/^project:[^:]+:follow-up$/));
  const parsed = MaintenanceCompletionWorkflowInputSchema.safeParse(extracted);
  if (!matched || !parsed.success || (projectOutcomeRequired && !parsed.data.outcomeHealth)) {
    const currentAnswer = Object.fromEntries(Object.entries(extracted).filter(([, value]) => value !== undefined));
    return {
      status: matched ? 'NEEDS_CONTEXT' : 'NEEDS_ENTITY',
      reasonCode: matched ? 'MAINTENANCE_COMPLETION_OUTCOME_REQUIRED' : 'MAINTENANCE_TASK_SELECTION_REQUIRED',
      contextVersion: workflowVersion,
      parameters: { maintenanceWorkflowVersion: workflowVersion },
      blocks: [{
        type: 'SUMMARY', id: 'maintenance-complete-select',
        title: matched ? `Record the outcome for ${matched.title}` : 'Choose the task to complete',
        body: matched
          ? 'This project follow-up requires an outcome before completion. Nothing has been changed yet.'
          : 'Ask could not identify one open task with enough confidence. Select the exact canonical task; nothing will change until you confirm.',
        tone: 'DEFAULT', actions: [{ id: 'open-maintenance', label: 'Open Maintenance instead', href: maintenanceHref, style: 'SECONDARY' }],
      }],
      captureRequests: [{
        requirementId: `maintenance-complete-${workflowVersion.slice(0, 20)}`,
        captureKey: 'MAINTENANCE_COMPLETION_INPUTS', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
        title: 'Maintenance completion details', question: 'Which task was completed, and was there an actual cost or follow-up outcome?',
        helpText: 'Actual cost is optional. Project outcome is used only when the selected task is a project follow-up. You will review before saving.',
        inputSchema: { type: 'GROUP', fields: maintenanceCompletionFields(openTasks, projectOutcomeRequired) },
        currentAnswer, allowNotSure: false, sensitivity: 'STANDARD',
        destinationLabel: 'Used to prepare this completion; nothing is saved until you confirm', confirmationText: null,
        expectedContextVersion: workflowVersion,
      }],
      suggestions: ['Open Maintenance instead'],
    };
  }

  const selected = matched;
  const confirmationVersion = 1;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MAINTENANCE_COMPLETION_CONFIRMATION_REQUIRED', contextVersion: maintenanceTaskVersion(selected),
    parameters: {
      maintenanceTaskId: selected.id,
      maintenanceTaskTitle: selected.title,
      maintenanceTaskVersion: maintenanceTaskVersion(selected),
      maintenanceActualCostUsd: parsed.data.actualCostUsd ?? null,
      maintenanceOutcomeHealth: parsed.data.outcomeHealth ?? null,
      // MAINT-005/A12: carried to confirm-time so the source list (if this
      // came from a "Complete" row action) can be refreshed in place after
      // the mutation succeeds -- see confirmMaintenanceTaskComplete.
      sourceExecutionId: sourceExecutionId ?? null,
      confirmationVersion,
      confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [{
      type: 'SUMMARY', id: 'maintenance-complete-review', title: `Review completion for ${selected.title}`,
      body: `No status has changed yet.${selected.isRecurring && selected.frequency ? ' Confirming will complete this occurrence and calculate the next due date.' : ''}`,
      tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: `${maintenanceHref}&taskId=${encodeURIComponent(selected.id)}&from=ask`, style: 'SECONDARY' }],
    }],
    confirmation: {
      confirmationId: `maintenance-complete-${selected.id}-${confirmationVersion}`,
      version: confirmationVersion,
      title: 'Mark this maintenance task complete?',
      description: 'This records completion in the canonical Maintenance record and runs its registered downstream reconciliation.',
      fields: [
        { label: 'Task', value: selected.title },
        { label: 'Current status', value: selected.status.toLowerCase().replace(/_/g, ' ') },
        { label: 'Actual cost', value: parsed.data.actualCostUsd == null ? 'Not recorded' : maintenanceMoney(parsed.data.actualCostUsd) ?? 'Not recorded' },
        { label: 'Recurrence', value: selected.isRecurring && selected.frequency ? `${selected.frequency.toLowerCase().replace(/_/g, ' ')} · next date recalculated` : 'One-time' },
        ...(projectOutcomeRequired ? [{ label: 'Project outcome', value: String(parsed.data.outcomeHealth).toLowerCase().replace(/_/g, ' ') }] : []),
      ],
      editableFields: [], confirmLabel: 'Mark complete',
      consentText: 'I confirm this task was completed and authorize updating the shared Maintenance record and its related home workflows.',
      expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

export function maintenanceUpdateAction(message: string): z.infer<typeof MaintenanceTaskUpdateInputSchema>['action'] {
  if (/\bunassign\b/i.test(message)) return 'UNASSIGN';
  if (/\bassign\b/i.test(message)) return 'ASSIGN';
  if (/\b(?:archive|cancel)\b/i.test(message)) return 'ARCHIVE';
  if (/\b(?:reopen|restore)\b/i.test(message)) return 'REOPEN';
  if (/\b(?:reschedule|due date|move .{0,30}(?:to|until))\b/i.test(message)) return 'RESCHEDULE';
  return 'EDIT';
}

export function maintenanceUpdateSubject(message: string): string {
  return message.toLowerCase()
    .replace(/\b(?:reschedule|move|change|update|edit|assign|unassign|archive|cancel|reopen|restore|maintenance|task|priority|due date)\b/g, ' ')
    .replace(/\b(?:to|on|until|for|as)\s+\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function maintenanceTaskUpdateResult(userId: string, propertyId: string, message: string, launchTaskId?: string | null, sourceExecutionId?: string | null): Promise<AskOperationResult> {
  const [tasks, members] = await Promise.all([
    PropertyMaintenanceTaskService.getTasksForProperty(userId, propertyId, { includeCompleted: true }),
    prisma.householdMember.findMany({ where: { propertyId }, include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } }),
  ]);
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001/ACT-003: an inline row action
  // (e.g. "Reschedule" on a maintenance card) carries a canonical taskId via
  // launchContext, not a fuzzy title guess -- resolve it directly rather
  // than making maintenanceCompletionMatch re-derive the same task from a
  // synthesized message subject, which can fail to match at all.
  const subject = maintenanceUpdateSubject(message);
  const match = (launchTaskId ? tasks.find((task) => task.id === launchTaskId) ?? null : null) ?? maintenanceCompletionMatch(subject, tasks);
  const maintenanceHref = `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`;
  if (!match) {
    return {
      status: 'NEEDS_ENTITY', reasonCode: 'MAINTENANCE_TASK_SELECTION_REQUIRED',
      ...durableFreeTextClarification('MAINTENANCE_TASK_UPDATE', 'Which maintenance task should Ask update? Use its exact title.'),
      blocks: [{
        type: 'GROUPED_LIST', filters: [], id: 'maintenance-update-options', title: 'Choose the task to change',
        description: 'Ask found more than one possible task. Use its exact title in your next message; nothing has changed.',
        sections: [{ id: 'tasks', title: 'Maintenance tasks', count: tasks.length, items: tasks.slice(0, 20).map((task) => ({
          id: task.id, title: task.title, description: task.nextDueDate ? `Due ${humanDate(task.nextDueDate)}` : 'No due date',
          meta: [task.priority, task.status], status: task.status, href: `${maintenanceHref}&taskId=${encodeURIComponent(task.id)}`,
        })) }], actions: [{ id: 'open-maintenance', label: 'Open Maintenance', href: maintenanceHref, style: 'SECONDARY' }],
      }], suggestions: tasks.slice(0, 3).map((task) => `Update ${task.title}`),
    };
  }
  const action = maintenanceUpdateAction(message);
  const dueDate = extractMaintenanceDueDate(message, new Date(), 'UTC');
  const priority = /\burgent\b/i.test(message) ? MaintenanceTaskPriority.URGENT
    : /\bhigh(?: priority)?\b/i.test(message) ? MaintenanceTaskPriority.HIGH
      : /\blow(?: priority)?\b/i.test(message) ? MaintenanceTaskPriority.LOW
        : /\bmedium(?: priority)?\b/i.test(message) ? MaintenanceTaskPriority.MEDIUM : undefined;
  const assigneeText = message.match(/\bassign\b.{0,20}\bto\s+([^,.;]+)/i)?.[1]?.trim().toLowerCase();
  const assignee = action === 'ASSIGN' && assigneeText
    ? members.find((member) => [member.user.email, member.user.firstName, `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim()]
      .some((value) => value?.toLowerCase() === assigneeText || value?.toLowerCase().includes(assigneeText)))
    : null;
  if ((action === 'RESCHEDULE' && !dueDate) || (action === 'ASSIGN' && !assignee) || (action === 'EDIT' && !priority)) {
    return {
      status: 'NEEDS_CLARIFICATION', reasonCode: 'MAINTENANCE_UPDATE_VALUE_REQUIRED',
      ...durableFreeTextClarification('MAINTENANCE_TASK_UPDATE', `What should change for ${match.title}?`),
      blocks: [{ type: 'SUMMARY', id: 'maintenance-update-value', title: `What should change for ${match.title}?`, body: action === 'RESCHEDULE'
        ? 'Include a date such as 2026-10-15.'
        : action === 'ASSIGN' ? 'Name an active household member or use their email address.' : 'Specify the new priority: low, medium, high, or urgent.', tone: 'CAUTION', actions: [] }],
      suggestions: action === 'ASSIGN' ? members.slice(0, 3).map((member) => `Assign ${match.title} to ${member.user.email}`) : [],
    };
  }
  const parsed = MaintenanceTaskUpdateInputSchema.parse({
    taskId: match.id, action,
    ...(dueDate ? { nextDueDate: dueDate } : {}), ...(priority ? { priority } : {}),
    ...(action === 'ASSIGN' ? { assigneeUserId: assignee!.userId } : {}),
    ...(action === 'UNASSIGN' ? { assigneeUserId: null } : {}),
  });
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const actionLabel = { EDIT: 'update', RESCHEDULE: 'reschedule', ASSIGN: 'assign', UNASSIGN: 'unassign', ARCHIVE: 'archive', REOPEN: 'reopen' }[action];
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MAINTENANCE_UPDATE_CONFIRMATION_REQUIRED', contextVersion: maintenanceTaskVersion(match),
    // MAINT-005/A12: carried to confirm-time so the source list (if this
    // came from a "Reschedule" row action) can be refreshed in place after
    // the mutation succeeds -- see confirmMaintenanceTaskUpdate.
    parameters: { maintenanceUpdate: parsed, maintenanceTaskVersion: maintenanceTaskVersion(match), sourceExecutionId: sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'maintenance-update-review', title: `Review this ${actionLabel}`, body: 'No shared-home record has changed yet.', tone: 'DEFAULT', actions: [{ id: 'open-task', label: 'Open task', href: `${maintenanceHref}&taskId=${encodeURIComponent(match.id)}`, style: 'SECONDARY' }] }],
    confirmation: {
      confirmationId: `maintenance-update-${match.id}-1`, version: 1, title: `${actionLabel.charAt(0).toUpperCase()}${actionLabel.slice(1)} ${match.title}?`,
      description: 'This command writes through the canonical Maintenance service and preserves downstream reconciliation.',
      // MAINT-006: reschedule must show current vs. proposed date, plus any
      // recurrence consequence -- a task holds one mutable nextDueDate (no
      // separate occurrence record, see FRD §18's MAINT-007 resolution), so
      // the only consequence to disclose is that the recurring pattern
      // itself is unaffected; only this next occurrence's date changes.
      // The proposed due date for a RESCHEDULE is represented only via
      // editableFields below (not duplicated here as read-only text) -- see
      // CONF-002/CONF-003.
      fields: [{ label: 'Task', value: match.title }, { label: 'Action', value: actionLabel },
        ...(action === 'RESCHEDULE' ? [{ label: 'Current due date', value: humanDate(match.nextDueDate) ?? 'Not scheduled' }] : []),
        ...(action !== 'RESCHEDULE' && dueDate ? [{ label: 'New due date', value: dueDate }] : []),
        ...(priority ? [{ label: 'New priority', value: priority }] : []),
        ...(action === 'RESCHEDULE' && match.isRecurring && match.frequency
          ? [{ label: 'Recurrence', value: `Repeats ${match.frequency.toLowerCase().replace(/_/g, ' ')}; only this next due date changes` }]
          : []),
        ...(assignee ? [{ label: 'Assignee', value: assignee.user.email }] : [])],
      // CONF-002/CONF-003: the only editable-field case maintenance v1
      // needs. `editAskConfirmation` below is the only place that ever
      // rebuilds this into a new version.
      editableFields: action === 'RESCHEDULE' && dueDate ? [{ key: 'nextDueDate', label: 'New due date', type: 'DATE' as const, value: dueDate }] : [],
      confirmLabel: `Confirm ${actionLabel}`, consentText: `I authorize this ${actionLabel} of the shared Maintenance record.`, expiresAt: expiresAt.toISOString(),
    }, suggestions: [],
  };
}

export function maintenanceMonitorSubject(message: string): string {
  return message.toLowerCase()
    .replace(/\b(?:notify|alert|remind|monitor|tell)\s+(?:me|us)?\b/g, ' ')
    .replace(/\b(?:when|before|about|for|my|our|the|is|are|comes?)\b/g, ' ')
    .replace(/\b(?:maintenance|task|due|upcoming|deadline|reminder)\b/g, ' ')
    .replace(/\b\d{1,2}\s*days?\s*(?:before|ahead)?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function loadAskViewState(executionId: string, userId: string): Promise<AskViewState | null> {
  const row = await prisma.askExecution.findFirst({ where: { id: executionId, userId }, select: { parametersJson: true } });
  const parameters = row?.parametersJson && typeof row.parametersJson === 'object' && !Array.isArray(row.parametersJson)
    ? row.parametersJson as { viewState?: unknown }
    : null;
  const viewState = parameters?.viewState;
  if (!viewState || typeof viewState !== 'object' || Array.isArray(viewState) || typeof (viewState as { resultId?: unknown }).resultId !== 'string') return null;
  return viewState as AskViewState;
}

// ASK_COZY_INTERACTION_MODEL_UI_FRD item 2 (view-state continuity): a
// declared filter chip's own message only conveys the NEW status/priority
// selection ("Only show overdue tasks") -- round 9's fix deliberately
// stopped concatenating the prior turn's raw text (that was the mechanism
// that kept a cleared status filter stuck). Re-inject only the PRIOR
// turn's own previously-parsed domain/date phrases here instead --
// reconstructing parser input from structured state, not concatenating
// conversation text -- so a status chip replaces only the status dimension
// while an established domain/date scope (e.g. HVAC, "this month")
// survives. "Clear all filters" explicitly opts out. Exported standalone
// (not inlined into maintenanceResult, which needs a live DB context to
// exercise at all) so this specific merge behavior is directly unit
// -testable.
export function mergeMaintenanceViewContinuation(
  priorViewState: (Pick<AskViewState, 'domainScopePhrase' | 'dateScopePhrase' | 'roomScopePhrase' | 'queryMessage'> & { statusFilter?: string }) | null | undefined,
  message: string,
  intent: 'FILTER' | 'REFRESH' | 'PAGINATION' = 'FILTER',
): { effectiveMessage: string; isClearAllFilters: boolean } {
  if (intent === 'PAGINATION' && priorViewState) {
    const statusPhrase = priorViewState.statusFilter === 'OVERDUE' ? 'overdue maintenance tasks'
      : priorViewState.statusFilter === 'DUE_SOON' ? 'maintenance tasks due soon'
        : priorViewState.statusFilter === 'URGENT' ? 'urgent maintenance tasks'
          : 'all open maintenance tasks';
    const restoredQuery = priorViewState.queryMessage
      ?? [priorViewState.domainScopePhrase, priorViewState.dateScopePhrase, priorViewState.roomScopePhrase, statusPhrase].filter(Boolean).join(' ');
    return { effectiveMessage: restoredQuery || message, isClearAllFilters: false };
  }
  // A refresh reads an existing view; it must not replay a historical UI command.
  const isClearAllFilters = intent === 'FILTER' && /\bclear all filters\b/i.test(message);
  // External review [P2]: roomScopePhrase joins domain/date here so a room
  // scope survives a status-chip continuation the same way they do,
  // instead of silently broadening to every room.
  const effectiveMessage = (priorViewState && !isClearAllFilters)
    ? [priorViewState.domainScopePhrase, priorViewState.dateScopePhrase, priorViewState.roomScopePhrase, message].filter(Boolean).join(' ')
    : message;
  return { effectiveMessage, isClearAllFilters };
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-014, FRD v1.74): the unfiltered open-task view is split by timing
// into Overdue / Due in the next 30 days / Later / No due date, so Maintenance can render as shelves (and the plain
// list shows the same groups). Each group keeps the incoming order and is paged on its own like any other section.
// A group with no tasks is left out; when there are no open tasks at all, the single "Pending and in progress"
// section is kept so the result still says so.
export function maintenanceOpenTimingGroups<T extends { nextDueDate: Date | null }>(
  records: T[],
  now: Date,
  dueSoonBoundary: Date,
): Array<{ id: string; title: string; records: T[] }> {
  const groups = [
    { id: 'overdue', title: 'Overdue', records: records.filter((task) => task.nextDueDate && task.nextDueDate < now) },
    { id: 'due-soon', title: 'Due in the next 30 days', records: records.filter((task) => task.nextDueDate && task.nextDueDate >= now && task.nextDueDate <= dueSoonBoundary) },
    { id: 'later', title: 'Later', records: records.filter((task) => task.nextDueDate && task.nextDueDate > dueSoonBoundary) },
    { id: 'no-due-date', title: 'No due date', records: records.filter((task) => !task.nextDueDate) },
  ].filter((group) => group.records.length > 0);
  return groups.length ? groups : [{ id: 'open', title: 'Pending and in progress', records }];
}

// IW-PRES-014: the shelf-card facts for one maintenance record, taken from the same fields as its meta line. Overdue
// is critical and due within 30 days is a caution; nothing else is coloured.
export function maintenanceShelfFacts(input: {
  kind: 'OPEN' | 'COMPLETED' | 'CANCELLED';
  nextDueDate: Date | null;
  lastCompletedDate: Date | null;
  updatedAt: Date;
  cost: string | null;
  now: Date;
  dueSoonBoundary: Date;
  formatDate: (value: Date) => string;
}): { tone: 'DEFAULT' | 'CAUTION' | 'CRITICAL'; timingLabel: string; amountLabel: string | null } {
  const { kind, nextDueDate, now } = input;
  const overdue = kind === 'OPEN' && Boolean(nextDueDate && nextDueDate < now);
  const dueSoon = kind === 'OPEN' && Boolean(nextDueDate && nextDueDate >= now && nextDueDate <= input.dueSoonBoundary);
  const timingLabel = kind === 'COMPLETED'
    ? input.lastCompletedDate ? `Done ${input.formatDate(input.lastCompletedDate)}` : 'Completion date not recorded'
    : kind === 'CANCELLED' ? `Cancelled ${input.formatDate(input.updatedAt)}`
      : nextDueDate ? `${overdue ? 'Was due' : 'Due'} ${input.formatDate(nextDueDate)}` : 'No due date';
  return {
    tone: overdue ? 'CRITICAL' : dueSoon ? 'CAUTION' : 'DEFAULT',
    timingLabel,
    amountLabel: input.cost ? `${kind === 'COMPLETED' ? 'Spent' : 'Est.'} ${input.cost}` : null,
  };
}

export function resolveMaintenanceCollectionOffset(
  totalCount: number,
  currentOffset: number,
  direction: 'CURRENT' | 'NEXT' | 'PREVIOUS',
): number {
  const requested = direction === 'NEXT' ? currentOffset + MAX_RESULT_ITEMS
    : direction === 'PREVIOUS' ? currentOffset - MAX_RESULT_ITEMS
      : currentOffset;
  const lastPageOffset = Math.max(0, Math.floor(Math.max(0, totalCount - 1) / MAX_RESULT_ITEMS) * MAX_RESULT_ITEMS);
  return Math.min(Math.max(0, requested), lastPageOffset);
}

export async function maintenanceResult(
  userId: string,
  propertyId: string,
  message: string,
  priorViewState: AskViewState | null | undefined,
  context: MaintenanceTaskContext,
  seasonalContext: SeasonalChecklistContext | null,
  seasonalContextAvailable: boolean,
  viewIntent: 'FILTER' | 'REFRESH' | 'PAGINATION' = 'FILTER',
  pageRequest?: { sectionId: string; direction: 'NEXT' | 'PREVIOUS' } | null,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const now = new Date();
  // External review [P1] follow-up (MAINT-003/A02): filter membership and
  // totals must reflect the canonical FULL collection, with limits applied
  // only to what's displayed -- the composed skill context's own task data
  // cannot be that source (it's necessarily bounded to the platform's
  // 100-entity ceiling; see maintenanceTaskContext.provider.ts). Fetching
  // the canonical set directly here means a property with, say, 101
  // matching urgent tasks reports 101 and can still surface any of them,
  // not just whichever 100 happened to fit in the bounded context.
  const canonicalTaskSet = await loadCanonicalMaintenanceTaskSet(userId, propertyId);
  const tasks: MaintenanceTaskContextTask[] = [...canonicalTaskSet.active, ...canonicalTaskSet.historical];
  const timeZone = safeTimezone(context.propertyTimezone);
  const seasonalResult = buildSeasonalMaintenanceResult({
    message,
    propertyId,
    propertyTimezone: timeZone,
    context: seasonalContext,
    contextAvailable: seasonalContextAvailable,
    now,
  });
  if (seasonalResult) return seasonalResult;
  const { effectiveMessage, isClearAllFilters } = mergeMaintenanceViewContinuation(priorViewState, message, viewIntent);
  const { timeframe, missingPurchaseDate } = resolveMaintenanceTimeframe(effectiveMessage, now, timeZone, context.purchaseDate);
  const wantsCompleted = /\b(?:completed|finished|done|completion|service history|what did (?:i|we) complete)\b/i.test(effectiveMessage);
  const wantsOpen = /\b(?:pending|remaining|still|open|overdue|due|upcoming|coming up|needs review|in progress|high priority|highest priority|priority tasks?|before (?:winter|spring|summer|fall|autumn))\b/i.test(effectiveMessage);
  const includeCancelled = /\b(?:cancelled|canceled|archived|dismissed|all records|including cancelled|including canceled)\b/i.test(effectiveMessage);
  const cancelledOnly = /\b(?:cancelled|canceled|archived|dismissed)\b/i.test(effectiveMessage)
    && !/\b(?:including cancelled|including canceled|all records)\b/i.test(effectiveMessage);
  const overdueOnly = /\boverdue|past due\b/i.test(effectiveMessage);
  const dueSoonOnly = /\bdue soon|coming up|upcoming|what(?:'s| is) due\b/i.test(effectiveMessage);
  const highPriorityOnly = /\b(?:urgent|high priority|highest priority|priority tasks?)\b/i.test(effectiveMessage);
  const creationFocus = /\b(?:create|add|schedule|set up)\b.{0,30}\b(?:maintenance(?: task)?|tasks?)\b/i.test(effectiveMessage);
  const scopeTerms = maintenanceScopeTerms(effectiveMessage);
  const normalizedMessage = effectiveMessage.toLowerCase();
  const roomScope = [...new Set(tasks.map((task) => task.room?.name?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => right.length - left.length)
    .find((roomName) => normalizedMessage.includes(roomName.toLowerCase())) ?? null;
  const scoped = tasks.filter((task) =>
    (!scopeTerms.length || scopeTerms.some((term) => maintenanceTaskText(task).includes(term)))
    && (!roomScope || task.room?.name === roomScope));

  const active = scoped.filter((task) => task.status !== MaintenanceTaskStatus.COMPLETED && task.status !== MaintenanceTaskStatus.CANCELLED);
  const completed = scoped.filter((task) => task.status === MaintenanceTaskStatus.COMPLETED);
  const cancelled = scoped.filter((task) => task.status === MaintenanceTaskStatus.CANCELLED);
  const dueSoonBoundary = new Date(now.getTime() + 30 * 86_400_000);
  // In a mixed query such as “completed this year and everything still
  // pending,” the time phrase qualifies completion history only.
  const openTimeframe = wantsCompleted && wantsOpen ? null : timeframe;
  const matchesPendingDate = (task: typeof active[number]) => {
    if (overdueOnly) return Boolean(task.nextDueDate && task.nextDueDate < now);
    if (openTimeframe) return Boolean(task.nextDueDate && openTimeframe.matches(task.nextDueDate));
    if (dueSoonOnly) return Boolean(task.nextDueDate && task.nextDueDate >= now && task.nextDueDate <= dueSoonBoundary);
    return true;
  };
  const filteredActive = active.filter(matchesPendingDate).filter((task) => !highPriorityOnly || ['URGENT', 'HIGH'].includes(task.priority));
  const filteredCompleted = completed.filter((task) => !timeframe || Boolean(task.lastCompletedDate && timeframe.matches(task.lastCompletedDate)))
    .filter((task) => !highPriorityOnly || ['URGENT', 'HIGH'].includes(task.priority));
  const showCompleted = !cancelledOnly && (wantsCompleted || (!wantsOpen && !creationFocus));
  const showOpen = !cancelledOnly && (wantsOpen || (!wantsCompleted && !creationFocus) || (wantsCompleted && wantsOpen));
  // FRD ASK_COZY_INTERACTION_MODEL_UI_FRD §9.3/§11 (HAND-001/002): the
  // Maintenance page reads `priority=true`, `filter=overdue`, and now also
  // `filter=due-soon` and `system=<phrase>` (MaintenancePageClient.tsx /
  // taskDisplay.ts, added for this handoff). Date-range ("this month") and
  // room scope still have no destination-page equivalent and are disclosed
  // in the block description below instead (HAND-002: acknowledge, don't
  // silently drop) rather than silently ignored on arrival.
  const maintenanceHrefParams = new URLSearchParams({ propertyId });
  if (highPriorityOnly) maintenanceHrefParams.set('priority', 'true');
  if (overdueOnly) maintenanceHrefParams.set('filter', 'overdue');
  else if (dueSoonOnly) maintenanceHrefParams.set('filter', 'due-soon');
  // External review [P1]: sending only scopeTerms[0] ("hvac") meant a
  // furnace/air-conditioner/heat-pump/boiler task that matched Ask's own
  // OR-of-synonyms scope could vanish from the Maintenance page, which
  // only checked the literal word "hvac". Sending the whole alias group
  // lets splitAndSortTasks match on any of the same synonyms Ask itself
  // used, closing most of the gap within the fields the Maintenance page
  // actually has client-side (category/room/season are not among them --
  // disclosed below, not silently dropped).
  if (scopeTerms.length) maintenanceHrefParams.set('system', scopeTerms.join(','));
  const maintenanceHref = `/dashboard/maintenance?${maintenanceHrefParams.toString()}`;
  const canManage = access.role !== HouseholdRole.VIEWER;

  const recordItem = (task: typeof tasks[number], kind: 'OPEN' | 'COMPLETED' | 'CANCELLED') => {
    const overdue = kind === 'OPEN' && task.nextDueDate && task.nextDueDate < now;
    const cost = kind === 'COMPLETED' ? maintenanceMoney(task.actualCost) : maintenanceMoney(task.estimatedCost);
    return {
      id: task.id,
      title: formatAskMaintenanceTitle(task.title),
      description: formatAskMaintenanceDescription(task),
      status: overdue ? 'OVERDUE' : task.status,
      meta: [
        formatAskMaintenanceScope({ inventoryItemName: task.inventoryItem?.name, roomName: task.room?.name, category: task.category, assetType: task.assetType }),
        kind === 'COMPLETED'
          ? task.lastCompletedDate ? `Completed ${maintenanceDate(task.lastCompletedDate, timeZone)}` : 'Completion date not recorded'
          : kind === 'CANCELLED' ? `Cancelled · updated ${maintenanceDate(task.updatedAt, timeZone)}`
            : task.nextDueDate ? `${overdue ? 'Was due' : 'Due'} ${maintenanceDate(task.nextDueDate, timeZone)}` : 'Due date not recorded',
        `${task.priority.toLowerCase()} priority`,
        task.source.toLowerCase().replace(/_/g, ' '),
        cost ? `${kind === 'COMPLETED' ? 'Actual' : 'Estimated'} cost ${cost}` : null,
        task.isRecurring && task.frequency ? `Repeats ${task.frequency.toLowerCase().replace(/_/g, ' ')}` : null,
      ].filter((value): value is string => Boolean(value)),
      href: `${maintenanceHref}&taskId=${encodeURIComponent(task.id)}&from=ask`,
      // ASK_COZY_INTERACTION_MODEL_UI_FRD §9.2 (MAINT-005/006): item-level
      // Complete/Reschedule -- entityType/id let the frontend send these
      // back as launchContext, which launchMaintenanceTaskId resolves to
      // this exact task (bypassing free-text fuzzy matching entirely).
      entityType: kind === 'OPEN' ? 'MAINTENANCE_TASK' : null,
      // MAINT-008: "Why is this important?" is a read-only grounded
      // continuation, not a mutation -- available to a VIEWER too, unlike
      // Complete/Reschedule. Left unforced (no MUTATE_RECORD-style
      // operationId pinning) so it goes through ordinary grounded-guidance
      // routing, which needs to actually reason about the question.
      actions: kind === 'OPEN' ? [
        { id: 'why-important', label: 'Why is this important?', message: `Why is "${formatAskMaintenanceTitle(task.title)}" important?`, style: 'QUIET' as const, interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'GROUNDED_GUIDANCE' },
        ...(canManage ? [
          { id: 'complete', label: 'Complete', message: 'Complete this maintenance task.', style: 'PRIMARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'MAINTENANCE_TASK_COMPLETE' },
          { id: 'reschedule', label: 'Reschedule', message: 'Reschedule this maintenance task.', style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'MAINTENANCE_TASK_UPDATE' },
        ] : []),
      ] : [],
      ...maintenanceShelfFacts({
        kind, nextDueDate: task.nextDueDate, lastCompletedDate: task.lastCompletedDate, updatedAt: task.updatedAt,
        cost, now, dueSoonBoundary, formatDate: (value) => maintenanceDate(value, timeZone),
      }),
    };
  };

  const requestedOffsets = viewIntent === 'PAGINATION' ? { ...(priorViewState?.collectionOffsets ?? {}) } : {};
  const normalizedOffsets: Record<string, number> = {};
  const sections = [
    ...(showOpen ? (overdueOnly || dueSoonOnly || openTimeframe ? [{
      id: overdueOnly ? 'overdue' : 'due',
      title: overdueOnly ? 'Overdue' : `Due ${openTimeframe?.label ?? 'within 30 days'}`,
      records: filteredActive, kind: 'OPEN' as const,
    }] : maintenanceOpenTimingGroups(filteredActive, now, dueSoonBoundary).map((group) => ({ ...group, kind: 'OPEN' as const }))) : []),
    ...(showCompleted ? [{ id: 'completed', title: `Completed${timeframe ? ` ${timeframe.label}` : ''}`, records: filteredCompleted, kind: 'COMPLETED' as const }] : []),
    ...(includeCancelled ? [{ id: 'cancelled', title: 'Cancelled', records: cancelled, kind: 'CANCELLED' as const }] : []),
  ].map((section) => {
    const direction = pageRequest?.sectionId === section.id ? pageRequest.direction : 'CURRENT';
    const offset = resolveMaintenanceCollectionOffset(section.records.length, requestedOffsets[section.id] ?? 0, direction);
    normalizedOffsets[section.id] = offset;
    return {
      id: section.id, title: section.title, count: section.records.length, offset,
      items: section.records.slice(offset, offset + MAX_RESULT_ITEMS).map((task) => recordItem(task, section.kind)),
    };
  });
  const displayed = sections.reduce((sum, section) => sum + section.count, 0);
  const overdueCount = active.filter((task) => task.nextDueDate && task.nextDueDate < now).length;
  const unscheduledCount = active.filter((task) => !task.nextDueDate).length;
  const dueSoonCount = active.filter((task) => task.nextDueDate && task.nextDueDate >= now && task.nextDueDate <= dueSoonBoundary).length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'maintenance-summary',
    // External review [P2]: "No recorded maintenance tasks" and "tasks
    // exist but none match these filters" both used to render as the same
    // "No matching maintenance records were found," contrary to the
    // required lifecycle distinction -- canonicalTaskSet.totalTaskCount (the
    // true canonical total; tasks/active/completed/etc. above are now
    // always the full collection, never a provider-bounded subset, per
    // MAINT-003/A02) distinguishes a property with zero tasks ever from one
    // where the active filters simply matched nothing.
    title: creationFocus
      ? canManage ? 'Create the task in Maintenance' : 'A contributor or owner can create this task'
      : displayed
        ? `${displayed} maintenance record${displayed === 1 ? '' : 's'} match this request`
        : canonicalTaskSet.totalTaskCount === 0
          ? 'No maintenance tasks are recorded for this home yet'
          : 'No maintenance tasks match these filters',
    body: creationFocus
      ? 'Ask has not created anything. The Maintenance workflow collects the schedule, recurrence, priority, and any system link before saving.'
      // External review [P1] follow-up (MAINT-003/A02): tasks/active/
      // completed/overdueCount above are now computed from
      // loadCanonicalMaintenanceTaskSet's full, uncapped fetch (not the
      // composed skill context's necessarily-bounded task data), so these
      // counts are always the true canonical totals for the selected
      // scope -- no truncation caveat is needed or honest to add here
      // anymore.
      : `${active.length} open, ${completed.length} completed, and ${overdueCount} overdue task${overdueCount === 1 ? '' : 's'} are recorded in the selected scope. ${unscheduledCount ? `${unscheduledCount} open task${unscheduledCount === 1 ? ' has' : 's have'} no due date. ` : ''}${includeCancelled ? 'Cancelled records are included.' : 'Cancelled records are excluded by default.'}`,
    tone: overdueCount ? 'CAUTION' : 'DEFAULT',
    // IW-CALM-001/011 (FRD v1.111): the answer as one sentence and one supporting line, from the same counts as the chips.
    // Completed work is described once, as hidden, and is not mixed into the headline.
    ...(!creationFocus && displayed ? maintenanceCalmCopy({
      overdueCount, dueSoonCount, openCount: active.length, unscheduledCount,
      hiddenCompletedCount: showCompleted ? 0 : completed.length,
    }) : {}),
    // IW-PRES-013: answer-first chips, from the same counts as the body above.
    ...(!creationFocus && displayed ? { chips: [
      { label: `${overdueCount} overdue`, tone: overdueCount ? 'CRITICAL' as const : 'DEFAULT' as const },
      { label: `${dueSoonCount} due in 30 days`, tone: dueSoonCount ? 'CAUTION' as const : 'DEFAULT' as const },
      { label: `${active.length} open`, tone: 'DEFAULT' as const },
    ] } : {}),
    actions: creationFocus && canManage
      ? [
        { id: 'create-maintenance', label: 'Create maintenance task', interactionType: 'START_WORKFLOW', message: 'Create a maintenance task', operationId: 'MAINTENANCE_TASK_CREATE', style: 'PRIMARY' },
        { id: 'open-maintenance-setup', label: 'Open Maintenance Setup', href: `/dashboard/maintenance-setup?propertyId=${encodeURIComponent(propertyId)}&from=ask`, style: 'SECONDARY' },
      ]
      : [
        { id: 'open-maintenance', label: 'Open maintenance', href: maintenanceHref, style: 'PRIMARY' },
        ...(missingPurchaseDate ? [{ id: 'add-purchase-date', label: 'Add purchase date', href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/financing/profile`, style: 'SECONDARY' as const }] : []),
      ],
  }];
  if (!creationFocus) blocks.push({
    type: 'GROUPED_LIST',
    // ASK_COZY_INTERACTION_MODEL_UI_FRD §7 (ACT-001 FILTER_RESULT): declared
    // filter chips, not text the homeowner has to type. Each message is
    // exactly a phrasing askFollowUpContext.ts's FILTER_CONTINUATION_PATTERN
    // already recognizes, so a click reuses the existing filter-refinement
    // pipeline (server-side full-collection re-query, RES-003 duplicate-card
    // suppression) rather than a new dispatch path.
    // ASK_COZY_INTERACTION_MODEL_UI_FRD item 2: All open/Overdue/Due soon/
    // Urgent replace only the status/priority dimension, retaining any
    // established domain/date scope (see effectiveMessage above) --
    // "Clear all filters" is the one control that resets everything,
    // offered only when there is a domain/date/room scope actually worth
    // clearing (otherwise it would be redundant with "All open").
    filters: [
      { id: 'all', label: 'All open', message: 'Now show all open maintenance tasks', active: !overdueOnly && !dueSoonOnly && !highPriorityOnly },
      { id: 'overdue', label: 'Overdue', message: 'Only show overdue tasks', active: overdueOnly },
      { id: 'due-soon', label: 'Due soon', message: 'Only show tasks due soon', active: dueSoonOnly },
      { id: 'urgent', label: 'Urgent', message: 'Only show urgent tasks', active: highPriorityOnly },
      // External review [P2]: a room-only result (no domain/date scope)
      // used to omit this chip entirely, even though a real filter (room)
      // was active and worth clearing.
      ...(scopeTerms.length || timeframe || roomScope ? [{ id: 'clear-all', label: 'Clear all filters', message: 'Clear all filters and show all open maintenance tasks', active: false }] : []),
    ],
    id: 'maintenance-groups', title: 'Maintenance record',
    // IW-PRES-014 / IW-PRES-022: Maintenance is the first shelves adopter (FRD v1.74).
    presentation: { pattern: 'SHELVES' },
    // MAINT-003/MAINT-004: label every applied filter, including priority --
    // "urgent" here is the existing canonical interpretation (URGENT or HIGH
    // priority, not URGENT alone), so it is labeled accurately rather than
    // implying a narrower or newly-invented urgency score.
    description: `${highPriorityOnly ? 'Priority filter: urgent and high priority. ' : ''}${timeframe ? `Date filter: ${timeframe.label} in ${timeZone}. ` : ''}${scopeTerms.length ? `System/category filter: ${scopeTerms[0]}. ` : ''}${roomScope ? `Room filter: ${roomScope}. ` : ''}Showing ${MAX_RESULT_ITEMS}-item server pages when a section exceeds that size.${
      // ASK_COZY_INTERACTION_MODEL_UI_FRD HAND-002: the Maintenance page
      // now receives priority/overdue/due-soon/system, but has no
      // date-range or room filter UI at all -- disclose that explicitly
      // rather than letting "Open Maintenance" silently drop them.
      (timeframe || roomScope) ? ` ${[timeframe && 'the date filter', roomScope && 'the room filter'].filter(Boolean).join(' and ')} will not carry over to the Maintenance page.` : ''
    }${
      // External review [P1]/HAND-002/A16: the system/category filter DOES
      // carry over (unlike date/room above), but as an approximate keyword
      // match against different fields than Ask itself checks (category,
      // room, and season aren't available to the Maintenance page's own
      // filter) -- disclosed as an approximation rather than implying an
      // exact, guaranteed-identical result set on both sides.
      scopeTerms.length ? ' The system/category filter carries over as an approximate keyword match there, so a few tasks may appear or disappear.' : ''
    }`,
    // MAINT-003: "+N more" (AskWorkspace's GROUPED_LIST renderer) always
    // links off actions[0] -- previously that was the conditional
    // "Create a task" action (or nothing for a VIEWER), so any section past
    // MAX_RESULT_ITEMS had no real full-result access. A dedicated
    // view-all-in-filter link is always first now; "Create a task" (when
    // permitted) stays available as a secondary action.
    sections, actions: [
      { id: 'view-all-maintenance', label: 'View all in Maintenance', href: maintenanceHref, style: 'SECONDARY' },
      ...(canManage ? [
        { id: 'create-maintenance', label: 'Create a task', interactionType: 'START_WORKFLOW' as const, message: 'Create a maintenance task', operationId: 'MAINTENANCE_TASK_CREATE', style: 'PRIMARY' as const },
        { id: 'open-maintenance-setup', label: 'Maintenance Setup', href: `/dashboard/maintenance-setup?propertyId=${encodeURIComponent(propertyId)}&from=ask`, style: 'SECONDARY' as const },
      ] : []),
    ],
  });
  const evidenceTasks = [...new Map([...filteredActive, ...filteredCompleted, ...(includeCancelled ? cancelled : [])].map((task) => [task.id, task])).values()];
  if (evidenceTasks.length) blocks.push({
    type: 'EVIDENCE', id: 'maintenance-evidence', title: 'Task sources and freshness',
    items: evidenceTasks.slice(0, 30).map((task) => ({
      label: formatAskMaintenanceTitle(task.title), source: `Maintenance · ${task.source.toLowerCase().replace(/_/g, ' ')}`, observedAt: task.updatedAt.toISOString(),
    })),
  });
  if (missingPurchaseDate) blocks.push({
    type: 'BOUNDARY', id: 'maintenance-purchase-date-missing', title: 'Purchase date is not recorded',
    body: 'Ask could not apply “since I bought the home,” so the list is unbounded by purchase date. Add the property purchase date in the financing profile, then run this question again.',
    severity: 'CAUTION', suggestions: [],
  });
  blocks.push({
    type: 'BOUNDARY', id: 'maintenance-record-boundary', title: 'Based on recorded tasks',
    body: 'An empty or completed task list is not a professional inspection or proof that no maintenance is needed. Unrecorded work and systems without tasks are outside this result.',
    severity: 'INFO', suggestions: [],
  });

  // ASK_COZY_INTERACTION_MODEL_UI_FRD NEXT-001/NEXT-002/A21: these were
  // unconditional -- offered even to a VIEWER who cannot create a task
  // (unauthorized), even with zero overdue/due-soon tasks to show
  // (unavailable), and even when the current query already applied that
  // exact filter (redundant). Gate each on whether it would actually do
  // something useful; an empty array is a legitimate outcome (A21).
  const hasOverdueTask = active.some((task) => task.nextDueDate && task.nextDueDate < now);
  const hasDueSoonTask = active.some((task) => task.nextDueDate && task.nextDueDate >= now && task.nextDueDate <= dueSoonBoundary);
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001-005/FRESH-001: stamp this
  // turn's view state -- resultId carried forward unchanged (or minted
  // fresh for a genuinely new query, including an explicit "clear all"),
  // domain/date phrases taken from what actually matched in effectiveMessage
  // (so they reflect this turn's real, current scope, ready to carry into
  // the next), statusFilter derived in the same precedence the chips
  // display, selectedTaskId untouched by a filter change, revision bumped
  // so a stale response can be detected by comparing against it.
  const statusFilter: string = overdueOnly ? 'OVERDUE' : dueSoonOnly ? 'DUE_SOON' : highPriorityOnly ? 'URGENT' : 'ALL_OPEN';
  const viewState: AskViewState = {
    resultId: priorViewState?.resultId ?? randomUUID(),
    domainScopePhrase: scopeTerms[0] ?? null,
    dateScopePhrase: timeframe?.label ?? null,
    // External review [P2]: stored so a later status-chip continuation can
    // carry it forward via mergeMaintenanceViewContinuation, matching
    // domain/date. Derived from roomScope, which by this point reflects
    // effectiveMessage (already including any merged-forward room phrase,
    // same as domainScopePhrase/dateScopePhrase above), so it naturally
    // resets on "Clear all filters" exactly like they do, with no separate
    // special case needed.
    roomScopePhrase: roomScope,
    statusFilter,
    selectedTaskId: isClearAllFilters ? null : priorViewState?.selectedTaskId ?? null,
    queryMessage: viewIntent === 'PAGINATION' ? priorViewState?.queryMessage ?? effectiveMessage : effectiveMessage,
    collectionOffsets: normalizedOffsets,
    revision: (priorViewState?.revision ?? 0) + 1,
  };
  return {
    status: missingPurchaseDate ? 'READY_WITH_LIMITATIONS' : creationFocus ? (canManage ? 'READY_WITH_LIMITATIONS' : 'BLOCKED') : 'ANSWERED',
    reasonCode: missingPurchaseDate ? 'MAINTENANCE_PURCHASE_DATE_MISSING' : creationFocus ? (canManage ? 'MAINTENANCE_WORKFLOW_REQUIRED' : 'ASK_PERMISSION_REQUIRED') : undefined,
    contextVersion: createHash('sha256').update(JSON.stringify(tasks.map((task) => ({ id: task.id, status: task.status, updatedAt: task.updatedAt })))).digest('hex'),
    parameters: { viewState },
    blocks,
    suggestions: [
      ...(hasOverdueTask && !overdueOnly ? ['Show overdue tasks only'] : []),
      ...(hasDueSoonTask && !dueSoonOnly ? ['What maintenance is due soon?'] : []),
      ...(canManage && !creationFocus ? ['Create a maintenance task'] : []),
    ],
  };
}

// Ask Cozy Stage 3, Phase 7 (implementation plan §13; FRD §31 "additional
// maintenance intelligence" candidate). Reads maintenancePrediction
// .service.ts's rule-based forecast (MaintenancePrediction rows,
// HVAC/ROOF/WATER_HEATER interval rules against verified inventory items)
// -- distinct from maintenanceResult above, which only reads homeowner-
// created/scheduled PropertyMaintenanceTask rows. Deliberately NOT a
// duplicate of HOME_ACTIONS: confirmed by reading homeActionsResult/
// getHomeActionFeed that maintenancePrediction.service.ts has zero
// references there or anywhere in the Personalization pipeline -- this is
// a fully standalone, previously-unconnected surface, not a second
// ranked action source.
const MAINTENANCE_FORECAST_PRIORITY_LABELS: Record<number, string> = {
  5: 'Critical', 4: 'High', 3: 'Medium', 2: 'Low', 1: 'Monitor',
};

async function maintenanceForecastResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/maintenance`;

  let predictions = await listForecast(propertyId);
  // listForecast never lazily generates (confirmed by reading it) -- unlike
  // Coverage Comparison's own getOrCreateCoverageComparison, an empty
  // result here could mean "never generated" rather than "genuinely
  // nothing to forecast." generateForecast is cheap, deterministic, and
  // local-only (verified by reading its implementation -- no external
  // calls, dedup'd via an in-flight map), so materializing it once as part
  // of this read follows the same precedent Coverage Comparison already
  // established, rather than answering a stale empty state.
  if (predictions.length === 0) {
    await generateForecast(propertyId);
    predictions = await listForecast(propertyId);
  }

  if (predictions.length === 0) {
    return {
      status: 'NOT_APPLICABLE',
      reasonCode: 'MAINTENANCE_FORECAST_NO_VERIFIED_SYSTEMS',
      blocks: [{
        type: 'EMPTY_STATE',
        id: 'maintenance-forecast-empty',
        title: 'No maintenance forecast available yet',
        body: 'Ask found no verified HVAC, roof, or water-heater inventory items to forecast maintenance for. Verify these items in your inventory to unlock predictions.',
        actions: [{ id: 'open-maintenance', label: 'Open Maintenance', href, style: 'PRIMARY' }],
      }],
      suggestions: ['What maintenance is pending?'],
    };
  }

  const overdueCount = predictions.filter((prediction) => prediction.status === 'OVERDUE').length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: 'maintenance-forecast-summary',
    title: `${predictions.length} predicted maintenance item${predictions.length === 1 ? '' : 's'}`,
    body: overdueCount
      ? `${overdueCount} already overdue based on this forecast.`
      : `Next predicted: ${predictions[0].taskName} around ${humanDate(predictions[0].predictedDate)}.`,
    tone: overdueCount ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-maintenance', label: 'Open Maintenance', href, style: 'SECONDARY' }],
  }, {
    type: 'GROUPED_LIST', filters: [],
    id: 'maintenance-forecast-items',
    title: 'Predicted maintenance',
    description: 'A rule-based forecast for verified HVAC, roof, and water-heater inventory items -- not a substitute for a professional inspection.',
    sections: [{
      id: 'maintenance-forecast-all',
      title: overdueCount ? 'Predicted or overdue' : 'Predicted',
      count: predictions.length,
      items: predictions.slice(0, 20).map((prediction) => ({
        id: prediction.id,
        title: prediction.taskName,
        description: prediction.reasoning ?? null,
        meta: [
          prediction.inventoryItem?.name ?? null,
          MAINTENANCE_FORECAST_PRIORITY_LABELS[prediction.priority] ?? `Priority ${prediction.priority}`,
          `${prediction.status === 'OVERDUE' ? 'Overdue since' : 'Predicted'} ${humanDate(prediction.predictedDate)}`,
        ].filter((value): value is string => Boolean(value)),
        status: prediction.status,
        href,
      })),
    }],
    actions: [],
  }, {
    type: 'BOUNDARY',
    id: 'maintenance-forecast-boundary',
    title: 'Rule-based forecast, not a professional inspection',
    body: 'These predictions come from typical service-interval rules for verified equipment, not a diagnosis of this specific unit\'s current condition.',
    severity: 'INFO',
    suggestions: [],
  }];

  return {
    status: 'ANSWERED',
    reasonCode: overdueCount ? 'MAINTENANCE_FORECAST_HAS_OVERDUE' : 'MAINTENANCE_FORECAST_READY',
    contextVersion: createHash('sha256').update(JSON.stringify(predictions.map((prediction) => ({ id: prediction.id, status: prediction.status, updatedAt: prediction.updatedAt })))).digest('hex'),
    blocks,
    suggestions: ['What maintenance is pending?'],
  };
}

registerCapabilityHandler('maintenance.create', async (envelope) => maintenanceTaskCreateResult(envelope.userId, envelope.propertyId!, envelope.message, undefined, envelope.launchContext?.sourceExecutionId ?? null));

registerCapabilityHandler('maintenance.status', async (envelope, deps) => {
  const composedContext = deps.composedContext!;
  const seasonalEntry = composedContext.entries.find(
    (entry) => entry.key === skillContextProviderKey(SEASONAL_CHECKLIST_CONTEXT_PROVIDER),
  );
  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001-005: a declared filter chip
  // names the exact execution it was rendered on (round 9) -- look up its
  // stored view state so maintenanceResult can merge the carried-over
  // domain/date scope with the chip's own status change.
  const priorViewState = envelope.launchContext?.sourceExecutionId
    ? await loadAskViewState(envelope.launchContext.sourceExecutionId, envelope.userId)
    : null;
  const pageRequest = envelope.launchContext?.entityType === 'ASK_COLLECTION_SECTION'
    && envelope.launchContext.entityId
    && (envelope.launchContext.actionId === 'NEXT_PAGE' || envelope.launchContext.actionId === 'PREVIOUS_PAGE')
    ? { sectionId: envelope.launchContext.entityId, direction: envelope.launchContext.actionId === 'NEXT_PAGE' ? 'NEXT' as const : 'PREVIOUS' as const }
    : null;
  return maintenanceResult(
    envelope.userId,
    envelope.propertyId!,
    envelope.message,
    priorViewState,
    composedContext.values[skillContextProviderKey(MAINTENANCE_TASK_CONTEXT_PROVIDER)] as MaintenanceTaskContext,
    (composedContext.values[skillContextProviderKey(SEASONAL_CHECKLIST_CONTEXT_PROVIDER)] as SeasonalChecklistContext | undefined) ?? null,
    seasonalEntry?.status === 'AVAILABLE',
    pageRequest ? 'PAGINATION' : envelope.launchContext?.surface === 'ASK_REFRESH' ? 'REFRESH' : 'FILTER',
    pageRequest,
  );
});

registerCapabilityHandler('maintenance.forecast', async (envelope) => maintenanceForecastResult(envelope.userId, envelope.propertyId!));
