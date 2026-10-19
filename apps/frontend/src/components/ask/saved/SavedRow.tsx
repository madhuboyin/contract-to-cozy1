'use client';

import { useId, useState } from 'react';
import type { AskSavedArtifact } from '@/features/ask/types';
import { CATEGORY_LABELS, FRESHNESS_LABELS, formatSavedDate } from './savedPresentation';

/** One saved result: identity, freshness, version, and the actions that exist for it. Pinning is separate and is not offered here. */
export function SavedRow({ artifact, busy, onOpen, onToggleArchive, onOpenVersion }: {
  artifact: AskSavedArtifact;
  busy: boolean;
  onOpen: (artifact: AskSavedArtifact) => void;
  onToggleArchive: (artifact: AskSavedArtifact) => void;
  onOpenVersion: (artifactKey: string) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const detailId = useId();
  const asOf = formatSavedDate(artifact.sourceAsOf);
  const updated = formatSavedDate(artifact.updatedAt);
  const archivedByOwnerOnly = artifact.archived.byOwner && !artifact.archived.byYou;
  const freshnessTone = artifact.freshness.state === 'CURRENT' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900';

  return (
    <li className="border-b border-slate-200 px-4 py-3 last:border-b-0" data-artifact-key={artifact.artifactKey} data-artifact-type={artifact.artifactType}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>{CATEGORY_LABELS[artifact.category]}</span>
            <span aria-hidden="true">·</span>
            <span className={`rounded-full px-2 py-0.5 normal-case tracking-normal ${freshnessTone}`}>{FRESHNESS_LABELS[artifact.freshness.state]}</span>
            {artifact.visibility.sensitivity === 'SENSITIVE' && <span className="rounded-full bg-slate-100 px-2 py-0.5 normal-case tracking-normal text-slate-700">Sensitive</span>}
          </p>
          <h3 className="mt-1 break-words text-base font-semibold text-slate-950">{artifact.title}</h3>
          {artifact.summary && <p className="mt-1 text-sm text-slate-600">{artifact.summary}</p>}
          <p className="mt-1 text-sm text-slate-700">{artifact.version.label}{asOf ? ` · facts as of ${asOf}` : ''}</p>
          {artifact.freshness.reason && <p className="mt-1 text-xs text-slate-500" role="note">{artifact.freshness.reason}</p>}
          {archivedByOwnerOnly && <p className="mt-1 text-xs text-slate-500" role="note">Archived where it is kept, so it cannot be restored from here.</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {artifact.reopen && (
            <button type="button" disabled={busy} onClick={() => onOpen(artifact)} className="min-h-11 rounded-xl bg-emerald-900 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60">{busy ? 'Opening…' : 'Open'}</button>
          )}
          {artifact.version.superseded && artifact.version.supersededBy && (
            <button type="button" disabled={busy} onClick={() => onOpenVersion(artifact.version.supersededBy as string)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60">See the newer version</button>
          )}
          {!archivedByOwnerOnly && (
            <button type="button" disabled={busy} onClick={() => onToggleArchive(artifact)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60">{artifact.archived.byYou ? 'Restore' : 'Archive'}</button>
          )}
          <button type="button" aria-expanded={detailOpen} aria-controls={detailId} onClick={() => setDetailOpen((value) => !value)} className="min-h-11 rounded-xl px-3 py-2 text-sm font-semibold text-emerald-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">{detailOpen ? 'Hide details' : 'Details'}</button>
        </div>
      </div>
      {detailOpen && (
        <dl id={detailId} className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2" data-saved-detail>
          {updated && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last updated</dt><dd className="text-slate-900">{updated}</dd></div>}
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kept by</dt><dd className="text-slate-900">{artifact.owner.replace(/-/g, ' ')}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Who can see it</dt><dd className="text-slate-900">{artifact.visibility.scope === 'REQUESTER_ONLY' ? 'Only the person who requested it' : 'Your household'}</dd></div>
          {artifact.version.supersedes && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Earlier version</dt><dd><button type="button" onClick={() => onOpenVersion(artifact.version.supersedes as string)} className="font-semibold text-emerald-900 hover:underline">See the earlier version</button></dd></div>}
          {(artifact.capabilities.export || artifact.capabilities.share) && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available</dt><dd className="text-slate-900">{[artifact.capabilities.export ? 'Download' : null, artifact.capabilities.share ? 'Share' : null].filter(Boolean).join(' and ')}</dd></div>}
          {!artifact.reopen && <div className="sm:col-span-2"><dd className="text-slate-600">{artifact.reopenUnavailableReason ?? 'Ask cannot reopen this; its state is shown here.'}</dd></div>}
        </dl>
      )}
    </li>
  );
}
