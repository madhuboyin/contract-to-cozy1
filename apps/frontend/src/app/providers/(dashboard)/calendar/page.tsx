'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  endOfDay,
  endOfMonth,
  format,
  getDate,
  getDay,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import DateField from '@/components/shared/DateField';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import { ProviderAvailabilityWindow } from '@/types';
import {
  BottomSafeAreaReserve,
  MobileCard,
  ResultHeroCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderShellTemplate from '@/components/providers/ProviderShellTemplate';

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

const DAY_KEYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function windowCoversDate(window: ProviderAvailabilityWindow, date: Date): boolean {
  return isWithinInterval(date, {
    start: startOfDay(new Date(window.startDate)),
    end: endOfDay(new Date(window.endDate)),
  });
}

export default function ProviderCalendarPage() {
  const [viewMonth, setViewMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [windows, setWindows] = useState<ProviderAvailabilityWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recurring weekly hours have no backend yet (see Open Decision #2 in
  // docs/functional/PROVIDER_PORTFOLIO_AVAILABILITY_FRD.md) — this stays
  // local-only until that's built. Only blocked dates below are persisted.
  const [workingHours, setWorkingHours] = useState<Record<DayKey, { enabled: boolean; start: string; end: string }>>({
    monday: { enabled: true, start: '09:00', end: '17:00' },
    tuesday: { enabled: true, start: '09:00', end: '17:00' },
    wednesday: { enabled: true, start: '09:00', end: '17:00' },
    thursday: { enabled: true, start: '09:00', end: '17:00' },
    friday: { enabled: true, start: '09:00', end: '17:00' },
    saturday: { enabled: false, start: '09:00', end: '13:00' },
    sunday: { enabled: false, start: '09:00', end: '13:00' },
  });

  useEffect(() => {
    fetchAvailability();
  }, []);

  const fetchAvailability = async () => {
    try {
      setLoading(true);
      const response = await api.getMyAvailability();
      if (response.success) {
        setWindows(response.data);
      }
    } catch (err) {
      console.error('Error fetching availability:', err);
      setError('Failed to load availability');
    } finally {
      setLoading(false);
    }
  };

  const blockedWindows = useMemo(() => windows.filter((w) => !w.isAvailable), [windows]);

  const calendarCells = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const leadingDays = getDay(monthStart);
    const daysInMonth = getDate(monthEnd);
    const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

    return Array.from({ length: totalCells }, (_, index) => {
      const dayNumber = index - leadingDays + 1;
      const cellDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), dayNumber);
      return {
        date: cellDate,
        isCurrentMonth: isSameMonth(cellDate, viewMonth),
      };
    });
  }, [viewMonth]);

  const selectedDateBlock = useMemo(
    () => blockedWindows.find((w) => windowCoversDate(w, selectedDate)),
    [blockedWindows, selectedDate]
  );

  const enabledDays = DAY_KEYS.filter((day) => workingHours[day].enabled).length;

  const handleToggleBlock = async () => {
    setError(null);
    try {
      setSaving(true);
      if (selectedDateBlock) {
        await api.deleteAvailabilityWindow(selectedDateBlock.id);
      } else {
        await api.createAvailabilityWindow({
          startDate: startOfDay(selectedDate).toISOString(),
          endDate: endOfDay(selectedDate).toISOString(),
          isAvailable: false,
          reason: 'Blocked by provider',
        });
      }
      await fetchAvailability();
    } catch (err: any) {
      console.error('Error updating availability:', err);
      setError(err?.message || 'Failed to update availability');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProviderShellTemplate
      title="Calendar & Availability"
      subtitle="Keep your schedule clear and bookable with visible availability signals."
      eyebrow="Provider Availability"
      primaryAction={{
        title: selectedDateBlock ? 'This date is currently blocked.' : 'Block dates you can\'t take work.',
        description: 'Blocked dates are excluded from homeowner search when they filter for available providers.',
        primaryAction: (
          <button
            type="button"
            onClick={handleToggleBlock}
            disabled={saving}
            className={cn(
              'inline-flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60',
              selectedDateBlock ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-primary hover:bg-brand-primary/90'
            )}
          >
            {saving ? 'Saving...' : selectedDateBlock ? 'Unblock selected date' : 'Block selected date'}
          </button>
        ),
        impactLabel: enabledDays >= 5 ? 'Healthy availability' : 'Availability risk',
        confidenceLabel: `${blockedWindows.length} blocked date${blockedWindows.length === 1 ? '' : 's'} saved`,
      }}
      trust={{
        confidenceLabel: 'Availability confidence is based on active working days and blocked-date coverage.',
        freshnessLabel: 'Blocked dates update live on save; weekly hours are local-only for now.',
        sourceLabel: 'Provider-submitted availability windows.',
        rationale: 'Clear availability helps homeowners pick realistic time slots and reduces cancellations.',
      }}
      summary={
        <ResultHeroCard
          eyebrow="Availability"
          title={format(selectedDate, 'EEEE, MMM d')}
          value={`${blockedWindows.length}`}
          status={<StatusChip tone={selectedDateBlock ? 'elevated' : 'good'}>{selectedDateBlock ? 'Blocked' : 'Open'}</StatusChip>}
          summary="Blocked dates saved to your profile."
          highlights={[
            `${blockedWindows.length} blocked date${blockedWindows.length === 1 ? '' : 's'} total`,
            `Viewing ${format(viewMonth, 'MMMM yyyy')}`,
          ]}
        />
      }
      routeState={
        loading
          ? { state: 'loading', title: 'Loading availability', description: 'Fetching your saved blocked dates.' }
          : null
      }
      hideContentWhenState={loading}
    >
      {error ? (
        <MobileCard variant="compact" className="border-rose-200 bg-rose-50 text-rose-800">
          {error}
        </MobileCard>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MobileCard variant="compact" className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">{format(viewMonth, 'MMMM yyyy')}</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-brand-primary hover:bg-brand-primary/5 hover:text-brand-primary"
                onClick={() => setViewMonth((prev) => startOfMonth(subMonths(prev, 1)))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-brand-primary hover:bg-brand-primary/5 hover:text-brand-primary"
                onClick={() => setViewMonth((prev) => startOfMonth(addMonths(prev, 1)))}
                aria-label="Next month"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          <DateField
            id="selectedDate"
            label="Jump to date"
            value={format(selectedDate, 'yyyy-MM-dd')}
            onChange={(value) => {
              if (!value) return;
              const nextDate = new Date(`${value}T00:00:00`);
              if (Number.isNaN(nextDate.getTime())) return;
              setSelectedDate(nextDate);
              setViewMonth(startOfMonth(nextDate));
            }}
          />

          <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5">
            {WEEKDAY_LABELS.map((day) => (
              <div key={day} className="py-1 text-center text-[9px] sm:text-[11px] font-semibold tracking-normal text-slate-500">
                <span className="sm:hidden">{day.slice(0, 1)}</span>
                <span className="hidden sm:inline">{day}</span>
              </div>
            ))}
            {calendarCells.map((cell, index) => {
              const dayNumber = getDate(cell.date);
              const isToday = isSameDay(cell.date, new Date());
              const isSelected = isSameDay(cell.date, selectedDate);
              const isBlocked = cell.isCurrentMonth && blockedWindows.some((w) => windowCoversDate(w, cell.date));

              return (
                <button
                  key={`${format(cell.date, 'yyyy-MM-dd')}-${index}`}
                  type="button"
                  disabled={!cell.isCurrentMonth}
                  onClick={() => setSelectedDate(cell.date)}
                  className={cn(
                    'aspect-square rounded-lg border p-0.5 sm:p-1.5 text-center transition-colors',
                    cell.isCurrentMonth
                      ? 'border-slate-200 bg-white text-slate-800 hover:border-brand-primary/40 hover:bg-brand-primary/5'
                      : 'border-transparent bg-slate-50 text-slate-300',
                    isSelected && 'border-brand-primary bg-brand-primary/5 text-brand-primary',
                    isToday && 'ring-1 ring-brand-primary/50'
                  )}
                >
                  <div className="text-[11px] sm:text-sm font-medium">{dayNumber}</div>
                  {isBlocked ? <div className="mx-auto mt-1 h-1.5 w-1.5 rounded-full bg-rose-500" /> : null}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              Blocked
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full ring-1 ring-brand-primary/50" />
              Today
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleBlock}
            disabled={saving}
            className={cn(
              'inline-flex min-h-[44px] items-center justify-center rounded-lg border px-4 text-sm font-medium disabled:opacity-60',
              selectedDateBlock
                ? 'border-rose-300 bg-white text-rose-700 hover:bg-rose-50'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            )}
          >
            {saving ? 'Saving...' : selectedDateBlock ? 'Unblock selected date' : 'Block selected date'}
          </button>
        </MobileCard>

        <MobileCard variant="compact" className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Working Hours</h2>
            <p className="mt-1 text-xs text-slate-500">
              Not saved to your profile yet — only blocked dates on the calendar are. Set your typical hours here for now.
            </p>
          </div>
          {DAY_KEYS.map((dayKey) => {
            const hours = workingHours[dayKey];
            const label = dayKey.slice(0, 3).toUpperCase();

            return (
              <div key={dayKey} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={hours.enabled}
                      onChange={(e) =>
                        setWorkingHours((prev) => ({
                          ...prev,
                          [dayKey]: { ...prev[dayKey], enabled: e.target.checked },
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
                    />
                    {label}
                  </label>
                  {!hours.enabled ? <span className="text-xs text-slate-400">Unavailable</span> : null}
                </div>

                {hours.enabled ? (
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <input
                      type="time"
                      value={hours.start}
                      onChange={(e) =>
                        setWorkingHours((prev) => ({
                          ...prev,
                          [dayKey]: { ...prev[dayKey], start: e.target.value },
                        }))
                      }
                      className="h-[40px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-primary focus:outline-none focus:ring-[3px] focus:ring-brand-primary/10"
                    />
                    <Clock3 className="h-4 w-4 text-slate-400" />
                    <input
                      type="time"
                      value={hours.end}
                      onChange={(e) =>
                        setWorkingHours((prev) => ({
                          ...prev,
                          [dayKey]: { ...prev[dayKey], end: e.target.value },
                        }))
                      }
                      className="h-[40px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-primary focus:outline-none focus:ring-[3px] focus:ring-brand-primary/10"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </MobileCard>
      </div>

      <BottomSafeAreaReserve size="chatAware" />
    </ProviderShellTemplate>
  );
}
