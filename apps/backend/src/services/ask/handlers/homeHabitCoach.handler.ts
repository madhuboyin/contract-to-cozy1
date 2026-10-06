// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { HouseholdRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { humanDate, readableCode } from '../askFormatting';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { analyticsEmitter, AnalyticsEvent, AnalyticsFeature, AnalyticsModule } from '../../analytics';
import { HomeHabitCoachService } from '../../homeHabitCoach/homeHabitCoachService';

// Home Habit Coach capability-card slice (FRD v1.53): the fifth new operation for a capability with none. Reads
// listActiveHabits with the page's own options (snoozed included, first 50, ranked by rankHabits). A pure read: it
// never generates habits.
//
// Each habit opens an inline review (the same read, launched with launchContext.entityType HOME_HABIT), the Ask
// counterpart of the maintenance task review. Its declared actions (add to routine, mark done, snooze, skip, stop
// suggesting) are HOME_HABIT_UPDATE: non-routable, confirmation-gated, calling the same service methods as the Home
// Habit Coach page. Generating habits stays on that page, so only the empty state still links to it.
type HomeHabitsView = Awaited<ReturnType<HomeHabitCoachService['listActiveHabits']>>;
export const HOME_HABITS_ASK_LIMIT = 50;

export const HOME_HABIT_ENTITY_TYPE = 'HOME_HABIT';

// The pinned messages a declared action sends; the action itself is read from the message, never guessed.
export const HABIT_ACTION_MESSAGES = {
  ADOPT: 'Add this habit to my maintenance routine.',
  COMPLETE: 'Mark this habit done.',
  SNOOZE: 'Snooze this habit for a week.',
  SKIP: 'Skip this habit for now.',
  DISMISS: 'Stop suggesting this habit.',
} as const;
export type HabitAction = keyof typeof HABIT_ACTION_MESSAGES;

const HABIT_ACTIONS: readonly HabitAction[] = ['ADOPT', 'COMPLETE', 'SNOOZE', 'SKIP', 'DISMISS'];
const HABIT_ACTION_LABELS: Record<HabitAction, string> = {
  ADOPT: 'Add to my routine', COMPLETE: 'Mark done', SNOOZE: 'Snooze for a week', SKIP: 'Skip for now', DISMISS: 'Stop suggesting',
};
const HABIT_ACTION_TARGET_STATUS: Record<Exclude<HabitAction, 'ADOPT'>, string> = { COMPLETE: 'COMPLETED', SNOOZE: 'SNOOZED', SKIP: 'SKIPPED', DISMISS: 'DISMISSED' };
const HABIT_SNOOZE_PRESET = '7d';

export function habitActionFromMessage(message: string): HabitAction | null {
  const trimmed = message.trim();
  return HABIT_ACTIONS.find((action) => HABIT_ACTION_MESSAGES[action] === trimmed) ?? null;
}

const habitsBackAction = () => ({
  id: 'habits-back-to-list', label: 'Back to my habits', interactionType: 'START_WORKFLOW' as const,
  message: 'Show my home habits', operationId: 'HOME_HABITS', style: 'SECONDARY' as const,
});

// Pure. Mirrors the service's own status rules (VALID_STATUSES_FOR and adoptHabit's eligibility) so the review only
// offers what the service will accept; the service still enforces them at write time. An adopted habit is owned by its
// maintenance task (the service refuses to complete or snooze it), so it offers nothing here.
export function habitActionsAllowed(habit: any): HabitAction[] {
  if (habit.linkedMaintenanceTaskId) return [];
  const status = String(habit.status);
  const template = habit.habitTemplate ?? {};
  const allowed: HabitAction[] = [];
  if (template.safetyTier === 'LOW_CONSEQUENCE' && template.cadence !== 'AD_HOC') allowed.push('ADOPT');
  if (['ACTIVE', 'SNOOZED'].includes(status)) allowed.push('COMPLETE');
  if (status === 'ACTIVE') allowed.push('SNOOZE');
  if (['ACTIVE', 'SNOOZED'].includes(status)) allowed.push('SKIP');
  if (['ACTIVE', 'SNOOZED', 'SKIPPED'].includes(status)) allowed.push('DISMISS');
  return allowed;
}

export const homeHabitContextVersion = (habit: any): string => createHash('sha256').update([
  habit.id, habit.status, habit.snoozedUntil ? new Date(habit.snoozedUntil).toISOString() : '', habit.linkedMaintenanceTaskId ?? '',
  habit.updatedAt ? new Date(habit.updatedAt).toISOString() : '',
].join(':')).digest('hex');

const showMaintenanceAction = () => ({
  id: 'habits-show-maintenance', label: 'Show my maintenance tasks', interactionType: 'START_WORKFLOW' as const,
  message: 'What maintenance tasks are coming due?', operationId: 'MAINTENANCE_STATUS', style: 'SECONDARY' as const,
});

const aboutHabitsBoundary = (id: string, body: string): AskPresentationBlock => ({
  type: 'BOUNDARY', id, title: 'About these habits', body, severity: 'INFO', suggestions: [],
});

// The habits list in the plan layout shared with the seasonal answers (see SeasonalPlanResultList): habits whose suggested date has passed
// first, then the rest in the coach's ranked order, then the routine and snoozed ones; numbered across groups, each opening to its facts
// and to its inline review. Nothing links to the desktop page except the empty state, where generating habits is the only way forward.
export function homeHabitsFromView(view: HomeHabitsView, propertyId: string, now: Date = new Date()): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-habit-coach`;
  const habits: any[] = view.habits ?? [];
  const asDate = (value: unknown) => (value ? new Date(value as any) : null);
  const snoozedNow = (habit: any) => habit.status === 'SNOOZED' && (asDate(habit.snoozedUntil)?.getTime() ?? Infinity) > now.getTime();
  const adopted = habits.filter((habit) => habit.linkedMaintenanceTaskId);
  const snoozed = habits.filter((habit) => !habit.linkedMaintenanceTaskId && snoozedNow(habit));
  const upNext = habits.filter((habit) => !habit.linkedMaintenanceTaskId && !snoozedNow(habit));
  const isPast = (habit: any) => (asDate(habit.dueAt)?.getTime() ?? Infinity) < now.getTime();
  const start = upNext.filter(isPast);
  const later = upNext.filter((habit) => !isPast(habit));
  const title = (habit: any) => habit.titleOverride || habit.habitTemplate?.title || 'Home habit';
  let number = 0;
  const row = (habit: any, urgent: boolean) => {
    number += 1;
    const template = habit.habitTemplate ?? {};
    const due = habit.linkedMaintenanceTaskId ? asDate(habit.routineAdherence?.nextDueDate) : asDate(habit.dueAt);
    // A routine task really is overdue. A suggestion the homeowner never took on is only past the date it was suggested for.
    const dueLabel = due
      ? habit.linkedMaintenanceTaskId
        ? `${due.getTime() < now.getTime() ? 'Overdue since' : 'Next due'} ${humanDate(due)}`
        : `Suggested for ${humanDate(due)}`
      : null;
    const lastDone = habit.routineAdherence?.lastCompletedDate ? `Last done ${humanDate(asDate(habit.routineAdherence.lastCompletedDate))}` : null;
    const snoozeLabel = snoozedNow(habit) && habit.snoozedUntil ? `Snoozed until ${humanDate(asDate(habit.snoozedUntil))}` : null;
    return {
      id: habit.id,
      title: title(habit),
      description: habit.reasonSummary || habit.descriptionOverride || template.shortDescription || null,
      condition: null,
      entityType: HOME_HABIT_ENTITY_TYPE,
      countLabel: String(number),
      tone: urgent ? 'CAUTION' as const : 'DEFAULT' as const,
      meta: [
        ...(habit.reminderSchedule?.cadenceLabel ? [habit.reminderSchedule.cadenceLabel] : []),
        ...(template.difficulty ? [readableCode(template.difficulty)] : []),
        ...(template.estimatedMinutes ? [`About ${template.estimatedMinutes} min`] : []),
        ...[snoozeLabel ?? dueLabel].filter((value): value is string => Boolean(value)),
      ],
      // What the card opens to, one "Label: value" per line (the same facts the inline review lists; the reason is already on the card).
      detail: [
        ['How often', habit.reminderSchedule?.cadenceLabel],
        ['Time it takes', template.estimatedMinutes ? `About ${template.estimatedMinutes} minutes` : null],
        ['Area', template.category ? readableCode(template.category) : null],
        [habit.linkedMaintenanceTaskId ? 'Next due' : 'Suggested for', due ? humanDate(due) : null],
        ['Last done', lastDone ? lastDone.replace('Last done ', '') : null],
        ['Tip', template.tipText],
      ].filter(([, value]) => Boolean(value)).map(([label, value]) => `${label}: ${value}`).join('\n') || null,
      status: habit.linkedMaintenanceTaskId ? 'IN_ROUTINE' : String(habit.status),
      // The review opens inside Ask; the page has no per-habit link, so a row never navigates away.
      actions: [{
        id: `habit-review-${habit.id}`, label: 'Review', message: `Review the home habit "${title(habit)}".`,
        style: 'SECONDARY' as const, interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'HOME_HABITS',
      }],
    };
  };
  const group = (id: string, groupTitle: string, caption: string, records: any[], urgent = false) => records.length
    ? [{ id, title: groupTitle, caption, count: records.length, items: records.map((habit) => row(habit, urgent)) }]
    : [];
  const sections = [
    ...group('home-habits-start', 'Start with these', 'Their suggested date has already passed.', start, true),
    ...group('home-habits-up-next', 'Up next', 'In the order the coach ranks them, each with why it was suggested.', later),
    ...group('home-habits-routine', 'In your maintenance routine', 'Tracked as recurring maintenance tasks.', adopted),
    ...group('home-habits-snoozed', 'Snoozed', 'They come back on their own when the snooze ends.', snoozed),
  ];
  const focusSentence = upNext.length
    ? ` Here ${upNext.length === 1 ? 'is 1 habit' : `are ${upNext.length} habits`} to work on${start.length ? `, ${start.length} past their suggested date, so I would start there` : ''}.`
    : '';
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'home-habits-summary',
    title: habits.length
      ? `${upNext.length} habit${upNext.length === 1 ? '' : 's'} to work on${start.length ? `, ${start.length} past their suggested date` : ''}`
      : 'No home habits are suggested yet',
    body: habits.length
      ? `Ranked by the Home Habit Coach for this home${adopted.length ? `; ${adopted.length} already in your maintenance routine` : ''}${snoozed.length ? `; ${snoozed.length} snoozed` : ''}.${focusSentence} Choose Review on a habit to see why it was suggested and what you can do with it.`
      : 'The Home Habit Coach suggests small routines from your home\'s systems, age, climate and season. Open it to generate suggestions; this does not mean nothing needs care.',
    tone: 'DEFAULT',
    // Generating habits is not an Ask action, so only the empty state needs the page; with habits listed it would only repeat them.
    actions: habits.length ? [] : [{ id: 'open-home-habit-coach', label: 'Open Home Habit Coach', href: pageHref, style: 'PRIMARY' }],
  }];
  if (view.hasMore) {
    blocks.push({ type: 'LIMITATION', id: 'home-habits-limits', title: 'What this does not cover', body: `Showing the first ${habits.length} habits in ranked order; the rest are in the Home Habit Coach.`, severity: 'INFO' });
  }
  if (sections.length) {
    blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'home-habits-items', title: 'Your home habits', description: 'In the order the coach ranks them, each with why it was suggested.', sections, actions: [] });
  }
  blocks.push(aboutHabitsBoundary('home-habits-boundary', 'Habits are suggested from what is recorded about this home. They are not a full maintenance schedule, and they cannot see wear, leaks or damage.'));
  const first = (start[0] ?? later[0]) as any;
  if (first) {
    blocks.push({
      type: 'SUMMARY', id: 'home-habits-next', title: 'What would you like to do next?', body: 'Open a habit to add it to your routine, mark it done, or snooze it. Nothing changes until you confirm.', tone: 'DEFAULT',
      actions: [{
        id: 'habits-review-first', label: 'Review the first habit', interactionType: 'START_WORKFLOW', message: `Review the home habit "${title(first)}".`,
        operationId: 'HOME_HABITS', entityType: HOME_HABIT_ENTITY_TYPE, entityId: first.id, style: 'PRIMARY',
      }, showMaintenanceAction()],
    });
  }
  return {
    status: view.hasMore ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: habits.length ? (start.length ? 'HOME_HABITS_OVERDUE' : 'HOME_HABITS_REVIEWED') : 'HOME_HABITS_EMPTY',
    blocks,
    suggestions: [],
  };
}

const habitBoundary = (id: string, title: string, body: string, status: AskOperationResult['status'], reasonCode: string): AskOperationResult => ({
  status, reasonCode,
  blocks: [{ type: 'BOUNDARY', id, title, body, severity: 'INFO', suggestions: [] }],
  suggestions: [],
});

async function loadHabit(propertyId: string, habitId: string): Promise<any | null> {
  try {
    return (await new HomeHabitCoachService().getHabitDetail(propertyId, habitId)).habit;
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 404 || (error as { code?: string })?.code === 'HABIT_NOT_FOUND') return null;
    throw error;
  }
}

function habitStatusLabel(habit: any, now: Date): string {
  if (habit.linkedMaintenanceTaskId) return 'In your maintenance routine';
  const until = habit.snoozedUntil ? new Date(habit.snoozedUntil) : null;
  switch (String(habit.status)) {
    case 'SNOOZED': return until ? `Snoozed until ${humanDate(until)}` : 'Snoozed';
    case 'COMPLETED': return 'Done';
    case 'SKIPPED': return 'Skipped for now';
    case 'DISMISSED': return 'No longer suggested';
    case 'EXPIRED': return 'Expired';
    default: return until && until.getTime() > now.getTime() ? `Snoozed until ${humanDate(until)}` : 'Suggested';
  }
}

// The inline review of one habit: why it was suggested, what it involves, what happened before, and the actions the
// service will accept right now. Every action only opens a confirmation.
export async function homeHabitReviewResult(userId: string, propertyId: string, habitId: string, now: Date = new Date()): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const habit = await loadHabit(propertyId, habitId);
  if (!habit) return habitBoundary('home-habit-review-boundary', 'This habit is no longer available', 'It may have been removed or replaced. Nothing has changed.', 'NOT_APPLICABLE', 'HOME_HABIT_NOT_FOUND');
  const template = habit.habitTemplate ?? {};
  const title = habit.titleOverride || template.title || 'Home habit';
  const canChange = access.role !== HouseholdRole.VIEWER;
  const allowed = canChange ? habitActionsAllowed(habit) : [];
  const asDate = (value: unknown) => (value ? new Date(value as any) : null);
  const due = habit.linkedMaintenanceTaskId ? asDate(habit.routineAdherence?.nextDueDate) : asDate(habit.dueAt);
  const lastDone = habit.linkedMaintenanceTaskId ? asDate(habit.routineAdherence?.lastCompletedDate) : asDate(habit.lastCompletedAt);
  const fact = (id: string, label: string, value: string | null | undefined) => (value ? [{ id: `habit-fact-${id}`, title: label, description: value, condition: null, meta: [], status: null, href: null }] : []);
  const facts = [
    ...fact('status', 'Status', habitStatusLabel(habit, now)),
    ...fact('cadence', 'How often', habit.reminderSchedule?.cadenceLabel),
    ...fact('time', 'Time it takes', template.estimatedMinutes ? `About ${template.estimatedMinutes} minutes` : null),
    ...fact('difficulty', 'Difficulty', template.difficulty ? readableCode(template.difficulty) : null),
    ...fact('category', 'Area', template.category ? readableCode(template.category) : null),
    ...fact('due', habit.linkedMaintenanceTaskId ? 'Next due' : 'Suggested for', due ? humanDate(due) : null),
    ...fact('last', 'Last done', lastDone ? humanDate(lastDone) : null),
    ...fact('tip', 'Tip', template.tipText),
  ];
  const history = (habit.actions ?? []).slice(0, 5).map((entry: any) => ({
    id: `habit-history-${entry.id}`, title: readableCode(String(entry.actionType)), description: entry.note || null, condition: null,
    meta: [humanDate(new Date(entry.createdAt))].filter((value): value is string => Boolean(value)), status: null, href: null,
  }));
  const reason = habit.reasonSummary || habit.descriptionOverride || template.description || template.shortDescription || 'The Home Habit Coach suggested this routine for your home.';
  const habitAction = (action: HabitAction, index: number) => ({
    id: `habit-${action.toLowerCase()}`, label: HABIT_ACTION_LABELS[action], interactionType: 'START_WORKFLOW' as const,
    message: HABIT_ACTION_MESSAGES[action], operationId: 'HOME_HABIT_UPDATE', entityType: HOME_HABIT_ENTITY_TYPE, entityId: habit.id,
    style: (index === 0 ? 'PRIMARY' : 'SECONDARY') as 'PRIMARY' | 'SECONDARY',
  });
  // A block carries at most three actions (the response schema's cap), so the first three are the next steps and the rest, with the way
  // back, sit in a second card, "If this is not for you right now".
  const actions = [...allowed.map(habitAction), habitsBackAction()];
  const fitsOneBlock = actions.length <= 3;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: `home-habit-review-${habit.id}`, title, body: reason, tone: 'DEFAULT', actions: [],
  }];
  if (facts.length) {
    blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'home-habit-review-facts', title: 'About this habit', actions: [], sections: [{ id: 'habit-facts', title: 'Details', count: facts.length, items: facts }] });
  }
  if (history.length) {
    blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'home-habit-review-history', title: 'Recent activity', actions: [], sections: [{ id: 'habit-history', title: 'Most recent first', count: history.length, items: history }] });
  }
  if (habit.linkedMaintenanceTaskId) {
    blocks.push({ type: 'LIMITATION', id: 'home-habit-review-routine', title: 'Managed by your maintenance routine', body: 'This habit is a recurring maintenance task, so its schedule and completion are tracked there. Ask what maintenance is due to work with it.', severity: 'INFO' });
  } else if (canChange && allowed.length === 0) {
    blocks.push({ type: 'LIMITATION', id: 'home-habit-review-no-actions', title: 'Nothing to change here', body: 'This habit is not in a state Ask can change right now.', severity: 'INFO' });
  } else if (!canChange) {
    blocks.push({ type: 'LIMITATION', id: 'home-habit-review-role', title: 'View only', body: 'A contributor or owner can add this habit to the routine, mark it done, snooze it, or stop suggesting it.', severity: 'INFO' });
  }
  blocks.push(aboutHabitsBoundary('home-habit-review-boundary', 'Habits are suggested from what is recorded about this home. Nothing changes until you review and confirm an action.'));
  blocks.push({
    type: 'SUMMARY', id: 'home-habit-review-next', title: 'What would you like to do?',
    body: allowed.length ? 'Each of these only opens a confirmation.' : 'You can go back to the list.', tone: 'DEFAULT', actions: fitsOneBlock ? actions : actions.slice(0, 3),
  });
  if (!fitsOneBlock) {
    blocks.push({ type: 'SUMMARY', id: 'home-habit-review-more', title: 'If this is not for you right now', body: 'Skip it for now, or stop it being suggested. Either one only opens a confirmation.', tone: 'DEFAULT', actions: actions.slice(3) });
  }
  return {
    status: 'ANSWERED', reasonCode: 'HOME_HABIT_REVIEWED', contextVersion: homeHabitContextVersion(habit), blocks,
    suggestions: [],
  };
}

async function homeHabitsResult(userId: string, propertyId: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  if (launchContext?.entityType === HOME_HABIT_ENTITY_TYPE && launchContext.entityId) {
    return homeHabitReviewResult(userId, propertyId, launchContext.entityId);
  }
  const view = await new HomeHabitCoachService().listActiveHabits(propertyId, { includeSnoozed: true, limit: HOME_HABITS_ASK_LIMIT });
  return homeHabitsFromView(view, propertyId);
}

registerCapabilityHandler('home-habits.read', async (envelope) => homeHabitsResult(envelope.userId, envelope.propertyId!, envelope.launchContext));

// ── Writes ───────────────────────────────────────────────────────────────────────────────────────────────────────

const habitWriteBoundary = (title: string, body: string, status: AskOperationResult['status'], reasonCode: string) =>
  habitBoundary('home-habit-write-boundary', title, body, status, reasonCode);

const HABIT_ACTION_REVIEW: Record<HabitAction, { description: string; consent: string }> = {
  ADOPT: { description: 'This creates a recurring maintenance task from the habit, so it is tracked with the rest of your maintenance.', consent: 'I authorize adding this recurring task to the shared maintenance routine.' },
  COMPLETE: { description: 'This records the habit as done today. It will not be suggested again until its cooldown has passed.', consent: 'I did this habit and want it recorded as done.' },
  SNOOZE: { description: 'This hides the habit for a week. It comes back on its own afterward.', consent: 'I want this habit hidden for a week.' },
  SKIP: { description: 'This skips the habit for now. It can be suggested again after its cooldown.', consent: 'I want to skip this habit for now.' },
  DISMISS: { description: 'This stops the Home Habit Coach from suggesting this habit.', consent: 'I do not want this habit suggested for my home.' },
};

async function homeHabitUpdateResult(userId: string, propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const action = habitActionFromMessage(message);
  const habitId = launchContext?.entityType === HOME_HABIT_ENTITY_TYPE ? launchContext.entityId : null;
  const declared = launchContext?.operationId === 'HOME_HABIT_UPDATE' && launchContext.surface !== 'ASK_REFRESH' && action && habitId;
  // A refresh, or a message outside the declared actions, must never start a confirmation.
  if (!declared || !action || !habitId) return habitWriteBoundary('Use the habit\'s buttons', 'Open a habit with Review, then choose what to do with it. Nothing has changed.', 'NOT_APPLICABLE', 'ASK_HOME_HABIT_NOT_DIRECTLY_ROUTABLE');
  if (access.role === HouseholdRole.VIEWER) return habitWriteBoundary('A contributor or owner can change habits', 'Your role can view habits but not change them. Nothing has changed.', 'BLOCKED', 'ASK_PERMISSION_REQUIRED');
  const habit = await loadHabit(propertyId, habitId);
  if (!habit) return habitWriteBoundary('This habit is no longer available', 'It may have been removed or replaced. Nothing has changed.', 'NOT_APPLICABLE', 'HOME_HABIT_NOT_FOUND');
  if (!habitActionsAllowed(habit).includes(action)) {
    return habitWriteBoundary(habit.linkedMaintenanceTaskId ? 'This habit is in your maintenance routine' : 'That is not available for this habit right now', habit.linkedMaintenanceTaskId ? 'Its schedule and completion are tracked as a maintenance task. Nothing has changed.' : 'Its status changed or it is not eligible for that action. Nothing has changed.', 'BLOCKED', 'HOME_HABIT_ACTION_NOT_ALLOWED');
  }
  const title = habit.titleOverride || habit.habitTemplate?.title || 'Home habit';
  const label = HABIT_ACTION_LABELS[action];
  const contextVersion = homeHabitContextVersion(habit);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_HABIT_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { homeHabitId: habit.id, homeHabitAction: action, homeHabitContextVersion: contextVersion, sourceExecutionId: launchContext?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'home-habit-review-confirm', title: `Review: ${label.toLowerCase()}`, body: `Nothing has changed yet. ${HABIT_ACTION_REVIEW[action].description}`, tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `home-habit-${habit.id}-1`, version: 1, title: `${label}: ${title}?`, description: HABIT_ACTION_REVIEW[action].description,
      fields: [{ label: 'Habit', value: title }, { label: 'Current status', value: habitStatusLabel(habit, new Date()) }, { label: 'Action', value: label }],
      editableFields: [], confirmLabel: label, consentText: HABIT_ACTION_REVIEW[action].consent, expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('home-habits.update', async (envelope) => homeHabitUpdateResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext));

const habitConfirmError = (message: string, code: string) => Object.assign(new Error(message), { code });

const HABIT_ANALYTICS_ACTION: Record<HabitAction, string> = { ADOPT: 'adopt_habit', COMPLETE: 'complete_habit', SNOOZE: 'snooze_habit', SKIP: 'skip_habit', DISMISS: 'dismiss_habit' };

async function confirmHomeHabitUpdate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw habitConfirmError('A contributor or owner is required to change a habit.', 'ASK_PERMISSION_REQUIRED');
  const habitId = parameters.homeHabitId;
  const action = parameters.homeHabitAction as HabitAction;
  if (typeof habitId !== 'string' || !HABIT_ACTIONS.includes(action)) throw habitConfirmError('The habit command is invalid.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const habit = await loadHabit(execution.propertyId, habitId);
  if (!habit) throw habitConfirmError('The selected habit is no longer available.', 'ASK_CONFIRMATION_NOT_ACTIVE');
  const alreadyApplied = action === 'ADOPT' ? Boolean(habit.linkedMaintenanceTaskId) : String(habit.status) === HABIT_ACTION_TARGET_STATUS[action];
  if (!alreadyApplied && parameters.homeHabitContextVersion !== homeHabitContextVersion(habit)) {
    throw habitConfirmError('This habit changed while confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  }
  const service = new HomeHabitCoachService();
  if (!alreadyApplied) {
    if (!habitActionsAllowed(habit).includes(action)) throw habitConfirmError('That change is no longer available for this habit.', 'ASK_CONFIRMATION_NOT_ACTIVE');
    try {
      if (action === 'ADOPT') await service.adoptHabit(execution.propertyId, habitId, userId);
      else if (action === 'COMPLETE') await service.completeHabit(execution.propertyId, habitId, userId, {});
      else if (action === 'SNOOZE') await service.snoozeHabit(execution.propertyId, habitId, userId, { snoozePreset: HABIT_SNOOZE_PRESET });
      else if (action === 'SKIP') await service.skipHabit(execution.propertyId, habitId, userId, {});
      else await service.dismissHabit(execution.propertyId, habitId, userId, {});
    } catch (error) {
      // The service owns the status rules; a refusal means the habit moved on, which is the same "no longer active" outcome.
      if (typeof (error as { statusCode?: number })?.statusCode === 'number' && (error as { statusCode: number }).statusCode < 500) {
        throw habitConfirmError((error as Error).message, 'ASK_CONFIRMATION_NOT_ACTIVE');
      }
      throw error;
    }
    // The page's controller emits this event after each of these writes; Ask is the same product action.
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId: execution.propertyId, moduleKey: AnalyticsModule.MAINTENANCE,
      featureKey: AnalyticsFeature.HOME_HABIT_COACH, metadataJson: { actionType: HABIT_ANALYTICS_ACTION[action], habitId, source: 'ask' },
    });
  }
  const title = habit.titleOverride || habit.habitTemplate?.title || 'Home habit';
  const receipt: Record<HabitAction, { title: string; description: string; state: string }> = {
    ADOPT: { title: 'Added to your maintenance routine', description: 'This habit is now a recurring maintenance task.', state: 'In your maintenance routine' },
    COMPLETE: { title: 'Habit marked done', description: 'It will not be suggested again until its cooldown has passed.', state: 'Done' },
    SNOOZE: { title: 'Habit snoozed for a week', description: 'It will come back on its own afterward.', state: 'Snoozed for a week' },
    SKIP: { title: 'Habit skipped for now', description: 'It can be suggested again after its cooldown.', state: 'Skipped for now' },
    DISMISS: { title: 'Habit no longer suggested', description: 'The Home Habit Coach will stop suggesting it.', state: 'No longer suggested' },
  };
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `HOME_HABIT_${action}_COMPLETED`,
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `home-habit-updated-${habitId}`, title: receipt[action].title, status: 'COMPLETED', description: receipt[action].description,
      details: [{ label: 'Habit', value: title }, { label: 'Now', value: receipt[action].state }],
      actions: [habitsBackAction()],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'BOUNDARY', id: `home-habit-refresh-failed-${habitId}`, severity: 'CAUTION', title: 'Saved; list could not refresh',
      body: 'This was saved. The habits list you were viewing could not refresh automatically; ask "Show my home habits" to see its current state.',
      suggestions: ['Show my home habits'],
    });
  }
  return { result, artifactType: 'PROPERTY_HABIT', artifactId: habitId, refreshedExecutions: refresh.refreshedExecutions };
}

registerConfirmCapabilityHandler('home-habits.update', confirmHomeHabitUpdate);
