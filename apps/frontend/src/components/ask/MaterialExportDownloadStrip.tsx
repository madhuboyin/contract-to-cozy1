'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { AskExecutionResponse } from '@/features/ask/types';

const MATERIAL_EXPORT_ENTITY_TYPE = 'MATERIAL_SPEC_EXPORT';
type StripExecution = Pick<AskExecutionResponse, 'operation' | 'blocks'> & { property?: { id: string } | null };

/** The materials exports the Material Specs answer lists as ready: id and label, read from the answer's own rows, never guessed. */
export function readyMaterialExportsOf(execution: StripExecution): Array<{ id: string; title: string }> {
  if (execution.operation?.id !== 'MATERIAL_SPECS_LIST') return [];
  const ready: Array<{ id: string; title: string }> = [];
  for (const block of execution.blocks) {
    if (block.type !== 'GROUPED_LIST') continue;
    for (const section of block.sections) {
      for (const item of section.items) if (item.entityType === MATERIAL_EXPORT_ENTITY_TYPE && item.status === 'Ready') ready.push({ id: item.id, title: item.title });
    }
  }
  return ready;
}

/**
 * The one thing a conversation cannot carry: the file. A ready materials export is downloaded with the person's own session when they choose it;
 * the link is never stored in the answer, where it would go stale.
 */
export function MaterialExportDownloadStrip({ execution }: { execution: StripExecution }) {
  const ready = readyMaterialExportsOf(execution);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const propertyId = execution.property?.id;
  if (ready.length === 0 || !propertyId) return null;

  const download = async (id: string) => {
    setBusyId(id);
    setProblem(null);
    try {
      const response = await api.get<{ export: { status: string }; signedUrl?: string | null }>(`/api/properties/${propertyId}/materials/exports/${id}`);
      const url = response.data?.signedUrl;
      if (!url) throw new Error('The download is not ready.');
      window.location.assign(url);
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : 'The download is not ready.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-material-export-downloads="">
      {ready.map((entry, index) => (
        <button key={entry.id} type="button" disabled={busyId !== null} onClick={() => void download(entry.id)} aria-label={`Download ${entry.title}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60">
          <Download className="h-4 w-4" aria-hidden="true" />{busyId === entry.id ? 'Preparing the download…' : index === 0 ? 'Download the PDF' : `Download · ${entry.title}`}
        </button>
      ))}
      {problem && <p className="w-full text-sm text-red-800" role="alert">{problem} Ask again for the current state.</p>}
    </div>
  );
}
