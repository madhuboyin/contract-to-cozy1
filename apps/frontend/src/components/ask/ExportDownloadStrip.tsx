'use client';

import { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { AskExecutionResponse } from '@/features/ask/types';

const EXPORT_ENTITY_TYPE = 'HOME_REPORT_EXPORT';
const SHARE_RECEIPT_PREFIX = 'home-record-export-share-';
type StripExecution = Pick<AskExecutionResponse, 'operation' | 'blocks'> & { property?: { id: string } | null };

/** The exports the status answer lists as ready: id and label, read from the answer's own rows, never guessed. */
export function readyExportsOf(execution: StripExecution): Array<{ id: string; title: string }> {
  if (execution.operation?.id !== 'HOME_RECORD_EXPORT_STATUS') return [];
  const ready: Array<{ id: string; title: string }> = [];
  for (const block of execution.blocks) {
    if (block.type !== 'GROUPED_LIST') continue;
    for (const section of block.sections) {
      for (const item of section.items) if (item.entityType === EXPORT_ENTITY_TYPE && item.status === 'Ready') ready.push({ id: item.id, title: item.title });
    }
  }
  return ready;
}

/** The exports with a working share link: those the status answer says are shared, and the one a share receipt just created. */
export function sharedExportsOf(execution: StripExecution): Array<{ id: string; title: string }> {
  const shared: Array<{ id: string; title: string }> = [];
  if (execution.operation?.id === 'HOME_RECORD_EXPORT_STATUS') {
    for (const block of execution.blocks) {
      if (block.type !== 'GROUPED_LIST') continue;
      for (const section of block.sections) {
        for (const item of section.items) if (item.entityType === EXPORT_ENTITY_TYPE && item.meta.some((line) => line.startsWith('Shared until'))) shared.push({ id: item.id, title: item.title });
      }
    }
  }
  if (execution.operation?.id === 'HOME_RECORD_EXPORT_SHARE') {
    for (const block of execution.blocks) if (block.type === 'WORKFLOW_PROGRESS' && block.id.startsWith(SHARE_RECEIPT_PREFIX)) shared.push({ id: block.id.slice(SHARE_RECEIPT_PREFIX.length), title: 'the export' });
  }
  return shared;
}

/**
 * The one thing a conversation cannot carry: the file, and the link. A ready export is downloaded, and a share link copied, with the person's
 * own session when they choose it; neither is stored in the answer, where it would go stale (the file link) or leak (the share link is a secret).
 */
export function ExportDownloadStrip({ execution }: { execution: StripExecution }) {
  const ready = readyExportsOf(execution);
  const shared = sharedExportsOf(execution);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState<{ id: string; url: string; clipboard: boolean } | null>(null);
  if (ready.length === 0 && shared.length === 0) return null;
  const propertyId = execution.property?.id;

  const download = async (id: string) => {
    setBusyId(id);
    setProblem(null);
    try {
      const response = await api.getHomeReportExportDownloadUrl(id);
      if (!response.success || !response.data?.url) throw new Error(response.message || 'The download is not ready.');
      window.location.assign(response.data.url);
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : 'The download is not ready.');
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (id: string) => {
    if (!propertyId) return;
    setBusyId(id);
    setProblem(null);
    setCopied(null);
    try {
      const response = await api.listHomeReportExports(propertyId);
      const found = response.success ? response.data?.exports.find((entry) => entry.id === id) : undefined;
      const active = found?.shareToken && !found.shareRevokedAt && (!found.shareExpiresAt || new Date(found.shareExpiresAt).getTime() > Date.now());
      if (!found || !active) throw new Error('That link is no longer active.');
      const url = `${window.location.origin}/reports/share/${found.shareToken}`;
      let clipboard = true;
      try { await navigator.clipboard.writeText(url); } catch { clipboard = false; }
      setCopied({ id, url, clipboard });
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : 'The link could not be copied.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-export-downloads="">
      {ready.map((entry, index) => (
        <button key={`d-${entry.id}`} type="button" disabled={busyId !== null} onClick={() => void download(entry.id)} aria-label={`Download ${entry.title}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60">
          <Download className="h-4 w-4" aria-hidden="true" />{busyId === entry.id ? 'Preparing the download…' : index === 0 ? 'Download the PDF' : `Download · ${entry.title}`}
        </button>
      ))}
      {shared.map((entry) => (
        <button key={`s-${entry.id}`} type="button" disabled={busyId !== null || !propertyId} onClick={() => void copyLink(entry.id)} aria-label={`Copy the share link for ${entry.title}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-900/30 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60">
          <Copy className="h-4 w-4" aria-hidden="true" />Copy the share link
        </button>
      ))}
      {copied && (
        <p className="w-full text-sm text-emerald-900" role="status" data-share-copied="">
          {copied.clipboard ? 'Link copied. Anyone who has it can open the redacted copy until it expires.' : 'Copy this link:'}
          {!copied.clipboard && <input readOnly value={copied.url} aria-label="Share link" onFocus={(event) => event.currentTarget.select()} className="ml-2 w-full max-w-md rounded-lg border border-slate-300 px-2 py-1 text-xs" />}
        </p>
      )}
      {problem && <p className="w-full text-sm text-red-800" role="alert">{problem} Ask again for the current state.</p>}
    </div>
  );
}
