/**
 * Pure UI helper functions for Home Habit Coach.
 * No React, no API calls — safe to unit test in isolation.
 */

import type { HabitAssignmentStatus, HabitCadence } from './types';

// ─── Status display maps ──────────────────────────────────────────────────────

export const HABIT_STATUS_TONE: Record<
  HabitAssignmentStatus,
  'info' | 'good' | 'elevated' | 'danger'
> = {
  ACTIVE: 'info',
  SNOOZED: 'elevated',
  COMPLETED: 'good',
  SKIPPED: 'info',
  DISMISSED: 'info',
  EXPIRED: 'danger',
};

export const HABIT_STATUS_LABEL: Record<HabitAssignmentStatus, string> = {
  ACTIVE: 'Active',
  SNOOZED: 'Snoozed',
  COMPLETED: 'Completed',
  SKIPPED: 'Skipped',
  DISMISSED: 'Dismissed',
  EXPIRED: 'Expired',
};

export const HABIT_CADENCE_LABEL: Record<HabitCadence, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  SEASONAL: 'Seasonal',
  ANNUAL: 'Annual',
  AD_HOC: 'As needed',
};

// ─── Due date ─────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable due label, or null if no due date.
 * Examples: "Overdue by 3d", "Due today", "Due tomorrow", "Due in 5 days", "Due Mar 20"
 */
export function formatDueLabel(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const date = new Date(dueAt);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays <= 7) return `Due in ${diffDays} days`;
  return `Due ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/**
 * Returns a StatusChip tone appropriate for the due date.
 * - Overdue or due today → 'danger'
 * - Due within 3 days → 'elevated'
 * - Otherwise → 'info'
 */
export function getDueTone(dueAt: string | null): 'danger' | 'elevated' | 'info' {
  if (!dueAt) return 'info';
  const date = new Date(dueAt);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'danger';
  if (diffDays <= 3) return 'elevated';
  return 'info';
}

// ─── Snooze display ───────────────────────────────────────────────────────────

/**
 * Returns a human-readable "back on" label for snoozed habits, or null.
 * Example: "Back on Mar 20"
 */
export function formatSnoozedLabel(snoozedUntil: string | null): string | null {
  if (!snoozedUntil) return null;
  const date = new Date(snoozedUntil);
  return `Back on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

// ─── Action date display ──────────────────────────────────────────────────────

/**
 * Returns a human-readable "when last acted" label for history rows, or null.
 * Examples: "Today", "Yesterday", "5 days ago", "Mar 10"
 */
export function formatActionDateLabel(lastActionAt: string | null): string | null {
  if (!lastActionAt) return null;
  const date = new Date(lastActionAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Effort display ───────────────────────────────────────────────────────────

/**
 * Returns a human-readable effort label, or null if no estimate.
 * Examples: "5 min", "1h", "1h 30min"
 */
export function formatEffortLabel(minutes: number | null | undefined): string | null {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ─── Error messages ───────────────────────────────────────────────────────────

type HabitAction = 'complete' | 'snooze' | 'skip' | 'dismiss' | 'reopen' | 'generate';

/**
 * Returns a user-facing error message for a failed habit mutation.
 */
export function getHabitActionErrorMessage(action: HabitAction): string {
  switch (action) {
    case 'complete':
      return 'Could not mark habit complete. Please try again.';
    case 'snooze':
      return 'Could not snooze habit. Please try again.';
    case 'skip':
      return 'Could not skip habit. Please try again.';
    case 'dismiss':
      return 'Could not dismiss habit. Please try again.';
    case 'reopen':
      return 'Could not reopen habit. Please try again.';
    case 'generate':
      return 'Could not generate habits. Please try again.';
  }
}

type HabitLoadContext = 'list' | 'spotlight' | 'history' | 'preferences';

/**
 * Returns a user-facing error message for a failed habit data load.
 */
export function getHabitLoadErrorMessage(context: HabitLoadContext): string {
  switch (context) {
    case 'list':
      return 'Could not load your habits. Pull to refresh.';
    case 'spotlight':
      return 'Could not load the top habit recommendation.';
    case 'history':
      return 'Could not load habit history. Pull to refresh.';
    case 'preferences':
      return 'Could not load preferences.';
  }
}

// ─── Empty state ──────────────────────────────────────────────────────────────

type EmptyStateVariant = 'noHabits' | 'allSnoozed' | 'noHistory';

interface EmptyStateProps {
  title: string;
  description: string;
  variant: EmptyStateVariant;
}

/**
 * Returns display props for the habits empty state.
 */
export function getHabitEmptyStateProps(state: EmptyStateVariant): EmptyStateProps {
  switch (state) {
    case 'noHabits':
      return {
        title: 'No habits yet',
        description:
          "Generate personalized care habits based on your home's profile, systems, and the current season.",
        variant: 'noHabits',
      };
    case 'allSnoozed':
      return {
        title: 'All caught up for now',
        description: 'Your habits are snoozed and will resurface when ready.',
        variant: 'allSnoozed',
      };
    case 'noHistory':
      return {
        title: 'No history yet',
        description: 'Your habit history will appear here once you complete, skip, or dismiss habits.',
        variant: 'noHistory',
      };
  }
}
