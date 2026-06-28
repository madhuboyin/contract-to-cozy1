'use client';
import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import type { PermitFlagItem, PermitUnpermittedFlagStatus } from '@/types';
import { FLAG_STATUS_LABELS, FLAG_STATUS_COLOR, RISK_LABELS, RISK_COLOR, WORK_TYPE_LABELS } from './PermitUtils';

interface Props {
  flag: PermitFlagItem;
  onUpdate: (patch: { status?: PermitUnpermittedFlagStatus; resolutionNotes?: string }) => Promise<void>;
}

const NEXT_ACTIONS: Array<{ label: string; toStatus: PermitUnpermittedFlagStatus }> = [
  { label: 'Start investigating', toStatus: 'INVESTIGATING' },
  { label: 'Mark permitted', toStatus: 'CONFIRMED_PERMITTED' },
  { label: 'Mark unpermitted', toStatus: 'CONFIRMED_UNPERMITTED' },
  { label: 'Will remediate', toStatus: 'WILL_REMEDIATE' },
  { label: 'Mark remediated', toStatus: 'REMEDIATED' },
  { label: 'Dismiss', toStatus: 'DISMISSED' },
];

const RESOLVED_STATUSES: PermitUnpermittedFlagStatus[] = [
  'CONFIRMED_PERMITTED', 'REMEDIATED', 'DISMISSED',
];

export default function UnpermittedFlagCard({ flag, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(flag.resolutionNotes ?? '');

  async function handleStatus(toStatus: PermitUnpermittedFlagStatus) {
    setSaving(true);
    try { await onUpdate({ status: toStatus }); } finally { setSaving(false); }
  }

  async function saveNote() {
    if (note === flag.resolutionNotes) return;
    setSaving(true);
    try { await onUpdate({ resolutionNotes: note }); } finally { setSaving(false); }
  }

  const isResolved = RESOLVED_STATUSES.includes(flag.status);
  const availableActions = NEXT_ACTIONS.filter((a) => a.toStatus !== flag.status);

  return (
    <div className={`rounded-2xl border bg-[hsl(var(--mobile-card-bg))] overflow-hidden ${isResolved ? 'opacity-70' : ''}`}>
      <button
        className="w-full flex items-start gap-3 p-4 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${flag.disclosureRisk === 'HIGH' ? 'text-red-500' : flag.disclosureRisk === 'MEDIUM' ? 'text-amber-500' : 'text-neutral-400'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{WORK_TYPE_LABELS[flag.workType]}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_COLOR[flag.disclosureRisk]}`}>
              {RISK_LABELS[flag.disclosureRisk]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${FLAG_STATUS_COLOR[flag.status]}`}>
              {FLAG_STATUS_LABELS[flag.status]}
            </span>
          </div>
          <p className="mt-1 text-xs text-[hsl(var(--mobile-text-secondary))] line-clamp-2">{flag.flagReason}</p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-neutral-400 mt-1 shrink-0" /> : <ChevronDown className="h-4 w-4 text-neutral-400 mt-1 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t px-4 pb-4 space-y-3">
          <p className="pt-3 text-xs text-[hsl(var(--mobile-text-secondary))]">{flag.flagReason}</p>

          {/* Notes */}
          <div>
            <p className="text-xs font-medium text-[hsl(var(--mobile-text-secondary))] mb-1">Notes</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              placeholder="Add resolution notes…"
              rows={2}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]/30 resize-none"
            />
          </div>

          {/* Status actions */}
          {!isResolved && (
            <div className="flex flex-wrap gap-2">
              {availableActions.slice(0, 3).map((action) => (
                <button
                  key={action.toStatus}
                  onClick={() => handleStatus(action.toStatus)}
                  disabled={saving}
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {flag.resolvedByPermitNumber && (
            <p className="text-xs text-emerald-600">
              Linked to permit #{flag.resolvedByPermitNumber}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
