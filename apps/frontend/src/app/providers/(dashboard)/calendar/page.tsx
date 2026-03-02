'use client';

import { useMemo, useState } from 'react';
import { addMonths, endOfMonth, format, getDate, getDay, isSameDay, isSameMonth, startOfMonth, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import DateField from '@/components/shared/DateField';
import { cn } from '@/lib/utils';

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

const DAY_KEYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ProviderCalendarPage() {
  const [viewMonth, setViewMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(new Date());
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Calendar & Availability</h1>
        <p className="mt-2 text-gray-600">Set your working hours and manage blocked dates</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{format(viewMonth, 'MMMM yyyy')}</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-[#0D9488] hover:bg-[#F0FDFA] hover:text-[#0D9488]"
                onClick={() => setViewMonth((prev) => startOfMonth(subMonths(prev, 1)))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-[#0D9488] hover:bg-[#F0FDFA] hover:text-[#0D9488]"
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

          <div className="grid grid-cols-7 gap-2">
            {WEEKDAY_LABELS.map((day) => (
              <div key={day} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
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
                      ? 'border-gray-200 bg-white text-gray-800 hover:border-[#0D9488]/40 hover:bg-[#F0FDFA]'
                      : 'border-transparent bg-gray-50 text-gray-300',
                    isSelected && 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E]',
                    isToday && 'ring-1 ring-[#0D9488]/50'
                  )}
                >
                  <div className="text-sm font-medium">{dayNumber}</div>
                  {hasBooking && <div className="mx-auto mt-1 h-1.5 w-1.5 rounded-full bg-[#0D9488]" />}
                  {isBlocked && <div className="mx-auto mt-1 h-1.5 w-1.5 rounded-full bg-red-500" />}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#0D9488]" />
              Has booking
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              Blocked
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full ring-1 ring-[#0D9488]/50" />
              Today
            </div>
          </div>

          <div className="text-center">
            <button
              type="button"
              className="inline-flex h-[40px] items-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition-colors hover:border-[#0D9488] hover:bg-[#F0FDFA] hover:text-[#0F766E]"
            >
              Block selected date
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Working Hours</h2>
          <div className="space-y-4">
            {DAY_KEYS.map((dayKey) => {
              const hours = workingHours[dayKey];
              const label = dayKey.slice(0, 3).toUpperCase();

              return (
                <div key={dayKey} className="space-y-2 rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
                      <input
                        type="checkbox"
                        checked={hours.enabled}
                        onChange={(e) =>
                          setWorkingHours((prev) => ({
                            ...prev,
                            [dayKey]: { ...prev[dayKey], enabled: e.target.checked },
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-[#0D9488] focus:ring-[#0D9488]"
                      />
                      {label}
                    </label>
                    {!hours.enabled && <span className="text-xs text-gray-400">Unavailable</span>}
                  </div>

                  {hours.enabled && (
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
                        className="h-[40px] w-full rounded-md border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] transition-[border-color,box-shadow] focus:border-[#0D9488] focus:outline-none focus:ring-[3px] focus:ring-[#0D9488]/10"
                      />
                      <Clock3 className="h-4 w-4 text-gray-400" />
                      <input
                        type="time"
                        value={hours.end}
                        onChange={(e) =>
                          setWorkingHours((prev) => ({
                            ...prev,
                            [dayKey]: { ...prev[dayKey], end: e.target.value },
                          }))
                        }
                        className="h-[40px] w-full rounded-md border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827] transition-[border-color,box-shadow] focus:border-[#0D9488] focus:outline-none focus:ring-[3px] focus:ring-[#0D9488]/10"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5">
            <button
              type="button"
              className="inline-flex h-[40px] w-full items-center justify-center rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90"
            >
              Save working hours
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Upcoming Bookings</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Home Inspection</p>
              <p className="text-xs text-gray-500">Nov 12, 2025 at 2:00 PM</p>
            </div>
            <span className="text-sm font-medium text-[#0F766E]">View Details →</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Minor Repairs</p>
              <p className="text-xs text-gray-500">Nov 15, 2025 at 10:00 AM</p>
            </div>
            <span className="text-sm font-medium text-[#0F766E]">View Details →</span>
          </div>
        </div>
      </div>
    </div>
  );
}
