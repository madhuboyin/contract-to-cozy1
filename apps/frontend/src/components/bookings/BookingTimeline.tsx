'use client';

import { CheckCircle2, Circle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatEnumLabel } from '@/lib/utils/formatters';

const STATUS_STEPS = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] as const;

interface TimelineEntry {
  status: string;
  note?: string | null;
  createdAt: string;
}

interface BookingTimelineProps {
  currentStatus: string;
  timeline: TimelineEntry[];
}

export function BookingTimeline({ currentStatus, timeline }: BookingTimelineProps) {
  const currentIndex = STATUS_STEPS.indexOf(currentStatus as (typeof STATUS_STEPS)[number]);
  const isCancelled = currentStatus === 'CANCELLED' || currentStatus === 'DISPUTED';

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-gray-400">Booking Progress</h2>

      {isCancelled ? (
        <div className="flex items-center gap-2 text-sm font-medium text-red-600">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Booking {formatEnumLabel(currentStatus)}
          <span className="ml-1 font-normal text-gray-400">
            -{' '}
            {timeline[timeline.length - 1]?.createdAt
              ? new Date(timeline[timeline.length - 1].createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })
              : ''}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-0">
            {STATUS_STEPS.map((step, idx) => {
              const isCompleted = idx < currentIndex;
              const isCurrent = idx === currentIndex;
              const isFuture = idx > currentIndex;

              return (
                <div key={step} className="flex flex-1 items-center">
                  <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                        isCompleted && 'border-brand-primary bg-brand-primary text-white',
                        isCurrent && 'border-brand-primary bg-white text-brand-primary ring-2 ring-brand-primary/20',
                        isFuture && 'border-gray-200 bg-gray-50 text-gray-300'
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : isCurrent ? (
                        <Clock className="h-4 w-4 animate-pulse" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </div>
                    <span
                      className={cn(
                        'max-w-[52px] break-words px-0.5 text-center text-[10px] font-medium leading-tight',
                        isCompleted || isCurrent ? 'text-brand-primary' : 'text-gray-400'
                      )}
                    >
                      {formatEnumLabel(step)}
                    </span>
                  </div>

                  {idx < STATUS_STEPS.length - 1 && (
                    <div
                      className={cn(
                        'mx-1 h-0.5 w-full rounded-full transition-all',
                        idx < currentIndex ? 'bg-brand-primary' : 'bg-gray-200'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {timeline.length > 0 && (
            <p className="mt-4 text-center text-xs text-gray-400">
              Last updated:{' '}
              {new Date(timeline[timeline.length - 1].createdAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
