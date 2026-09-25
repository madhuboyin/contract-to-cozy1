// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, readableCode } from '../askFormatting';
import { HomeHabitCoachService } from '../../homeHabitCoach/homeHabitCoachService';

// Home Habit Coach capability-card slice (FRD v1.53): the fifth new operation for a capability with none. Reads
// listActiveHabits with the page's own options (snoozed included, first 50, ranked by rankHabits). A pure read: it
// never generates habits. Adopt, complete, snooze, skip and dismiss are a follow-up.
type HomeHabitsView = Awaited<ReturnType<HomeHabitCoachService['listActiveHabits']>>;
export const HOME_HABITS_ASK_LIMIT = 50;

export function homeHabitsFromView(view: HomeHabitsView, propertyId: string, now: Date = new Date()): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-habit-coach`;
  const habits: any[] = view.habits ?? [];
  const asDate = (value: unknown) => (value ? new Date(value as any) : null);
  const snoozedNow = (habit: any) => habit.status === 'SNOOZED' && (asDate(habit.snoozedUntil)?.getTime() ?? Infinity) > now.getTime();
  const adopted = habits.filter((habit) => habit.linkedMaintenanceTaskId);
  const snoozed = habits.filter((habit) => !habit.linkedMaintenanceTaskId && snoozedNow(habit));
  const upNext = habits.filter((habit) => !habit.linkedMaintenanceTaskId && !snoozedNow(habit));
  const overdue = upNext.filter((habit) => (asDate(habit.dueAt)?.getTime() ?? Infinity) < now.getTime()).length;
  const row = (habit: any) => {
    const template = habit.habitTemplate ?? {};
    const due = habit.linkedMaintenanceTaskId ? asDate(habit.routineAdherence?.nextDueDate) : asDate(habit.dueAt);
    const dueLabel = due ? `${due.getTime() < now.getTime() ? 'Overdue since' : habit.linkedMaintenanceTaskId ? 'Next due' : 'Due'} ${humanDate(due)}` : null;
    return {
      id: habit.id,
      title: habit.titleOverride || template.title || 'Home habit',
      description: habit.reasonSummary || habit.descriptionOverride || template.shortDescription || null,
      meta: [
        ...(habit.reminderSchedule?.cadenceLabel ? [habit.reminderSchedule.cadenceLabel] : []),
        ...(template.category ? [readableCode(template.category)] : []),
        ...(template.estimatedMinutes ? [`About ${template.estimatedMinutes} min`] : []),
        ...(template.difficulty ? [readableCode(template.difficulty)] : []),
        ...(dueLabel ? [dueLabel] : []),
        ...(snoozedNow(habit) && habit.snoozedUntil ? [`Snoozed until ${humanDate(asDate(habit.snoozedUntil))}`] : []),
        ...(habit.routineAdherence?.lastCompletedDate ? [`Last done ${humanDate(asDate(habit.routineAdherence.lastCompletedDate))}`] : []),
      ],
      status: habit.linkedMaintenanceTaskId ? 'IN_ROUTINE' : String(habit.status),
      href: pageHref,
    };
  };
  const sections = [
    { id: 'home-habits-up-next', title: 'Up next', rows: upNext },
    { id: 'home-habits-routine', title: 'In your maintenance routine', rows: adopted },
    { id: 'home-habits-snoozed', title: 'Snoozed', rows: snoozed },
  ].filter((section) => section.rows.length).map((section) => ({ id: section.id, title: section.title, count: section.rows.length, items: section.rows.map(row) }));
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'home-habits-summary',
    title: habits.length
      ? `${upNext.length} habit${upNext.length === 1 ? '' : 's'} to work on${overdue ? `, ${overdue} overdue` : ''}`
      : 'No home habits are suggested yet',
    body: habits.length
      ? `Ranked by the Home Habit Coach for this home${adopted.length ? `; ${adopted.length} already in your maintenance routine` : ''}${snoozed.length ? `; ${snoozed.length} snoozed` : ''}.`
      : 'The Home Habit Coach suggests small routines from your home\'s systems, age, climate and season. Open it to generate suggestions; this does not mean nothing needs care.',
    tone: overdue ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-home-habit-coach', label: 'Open Home Habit Coach', href: pageHref, style: 'PRIMARY' }],
  }];
  if (view.hasMore) {
    blocks.push({ type: 'LIMITATION', id: 'home-habits-limits', title: 'What this does not cover', body: `Showing the first ${habits.length} habits in ranked order; the rest are in the Home Habit Coach.`, severity: 'INFO' });
  }
  if (sections.length) {
    blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'home-habits-items', title: 'Your home habits', description: 'In the order the coach ranks them, each with why it was suggested.', sections, actions: [] });
  }
  blocks.push({
    type: 'BOUNDARY', id: 'home-habits-boundary', title: 'Suggested routines, not an inspection',
    body: 'Habits are suggested from what is recorded about this home. They are not a full maintenance schedule, and they cannot see wear, leaks or damage.',
    severity: 'INFO', suggestions: [],
  });
  return {
    status: view.hasMore ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: habits.length ? (overdue ? 'HOME_HABITS_OVERDUE' : 'HOME_HABITS_REVIEWED') : 'HOME_HABITS_EMPTY',
    blocks,
    suggestions: ['What maintenance is due?', 'Show my status board'],
  };
}

async function homeHabitsResult(propertyId: string): Promise<AskOperationResult> {
  const view = await new HomeHabitCoachService().listActiveHabits(propertyId, { includeSnoozed: true, limit: HOME_HABITS_ASK_LIMIT });
  return homeHabitsFromView(view, propertyId);
}

registerCapabilityHandler('home-habits.read', async (envelope) => homeHabitsResult(envelope.propertyId!));
