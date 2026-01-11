// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryBulkUploadModal.tsx
'use client';

import React from 'react';
import { api } from '@/lib/api/client';

type ImportError = { row: number; field: string; message: string };

type ImportResult = {
  mode: 'DRY_RUN' | 'IMPORT';
  batchId: string;
  totalRows: number;
  validRows: number;
  createdCount?: number;
  skippedCount?: number;
  errorCount?: number;
  errors: ImportError[];
};

export default function InventoryBulkUploadModal(props: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  onImported: () => Promise<void> | void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [createRooms, setCreateRooms] = React.useState(true);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!props.open) {
      setFile(null);
      setBusy(false);
      setResult(null);
      setErr(null);
      setCreateRooms(true);
    }
  }, [props.open]);

  if (!props.open) return null;

  async function downloadTemplate() {
    setErr(null);
    try {
      const res = await api.get<Blob>(
        `/api/properties/${props.propertyId}/inventory/import/template`,
        { responseType: 'blob' }
      );

      const blob = res.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-template-${props.propertyId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(e?.message || 'Failed to download template.');
    }
  }

  async function runImport(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append('file', file);

      const qs = new URLSearchParams();
      qs.set('dryRun', dryRun ? 'true' : 'false');
      qs.set('createRooms', createRooms ? 'true' : 'false');

      const res = await api.post<ImportResult>(
        `/api/properties/${props.propertyId}/inventory/import?${qs.toString()}`,
        fd
      );

      setResult(res.data);

      if (!dryRun && res.data.mode === 'IMPORT') {
        await props.onImported();
      }
    } catch (e: any) {
      setErr(e?.message || 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  const errors = result?.errors || [];
  const showErrors = errors.slice(0, 20);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl border border-black/10 shadow-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">Bulk upload inventory (XLSX)</div>
            <div className="text-sm opacity-70 mt-1">
              Download the template, fill it, upload, then validate/import. Partial imports are supported.
            </div>
          </div>
          <button onClick={props.onClose} className="text-sm underline opacity-80 hover:opacity-100">
            Close
          </button>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={downloadTemplate}
            className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5"
          >
            Download template
          </button>

          <label className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5 cursor-pointer">
            Choose XLSX
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          {file && (
            <div className="text-sm opacity-70 truncate max-w-[18rem]">
              {file.name}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm">
          <input
            id="createRooms"
            type="checkbox"
            checked={createRooms}
            onChange={(e) => setCreateRooms(e.target.checked)}
          />
          <label htmlFor="createRooms" className="opacity-80">
            Auto-create missing rooms (recommended)
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            disabled={busy || !file}
            onClick={() => runImport(true)}
            className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Validate (dry run)'}
          </button>
          <button
            disabled={busy || !file}
            onClick={() => runImport(false)}
            className="rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
          >
            {busy ? 'Importing…' : 'Import now'}
          </button>
        </div>

        {result && (
          <div className="mt-4 rounded-2xl border border-black/10 p-4">
            <div className="text-sm font-medium">Result</div>
            <div className="text-sm opacity-80 mt-1">
              Mode: <span className="font-mono">{result.mode}</span> • Batch:{' '}
              <span className="font-mono">{result.batchId}</span>
            </div>
            <div className="text-sm opacity-80 mt-1">
              Rows: {result.totalRows} • Valid: {result.validRows}
              {result.mode === 'IMPORT' ? ` • Created: ${result.createdCount || 0}` : ''}
            </div>

            {errors.length > 0 ? (
              <div className="mt-3">
                <div className="text-sm font-medium text-red-700">
                  Errors ({errors.length})
                </div>
                <div className="mt-2 space-y-2">
                  {showErrors.map((e, idx) => (
                    <div key={idx} className="text-xs rounded-xl border border-red-200 bg-red-50 p-2">
                      Row {e.row} • {e.field}: {e.message}
                    </div>
                  ))}
                  {errors.length > 20 && (
                    <div className="text-xs opacity-70">Showing first 20 errors…</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-green-700">No validation errors.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
