'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  History,
  Info,
  ListChecks,
  Loader2,
  RefreshCw,
  SkipForward,
  Sparkles,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import {
  BottomSafeAreaReserve,
  CompactEntityRow,
  EmptyStateCard,
  IconBadge,
  MobileCard,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { MOBILE_TYPE_TOKENS, MOBILE_CARD_RADIUS } from '@/components/mobile/dashboard/mobileDesignTokens';
import RelatedTools from '@/components/tools/RelatedTools';
import {
  completeHabit,
  dismissHabit,
  generateHabits,
  getHabitHistory,
  getPreferences,
  getSpotlightHabit,
  listHabits,
  reopenHabit,
  skipHabit,
  snoozeHabit,
  updatePreferences,
} from './homeHabitCoachApi';
import type { HabitCategory, PropertyHabit, SnoozePreset } from './types';
import {
  HABIT_STATUS_TONE,
  HABIT_STATUS_LABEL,
  HABIT_CADENCE_LABEL,
  formatDueLabel,
  getDueTone,
  formatSnoozedLabel,
  formatActionDateLabel,
  formatEffortLabel,
  getHabitActionErrorMessage,
  getHabitLoadErrorMessage,
} from './homeHabitCoachUi';

// ─── Display helpers ─────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<HabitCategory, string> = {
  HVAC: 'HVAC',
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  SAFETY: 'Safety',
  APPLIANCE: 'Appliances',
  EXTERIOR: 'Exterior',
  INTERIOR: 'Interior',
  SEASONAL: 'Seasonal',
  ENVIRONMENTAL: 'Environmental',
  GENERAL: 'General',
};

const SNOOZE_PRESETS: { label: string; value: SnoozePreset }[] = [
  { label: '1 day', value: '1d' },
  { label: '3 days', value: '3d' },
  { label: '1 week', value: '7d' },
  { label: '2 weeks', value: '14d' },
  { label: '1 month', value: '30d' },
];

function habitTitle(habit: PropertyHabit): string {
  return habit.titleOverride ?? habit.habitTemplate.title;
}

function habitDescription(habit: PropertyHabit): string {
  return habit.descriptionOverride ?? habit.habitTemplate.shortDescription ?? '';
}

// ─── Spotlight card ───────────────────────────────────────────────────────────

function SpotlightCard({
  habit,
  onOpen,
}: {
  habit: PropertyHabit;
  onOpen: (h: PropertyHabit) => void;
}) {
  const dueLabel = formatDueLabel(habit.dueAt);
  const dueTone = getDueTone(habit.dueAt);
  const effort = formatEffortLabel(habit.habitTemplate.estimatedMinutes);

  return (
    <MobileCard
      variant="hero"
      className="bg-[linear-gradient(145deg,#ffffff,hsl(var(--mobile-brand-soft)))] cursor-pointer"
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onOpen(habit)}
      >
        <div className="flex items-start gap-3">
          <IconBadge tone="brand" className="mt-0.5 shrink-0">
            <ListChecks className="h-4 w-4" />
          </IconBadge>
          <div className="min-w-0 flex-1">
            <p className="mb-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
              Top habit for you
            </p>
            <h2 className="mb-0 mt-1 text-[1.25rem] leading-snug font-semibold text-[hsl(var(--mobile-text-primary))]">
              {habitTitle(habit)}
            </h2>
            {habit.reasonSummary ? (
              <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
                {habit.reasonSummary}
              </p>
            ) : habitDescription(habit) ? (
              <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
                {habitDescription(habit)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusChip tone="info">
            {CATEGORY_LABELS[habit.habitTemplate.category] ?? habit.habitTemplate.category}
          </StatusChip>
          {dueLabel ? <StatusChip tone={dueTone}>{dueLabel}</StatusChip> : null}
          {effort ? (
            <span className={cn('inline-flex items-center gap-1 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
              <Clock className="h-3 w-3" />
              {effort}
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className={cn('text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
            {HABIT_CADENCE_LABEL[habit.habitTemplate.cadence] ?? habit.habitTemplate.cadence}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]">
            View details
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </button>
    </MobileCard>
  );
}

// ─── Habit row ────────────────────────────────────────────────────────────────

function HabitRow({
  habit,
  onOpen,
  showDate = false,
}: {
  habit: PropertyHabit;
  onOpen: (h: PropertyHabit) => void;
  showDate?: boolean;
}) {
  const dueLabel = formatDueLabel(habit.dueAt);
  const snoozedLabel = habit.status === 'SNOOZED' ? formatSnoozedLabel(habit.snoozedUntil) : null;
  const actionDateLabel = showDate ? formatActionDateLabel(habit.lastActionAt) : null;

  // Build subtitle: priority → snooze info → due label → action date → description
  const subtitle =
    snoozedLabel ??
    actionDateLabel ??
    dueLabel ??
    habitDescription(habit) ??
    undefined;

  return (
    <button type="button" className="w-full text-left" onClick={() => onOpen(habit)}>
      <CompactEntityRow
        title={habitTitle(habit)}
        subtitle={subtitle}
        status={
          <StatusChip tone={HABIT_STATUS_TONE[habit.status] ?? 'info'}>
            {HABIT_STATUS_LABEL[habit.status] ?? habit.status}
          </StatusChip>
        }
        leading={
          <IconBadge tone="neutral">
            <ListChecks className="h-4 w-4" />
          </IconBadge>
        }
      />
    </button>
  );
}

// ─── Habit detail sheet ───────────────────────────────────────────────────────

function HabitDetailSheet({
  habit,
  propertyId,
  open,
  onClose,
  onMutated,
}: {
  habit: PropertyHabit | null;
  propertyId: string;
  open: boolean;
  onClose: () => void;
  onMutated: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [snoozeMode, setSnoozeMode] = React.useState(false);

  const invalidate = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ['home-habits', propertyId] });
    qc.invalidateQueries({ queryKey: ['home-habits-spotlight', propertyId] });
    qc.invalidateQueries({ queryKey: ['home-habits-history', propertyId] });
    onMutated();
  }, [qc, propertyId, onMutated]);

  const completeMut = useMutation({
    mutationFn: () => completeHabit(propertyId, habit!.id),
    onSuccess: () => {
      toast({ title: 'Habit marked complete' });
      invalidate();
      onClose();
    },
    onError: () =>
      toast({ title: getHabitActionErrorMessage('complete'), variant: 'destructive' }),
  });

  const snoozeMut = useMutation({
    mutationFn: (preset: SnoozePreset) =>
      snoozeHabit(propertyId, habit!.id, { snoozePreset: preset }),
    onSuccess: () => {
      toast({ title: 'Habit snoozed' });
      setSnoozeMode(false);
      invalidate();
      onClose();
    },
    onError: () =>
      toast({ title: getHabitActionErrorMessage('snooze'), variant: 'destructive' }),
  });

  const skipMut = useMutation({
    mutationFn: () => skipHabit(propertyId, habit!.id),
    onSuccess: () => {
      toast({ title: 'Habit skipped' });
      invalidate();
      onClose();
    },
    onError: () =>
      toast({ title: getHabitActionErrorMessage('skip'), variant: 'destructive' }),
  });

  const dismissMut = useMutation({
    mutationFn: () => dismissHabit(propertyId, habit!.id),
    onSuccess: () => {
      toast({ title: 'Habit dismissed' });
      invalidate();
      onClose();
    },
    onError: () =>
      toast({ title: getHabitActionErrorMessage('dismiss'), variant: 'destructive' }),
  });

  const reopenMut = useMutation({
    mutationFn: () => reopenHabit(propertyId, habit!.id),
    onSuccess: () => {
      toast({ title: 'Habit reopened' });
      invalidate();
      onClose();
    },
    onError: () =>
      toast({ title: getHabitActionErrorMessage('reopen'), variant: 'destructive' }),
  });

  const isBusy =
    completeMut.isPending ||
    snoozeMut.isPending ||
    skipMut.isPending ||
    dismissMut.isPending ||
    reopenMut.isPending;

  if (!habit) return null;

  const isActionable = habit.status === 'ACTIVE' || habit.status === 'SNOOZED';
  const isReopenable = ['COMPLETED', 'SKIPPED', 'DISMISSED', 'EXPIRED'].includes(habit.status);
  const dueLabel = formatDueLabel(habit.dueAt);
  const dueTone = getDueTone(habit.dueAt);
  const effort = formatEffortLabel(habit.habitTemplate.estimatedMinutes);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { setSnoozeMode(false); onClose(); } }}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-[22px] px-5 pb-0">
        <SheetHeader className="pb-2 text-left">
          <div className="flex items-start gap-3">
            <IconBadge tone="brand" className="mt-0.5 shrink-0">
              <ListChecks className="h-4 w-4" />
            </IconBadge>
            <div className="min-w-0 flex-1">
              <SheetTitle className="mb-0 text-left text-[1.15rem] leading-snug">
                {habitTitle(habit)}
              </SheetTitle>
              <SheetDescription className="mt-1 text-left">
                {CATEGORY_LABELS[habit.habitTemplate.category] ?? habit.habitTemplate.category}
                {' · '}
                {HABIT_CADENCE_LABEL[habit.habitTemplate.cadence] ?? habit.habitTemplate.cadence}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Status + meta */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={HABIT_STATUS_TONE[habit.status] ?? 'info'}>
              {HABIT_STATUS_LABEL[habit.status] ?? habit.status}
            </StatusChip>
            {dueLabel ? <StatusChip tone={dueTone}>{dueLabel}</StatusChip> : null}
            {effort ? (
              <span className={cn('inline-flex items-center gap-1 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
                <Clock className="h-3 w-3" />
                {effort}
              </span>
            ) : null}
          </div>

          {/* Description */}
          {habitDescription(habit) ? (
            <p className={cn('text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
              {habitDescription(habit)}
            </p>
          ) : null}

          {/* Why surfaced */}
          {habit.reasonSummary ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <p className={cn('mb-1 font-medium text-sky-700', MOBILE_TYPE_TOKENS.caption)}>
                Why this habit?
              </p>
              <p className={cn('mb-0 text-sky-700', MOBILE_TYPE_TOKENS.body)}>
                {habit.reasonSummary}
              </p>
            </div>
          ) : null}

          {/* Tip */}
          {habit.habitTemplate.tipText ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className={cn('mb-1 font-medium text-amber-700', MOBILE_TYPE_TOKENS.caption)}>
                <Zap className="mr-1 inline h-3.5 w-3.5" />
                Tip
              </p>
              <p className={cn('mb-0 text-amber-700', MOBILE_TYPE_TOKENS.body)}>
                {habit.habitTemplate.tipText}
              </p>
            </div>
          ) : null}

          {/* Snooze preset picker */}
          {snoozeMode ? (
            <div className="space-y-2">
              <p className={cn('font-medium text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
                Snooze for how long?
              </p>
              <div className="flex flex-wrap gap-2">
                {SNOOZE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    disabled={isBusy}
                    onClick={() => snoozeMut.mutate(preset.value)}
                    className="inline-flex items-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-white px-3 py-1.5 text-sm font-medium text-[hsl(var(--mobile-text-primary))] disabled:opacity-50"
                  >
                    {snoozeMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    {preset.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSnoozeMode(false)}
                className="mt-1 text-sm text-[hsl(var(--mobile-text-muted))] underline"
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>

        <SheetFooter className="flex-col gap-2 pb-safe pt-2">
          {isActionable && !snoozeMode ? (
            <>
              <Button
                className="w-full"
                disabled={isBusy}
                onClick={() => completeMut.mutate()}
              >
                {completeMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Mark complete
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={isBusy}
                  onClick={() => setSnoozeMode(true)}
                >
                  <AlarmClock className="mr-2 h-4 w-4" />
                  Snooze
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={isBusy}
                  onClick={() => skipMut.mutate()}
                >
                  {skipMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <SkipForward className="mr-2 h-4 w-4" />
                  )}
                  Skip
                </Button>
              </div>
              <Button
                variant="ghost"
                className="w-full text-[hsl(var(--mobile-text-muted))]"
                disabled={isBusy}
                onClick={() => dismissMut.mutate()}
              >
                {dismissMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 h-4 w-4" />
                )}
                Dismiss permanently
              </Button>
            </>
          ) : null}

          {isReopenable && !snoozeMode ? (
            <Button
              variant="outline"
              className="w-full"
              disabled={isBusy}
              onClick={() => reopenMut.mutate()}
            >
              {reopenMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Reopen
            </Button>
          ) : null}

          <BottomSafeAreaReserve size="compact" />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── Desktop sidebar ─────────────────────────────────────────────────────────

function HabitCoachDesktopSidebar({
  totalCount,
  snoozedCount,
  isEnabled,
  spotlightTitle,
}: {
  totalCount: number;
  snoozedCount: number;
  isEnabled: boolean | undefined;
  spotlightTitle: string | null;
}) {
  return (
    <aside className="hidden space-y-4 lg:block lg:sticky lg:top-4">
      {/* Stats card */}
      <div
        className={cn(
          MOBILE_CARD_RADIUS,
          'border border-[hsl(var(--mobile-border-subtle))] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)]',
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]">
            <ListChecks className="h-4 w-4 text-[hsl(var(--mobile-text-primary))]" />
          </div>
          <div className="min-w-0">
            <p className="mb-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]">
              Habit Summary
            </p>
            <p className="mb-0 mt-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              {isEnabled === false ? 'Habits disabled' : 'Your active habits'}
            </p>
            {spotlightTitle ? (
              <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
                Top pick: {spotlightTitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3.5 py-3">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Total habits</p>
            <p className="mb-0 mt-1 text-xl font-semibold text-[hsl(var(--mobile-text-primary))]">{totalCount}</p>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3.5 py-3">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Snoozed</p>
            <p className="mb-0 mt-1 text-xl font-semibold text-[hsl(var(--mobile-text-primary))]">{snoozedCount}</p>
          </div>
          <div className="col-span-2 rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3.5 py-3">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Status</p>
            <p className="mb-0 mt-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              {isEnabled === false ? 'Disabled for this property' : 'Active'}
            </p>
          </div>
        </div>
      </div>

      {/* How it works card */}
      <div
        className={cn(
          MOBILE_CARD_RADIUS,
          'border border-[hsl(var(--mobile-border-subtle))] bg-[linear-gradient(160deg,#ffffff,hsl(var(--mobile-brand-soft)))] p-5',
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-brand-border))] bg-white text-[hsl(var(--mobile-brand-strong))]">
            <Info className="h-4 w-4" />
          </div>
          <div>
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">How it works</p>
            <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
              Home Habit Coach generates personalised maintenance routines based on your home&apos;s systems, age, climate, and the current season.
            </p>
            <p className={cn('mb-0 mt-3 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
              Complete habits to build a maintenance history. Snooze or skip habits that don&apos;t apply right now.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Tab = 'active' | 'history';

export default function HomeHabitCoachClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = React.useState<Tab>('active');
  const [selectedHabit, setSelectedHabit] = React.useState<PropertyHabit | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const spotlightQ = useQuery({
    queryKey: ['home-habits-spotlight', propertyId],
    queryFn: () => getSpotlightHabit(propertyId),
    enabled: Boolean(propertyId),
    staleTime: 5 * 60 * 1000,
  });

  const habitsQ = useQuery({
    queryKey: ['home-habits', propertyId],
    queryFn: () => listHabits(propertyId, { includeSnoozed: true, limit: 50 }),
    enabled: Boolean(propertyId),
    staleTime: 5 * 60 * 1000,
  });

  const historyQ = useQuery({
    queryKey: ['home-habits-history', propertyId],
    queryFn: () => getHabitHistory(propertyId, { limit: 30 }),
    enabled: Boolean(propertyId) && tab === 'history',
    staleTime: 5 * 60 * 1000,
  });

  const prefsQ = useQuery({
    queryKey: ['home-habits-prefs', propertyId],
    queryFn: () => getPreferences(propertyId),
    enabled: Boolean(propertyId),
    staleTime: 10 * 60 * 1000,
  });

  const generateMut = useMutation({
    mutationFn: () => generateHabits(propertyId),
    onSuccess: (result) => {
      toast({ title: `${result.created} new habit${result.created !== 1 ? 's' : ''} generated` });
      qc.invalidateQueries({ queryKey: ['home-habits', propertyId] });
      qc.invalidateQueries({ queryKey: ['home-habits-spotlight', propertyId] });
    },
    onError: () =>
      toast({ title: getHabitActionErrorMessage('generate'), variant: 'destructive' }),
  });

  const toggleEnabledMut = useMutation({
    mutationFn: (isEnabled: boolean) => updatePreferences(propertyId, { isEnabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['home-habits-prefs', propertyId] }),
    onError: () => toast({ title: 'Could not update preferences', variant: 'destructive' }),
  });

  function openHabit(habit: PropertyHabit) {
    setSelectedHabit(habit);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setSelectedHabit(null);
  }

  const spotlight = spotlightQ.data?.habit ?? null;
  const habits = habitsQ.data?.habits ?? [];
  const historyHabits = historyQ.data?.habits ?? [];
  const prefs = prefsQ.data;

  // Filter out the spotlight from the feed to avoid duplication
  const feedHabits = habits.filter((h) => h.id !== spotlight?.id);

  const isLoading = spotlightQ.isLoading || habitsQ.isLoading;
  const isError = habitsQ.isError;

  // Determine empty state variant
  const snoozedCount = habits.filter((h) => h.status === 'SNOOZED').length;
  const allSnoozed = habits.length > 0 && habits.every((h) => h.status === 'SNOOZED');

  return (
    <>
      <MobilePageContainer className="space-y-6 pt-2 lg:max-w-7xl lg:px-8 lg:pb-10">
        {/* Header */}
        <MobileSection>
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/properties/${propertyId}`}
              className="no-brand-style inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]"
            >
              <ArrowLeft className="h-4 w-4 text-[hsl(var(--mobile-text-primary))]" />
            </Link>
            <MobilePageIntro
              eyebrow="Home Tools"
              title="Home Habit Coach"
              subtitle="Seasonal care routines and safety checks"
              className="flex-1 space-y-0"
            />
          </div>
        </MobileSection>

        <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:space-y-0 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">

        {/* Disabled banner */}
        {prefs && !prefs.isEnabled ? (
          <MobileSection>
            <MobileCard variant="compact" className="border-amber-200 bg-amber-50">
              <div className="flex items-center justify-between gap-3">
                <p className={cn('text-amber-700', MOBILE_TYPE_TOKENS.body)}>
                  Home habits are disabled for this property.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => toggleEnabledMut.mutate(true)}
                  disabled={toggleEnabledMut.isPending}
                >
                  Enable
                </Button>
              </div>
            </MobileCard>
          </MobileSection>
        ) : null}

        {/* Generate / refresh action */}
        {prefs?.isEnabled !== false ? (
          <MobileSection>
            <div className="flex items-center justify-between gap-3">
              <MobileSectionHeader
                title="Your habits"
                subtitle={habits.length > 0 ? `${habits.length} active` : undefined}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={generateMut.isPending}
                onClick={() => generateMut.mutate()}
                className="shrink-0"
              >
                {generateMut.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
            </div>
          </MobileSection>
        ) : null}

        {/* Tab switcher */}
        <MobileSection>
          <div className="flex gap-1 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-1">
            <button
              type="button"
              onClick={() => setTab('active')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-colors',
                tab === 'active'
                  ? 'bg-white text-[hsl(var(--mobile-text-primary))] shadow-sm'
                  : 'text-[hsl(var(--mobile-text-muted))]',
              )}
            >
              <ListChecks className="h-4 w-4" />
              Active
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-colors',
                tab === 'history'
                  ? 'bg-white text-[hsl(var(--mobile-text-primary))] shadow-sm'
                  : 'text-[hsl(var(--mobile-text-muted))]',
              )}
            >
              <History className="h-4 w-4" />
              History
            </button>
          </div>
        </MobileSection>

        {/* ── Active tab ── */}
        {tab === 'active' ? (
          <>
            {isLoading ? (
              <MobileSection>
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--mobile-text-muted))]" />
                </div>
              </MobileSection>
            ) : null}

            {!isLoading && isError ? (
              <MobileSection>
                <EmptyStateCard
                  title="Could not load habits"
                  description={getHabitLoadErrorMessage('list')}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => habitsQ.refetch()}
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Retry
                    </Button>
                  }
                />
              </MobileSection>
            ) : null}

            {!isLoading && !isError && spotlight ? (
              <MobileSection>
                <MobileSectionHeader title="Top pick" />
                <SpotlightCard habit={spotlight} onOpen={openHabit} />
              </MobileSection>
            ) : null}

            {!isLoading && !isError && feedHabits.length > 0 ? (
              <MobileSection>
                <MobileSectionHeader title="All habits" />
                <div className="space-y-2">
                  {feedHabits.map((habit) => (
                    <HabitRow key={habit.id} habit={habit} onOpen={openHabit} />
                  ))}
                </div>
              </MobileSection>
            ) : null}

            {!isLoading && !isError && habits.length === 0 ? (
              <MobileSection>
                <EmptyStateCard
                  title="No habits yet"
                  description="Generate personalized care habits based on your home's profile, systems, and the current season."
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={generateMut.isPending}
                      onClick={() => generateMut.mutate()}
                    >
                      {generateMut.isPending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Generate habits
                    </Button>
                  }
                />
              </MobileSection>
            ) : null}

            {!isLoading && !isError && allSnoozed ? (
              <MobileSection>
                <MobileCard variant="compact" className="border-slate-200 bg-slate-50">
                  <p className={cn('mb-1 font-medium text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
                    All caught up for now
                  </p>
                  <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
                    {snoozedCount === 1
                      ? '1 habit is snoozed and will resurface when ready.'
                      : `${snoozedCount} habits are snoozed and will resurface when ready.`}
                  </p>
                </MobileCard>
              </MobileSection>
            ) : null}

            {/* Preferences toggle */}
            {prefs ? (
              <MobileSection>
                <MobileSectionHeader title="Preferences" />
                <MobileCard variant="compact">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn('mb-0 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
                        Habit suggestions
                      </p>
                      <p className={cn('mb-0 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
                        {prefs.isEnabled ? 'Enabled for this property' : 'Disabled'}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={prefs.isEnabled}
                      disabled={toggleEnabledMut.isPending}
                      onClick={() => toggleEnabledMut.mutate(!prefs.isEnabled)}
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
                        prefs.isEnabled
                          ? 'bg-[hsl(var(--mobile-brand-strong))]'
                          : 'bg-[hsl(var(--mobile-border-subtle))]',
                      )}
                    >
                      <span
                        className={cn(
                          'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform',
                          prefs.isEnabled ? 'translate-x-5' : 'translate-x-0',
                        )}
                      />
                    </button>
                  </div>
                </MobileCard>
              </MobileSection>
            ) : null}
          </>
        ) : null}

        {/* ── History tab ── */}
        {tab === 'history' ? (
          <MobileSection>
            {historyQ.isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--mobile-text-muted))]" />
              </div>
            ) : historyQ.isError ? (
              <EmptyStateCard
                title="Could not load history"
                description={getHabitLoadErrorMessage('history')}
                action={
                  <Button size="sm" variant="outline" onClick={() => historyQ.refetch()}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Retry
                  </Button>
                }
              />
            ) : historyHabits.length === 0 ? (
              <EmptyStateCard
                title="No history yet"
                description="Completed, skipped, or dismissed habits will appear here."
              />
            ) : (
              <div className="space-y-2">
                {historyHabits.map((habit) => (
                  <HabitRow key={habit.id} habit={habit} onOpen={openHabit} showDate />
                ))}
              </div>
            )}
          </MobileSection>
        ) : null}

            <BottomSafeAreaReserve />
          </div>

          <RelatedTools
            context="home-habit-coach"
            currentToolId="home-habit-coach"
            propertyId={propertyId}
            minViewport="lg"
          />

          <HabitCoachDesktopSidebar
            totalCount={habits.length}
            snoozedCount={snoozedCount}
            isEnabled={prefs?.isEnabled}
            spotlightTitle={spotlight ? (spotlight.titleOverride ?? spotlight.habitTemplate.title) : null}
          />
        </div>
      </MobilePageContainer>

      <HabitDetailSheet
        habit={selectedHabit}
        propertyId={propertyId}
        open={sheetOpen}
        onClose={closeSheet}
        onMutated={() => {
          // Sheet closes itself after mutation; this is a noop hook for future extension
        }}
      />
    </>
  );
}
