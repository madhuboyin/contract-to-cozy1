'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { api } from '@/lib/api/client';
import { uploadRecordForWorkflow } from '@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/homeRecordsApi';
import { projectDocumentOptions, type ProjectDocumentRecordInput } from '@/lib/projects/projectDocumentOptions';

/**
 * Choose the Home Records a project step cites, instead of typing their ids (owner rulings D-P1, D-P3, D-P5). Only active, household-visible, clean
 * records are listed (the service refuses the rest); a file can be added here and is stored as a Home Record through the canonical upload.
 */
export function ProjectDocumentPicker({ propertyId, value, onChange, max = 50, label, uploadTitle }: {
  propertyId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  label: string;
  /** The title and purpose recorded for a file added here. */
  uploadTitle?: string;
}) {
  const [records, setRecords] = useState<ProjectDocumentRecordInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.listPropertyRecords(propertyId);
      setRecords(response.success && response.data ? response.data.records : []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);
  useEffect(() => { void load(); }, [load]);

  const choices = useMemo(() => projectDocumentOptions(records), [records]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id].slice(0, max));

  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const recordId = await uploadRecordForWorkflow(propertyId, {
        file, title: file.name, description: `Project document: ${uploadTitle ?? label}`, recordType: 'OTHER', sensitivity: 'STANDARD',
      });
      await load();
      onChange([...value.filter((item) => item !== recordId), recordId].slice(0, max));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The file could not be added.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-800">{label}</legend>
      {loading ? <p className="text-xs text-slate-500">Loading your home records…</p> : null}
      {!loading && choices.options.length === 0 ? <p className="text-xs text-slate-600">No eligible documents yet. Add one below.</p> : null}
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {choices.options.map((option) => (
          <li key={option.id}>
            <label className="flex min-h-[40px] items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={value.includes(option.id)} onChange={() => toggle(option.id)} />
              <span>{option.label}</span>
            </label>
          </li>
        ))}
      </ul>
      {choices.excludedPrivate ? (
        <p className="text-xs text-slate-600">{choices.excludedPrivate} owner-only record{choices.excludedPrivate === 1 ? ' is' : 's are'} not listed, because a project is shared with the household.</p>
      ) : null}
      <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? 'Adding…' : 'Add a file to Home Records'}
        <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file); }} />
      </label>
      {error ? <p className="text-xs text-rose-700" role="alert">{error}</p> : null}
    </fieldset>
  );
}
