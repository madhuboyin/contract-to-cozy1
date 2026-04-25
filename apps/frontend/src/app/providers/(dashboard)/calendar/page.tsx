'use client';

import { useMemo, useState } from 'react';
import { addMonths, endOfMonth, format, getDate, getDay, isSameDay, isSameMonth, startOfMonth, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import DateField from '@/components/shared/DateField';
import { cn } from '@/lib/utils';
import {
  BottomSafeAreaReserve,
  MobileCard,
  MobileSection,
  MobileSectionHeader,
  ResultHeroCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderShellTemplate from '@/components/providers/ProviderShellTemplate';

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

const DAY_KEYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ProviderCalendarPage() {
  const [viewMonth, setViewMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [workingHours, setWorkingHours] = useState<Record<DayKey, { enabled: boolean; start: string; end: string }>>({
    monday: { enabled: true, start: '09:00', end: '17:00' },
    tuesday: { enabled: true, start: '09:00', end: '17:00' },
    wednesday: { enabled: true, start: '09:00', end: '17:00' },
    thursday: { enabled: true, start: '09:00', end: '17:00' },
    friday: { enabled: true, start: '09:00', end: '17:00' },
    saturday: { enabled: false, start: '09:00', end: '13:00' },
    sunday: { enabled: false, start: '09:00', end: '13:00' },
  });

  const bookedDays = [12, 15, 18];
  const blockedDays = [20, 21];

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

  const enabledDays = DAY_KEYS.filter((day) => workingHours[day].enabled).length;
  const handleSaveHours = () => {
    setLastSavedAt(new Date().toISOString());
  };

  return (
    <ProviderShellTemplate
      title="Calendar & Availability"
      subtitle="Keep your schedule clear and bookable with visible availability signals."
      eyebrow="Provider Availability"
      primaryAction={{
        title: 'Keep your next 7 days bookable.',
        description: 'Save working hours early to prevent missed requests and reduce homeowner uncertainty.',
        primaryAction: (
          <button
            type="button"
            onClick={handleSaveHours}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
          >
            Save working hours
          </button>
        ),
        impactLabel: enabledDays >= 5 ? 'Healthy availability' : 'Availability risk',
        confidenceLabel: lastSavedAt ? `Last saved ${format(new Date(lastSavedAt), 'MMM d, h:mm a')}` : 'Not saved this session',
      }}
      trust={{
        confidenceLabel: 'Availability confidence is based on active working days and upcoming booking overlap.',
        freshnessLabel: lastSavedAt ? `Updated ${format(new Date(lastSavedAt), 'MMM d, h:mm a')}` : 'Update after saving working hours',
        sourceLabel: 'Provider working-hour settings and confirmed booking schedule records.',
        rationale: 'Clear availability helps homeowners pick realistic time slots and reduces cancellations.',
      }}
      summary={
        <ResultHeroCard
          eyebrow="Availability"
          title={format(selectedDate, 'EEEE, MMM d')}
          value={`${enabledDays}/7`}
          status={<StatusChip tone={enabledDays >= 5 ? 'good' : 'elevated'}>{enabledDays >= 5 ? 'Open week' : 'Limited week'}</StatusChip>}
          summary="Configured working days this week."
          highlights={[
            `${bookedDays.length} booked dates this month`,
            `${blockedDays.length} blocked dates set`,
            `Viewing ${format(viewMonth, 'MMMM yyyy')}`,
          ]}
        />
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MobileCard variant="compact" className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">{format(viewMonth, 'MMMM yyyy')}</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-brand-primary hover:bg-brand-primary/5 hover:text-brand-primary"
                onClick={() => setViewMonth((prev) => startOfMonth(subMonths(prev, 1)))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-brand-primary hover:bg-brand-primary/5 hover:text-brand-primary"
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

          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAY_LABELS.map((day) => (
              <div key={day} className="py-1 text-center text-[11px] font-semibold tracking-normal text-slate-500">
                {day}
              </div>
            ))}
            {calendarCells.map((cell, index) => {
              const dayNumber = getDate(cell.date);
              const isToday = isSameDay(cell.date, new Date());
              const isSelected = isSameDay(cell.date, selectedDate);
              const hasBooking = cell.isCurrentMonth && bookedDays.includes(dayNumber);
              const isBlocked = cell.isCurrentMonth && blockedDays.includes(dayNumber);

              return (
                <button
                  key={`${format(cell.date, 'yyyy-MM-dd')}-${index}`}
                  type="button"
                  disabled={!cell.isCurrentMonth}
                  onClick={() => setSelectedDate(cell.date)}
                  className={cn(
                    'aspect-square rounded-lg border p-1.5 text-center transition-colors',
                    cell.isCurrentMonth
                      ? 'border-slate-200 bg-white text-slate-800 hover:border-brand-primary/40 hover:bg-brand-primary/5'
                      : 'border-transparent bg-slate-50 text-slate-300',
                    isSelected && 'border-brand-primary bg-brand-primary/5 text-brand-primary',
                    isToday && 'ring-1 ring-brand-primary/50'
                  )}
                >
                  <div className="text-sm font-medium">{dayNumber}</div>
                  {hasBooking ? <div className="mx-auto mt-1 h-1.5 w-1.5 rounded-full bg-brand-primary" /> : null}
                  {isBlocked ? <div className="mx-auto mt-1 h-1.5 w-1.5 rounded-full bg-rose-500" /> : null}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-primary" />
              Has booking
            </div>
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
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Block selected date
          </button>
        </MobileCard>

        <MobileCard variant="compact" className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Working Hours</h2>
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

          <button
            type="button"
            onClick={handleSaveHours}
            className="inline-flex min-h-[40px] w-full items-center justify-center rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90"
          >
            Save working hours
          </button>
        </MobileCard>
      </div>

      <MobileSection>
        <MobileSectionHeader title="Upcoming Bookings" subtitle="Quick preview of upcoming appointments." />
        <MobileCard variant="compact" className="space-y-2.5">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <div>
              <p className="mb-0 text-sm font-medium text-slate-900">Home Inspection</p>
              <p className="mb-0 text-xs text-slate-500">Nov 12, 2025 at 2:00 PM</p>
            </div>
            <span className="text-xs font-semibold text-brand-primary">View details</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <div>
              <p className="mb-0 text-sm font-medium text-slate-900">Minor Repairs</p>
              <p className="mb-0 text-xs text-slate-500">Nov 15, 2025 at 10:00 AM</p>
            </div>
            <span className="text-xs font-semibold text-brand-primary">View details</span>
          </div>
        </MobileCard>
      </MobileSection>

      <BottomSafeAreaReserve size="chatAware" />
    </ProviderShellTemplate>
  );
}
