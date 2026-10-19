import type { AskRecordInspectionRow, AskRecordMaintenanceRow, AskRecordTimelineRow } from '@/features/ask/types';
import { AskCompactRow } from '../presentation/AskLayoutPrimitives';

const fullDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const monthYear = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const yearOnly = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'UTC' });

/** The date at no more precision than was recorded: a month, a year, or a range is never shown as a day. */
export function timelineDateLabel(event: Pick<AskRecordTimelineRow, 'occurredAt' | 'datePrecision' | 'dateRangeStart' | 'dateRangeEnd'>): string {
  const occurred = new Date(event.occurredAt);
  switch (event.datePrecision) {
    case 'UNKNOWN': return 'Date unknown';
    case 'MONTH': return monthYear.format(occurred);
    case 'YEAR': return yearOnly.format(occurred);
    case 'RANGE': return event.dateRangeStart && event.dateRangeEnd ? `${fullDate.format(new Date(event.dateRangeStart))} – ${fullDate.format(new Date(event.dateRangeEnd))}` : `Around ${fullDate.format(occurred)}`;
    default: return fullDate.format(occurred);
  }
}

// These sections have no per-record Ask read yet, so a row carries no action; each states its facts and the index opens the Ask answer.
export function RecordTimelineRow({ event }: { event: AskRecordTimelineRow }) {
  const facts = [event.typeLabel, timelineDateLabel(event), event.verificationLabel, event.providerName, event.isPrivate ? 'Private' : null].filter(Boolean);
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={event.id}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{event.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
        {event.summary && <p className="mt-1 text-xs text-slate-600">{event.summary}</p>}
      </div>
    </AskCompactRow>
  );
}

export function RecordMaintenanceRow({ task }: { task: AskRecordMaintenanceRow }) {
  const facts = [
    task.scope,
    task.completedOn ? `Completed ${fullDate.format(new Date(task.completedOn))}` : 'Completion date not recorded',
    task.actualCost ? `Actual cost ${task.actualCost}` : null,
    `${task.priority} priority`,
    task.source,
    task.repeats ? `Repeats ${task.repeats}` : null,
  ].filter(Boolean);
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={task.id}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{task.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
      </div>
    </AskCompactRow>
  );
}

export function RecordInspectionRow({ report }: { report: AskRecordInspectionRow }) {
  const facts = [fullDate.format(new Date(report.inspectionDate)), report.inspector, report.statusLabel].filter(Boolean);
  const findings = `${report.totalFindings} ${report.totalFindings === 1 ? 'finding' : 'findings'}`;
  const notes = [report.openFindings ? `${report.openFindings} open` : null, report.safetyFindings ? `${report.safetyFindings} safety` : null, report.majorFindings ? `${report.majorFindings} major` : null].filter(Boolean);
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={report.id}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{report.reportTypeLabel}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
        <p className={`mt-1 text-xs font-semibold ${report.safetyFindings || report.majorFindings ? 'text-amber-800' : 'text-slate-700'}`}>{[findings, ...notes].join(' · ')}</p>
      </div>
    </AskCompactRow>
  );
}
