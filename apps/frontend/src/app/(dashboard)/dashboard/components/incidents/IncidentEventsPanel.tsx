// apps/frontend/src/app/(dashboard)/dashboard/components/incidents/IncidentEventsPanel.tsx
import React from 'react';
import { formatDistanceToNow, parseISO, differenceInMinutes } from 'date-fns';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Eye, 
  PlayCircle, 
  RefreshCw, 
  XCircle,
  Activity
} from 'lucide-react';
import type { IncidentEventDTO } from '@/types/incidents.types';

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function getRelativeTime(ts: string, referenceDate?: Date): string {
  try {
    const date = parseISO(ts);
    if (referenceDate) {
      const minutes = differenceInMinutes(date, referenceDate);
      if (minutes === 0) return 'at the same time';
      if (minutes > 0) return `${minutes} min${minutes !== 1 ? 's' : ''} later`;
      return `${Math.abs(minutes)} min${Math.abs(minutes) !== 1 ? 's' : ''} earlier`;
    }
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return ts;
  }
}

function getEventIcon(eventType: string) {
  const type = eventType.toLowerCase();
  if (type.includes('created') || type.includes('detected')) return AlertTriangle;
  if (type.includes('resolved') || type.includes('closed')) return CheckCircle2;
  if (type.includes('acknowledged') || type.includes('viewed')) return Eye;
  if (type.includes('orchestrated') || type.includes('action')) return PlayCircle;
  if (type.includes('evaluated') || type.includes('reassessed')) return RefreshCw;
  if (type.includes('dismissed') || type.includes('ignored')) return XCircle;
  return Activity;
}

function getEventColor(eventType: string) {
  const type = eventType.toLowerCase();
  if (type.includes('created') || type.includes('detected')) return 'text-red-600 bg-red-50 border-red-200';
  if (type.includes('resolved') || type.includes('closed')) return 'text-green-600 bg-green-50 border-green-200';
  if (type.includes('acknowledged') || type.includes('viewed')) return 'text-blue-600 bg-blue-50 border-blue-200';
  if (type.includes('orchestrated') || type.includes('action')) return 'text-purple-600 bg-purple-50 border-purple-200';
  if (type.includes('evaluated') || type.includes('reassessed')) return 'text-amber-600 bg-amber-50 border-amber-200';
  if (type.includes('dismissed') || type.includes('ignored')) return 'text-slate-600 bg-slate-50 border-slate-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
}

export default function IncidentEventsPanel({ events }: { events: IncidentEventDTO[] }) {
  // Sort events by date (newest first)
  const sortedEvents = [...events].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Get reference date (first event) for relative time calculations
  const referenceDate = sortedEvents.length > 0 ? parseISO(sortedEvents[sortedEvents.length - 1].createdAt) : undefined;

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-slate-600" />
        <h3 className="text-sm font-semibold">Incident Timeline</h3>
      </div>
      {sortedEvents.length ? (
        <div className="mt-3 space-y-2">
          {sortedEvents.map((e, index) => {
            const Icon = getEventIcon(e.type);
            const colorClasses = getEventColor(e.type);
            const isFirst = index === sortedEvents.length - 1;
            
            return (
              <div key={e.id} className="relative">
                {/* Timeline connector line - more compact */}
                {!isFirst && (
                  <div className="absolute left-[15px] top-[-8px] h-2 w-0.5 bg-slate-200" />
                )}
                
                <div className={`rounded-lg border p-2.5 ${colorClasses}`}>
                  <div className="flex items-start gap-2.5">
                    <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold">{e.type}</p>
                        <p className="text-xs text-slate-600 whitespace-nowrap">
                          {getRelativeTime(e.createdAt)}
                        </p>
                      </div>
                      {e.message ? (
                        <p className="mt-1 text-xs leading-relaxed">{e.message}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">No events yet.</p>
      )}
    </div>
  );
}
