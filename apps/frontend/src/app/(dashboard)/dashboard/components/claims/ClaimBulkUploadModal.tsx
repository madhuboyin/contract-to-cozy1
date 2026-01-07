// apps/frontend/src/app/(dashboard)/dashboard/components/claims/ClaimBulkUploadModal.tsx
'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';

type UploadMode = 'CLAIM' | 'CHECKLIST_ITEM';

type Props = {
  open: boolean;
  onClose: () => void;

  propertyId: string;
  claimId: string;

  /**
   * If provided, uploads files to a specific checklist item:
   * POST /properties/:propertyId/claims/:claimId/checklist/:itemId/documents/bulk
   */
  itemId?: string | null;

  /** Optional: initial mode (defaults based on itemId presence) */
  initialMode?: UploadMode;

  /** Called after upload completes successfully */
  onUploaded?: (result: any) => void;

  /** Max files selectable (defaults 10) */
  maxFiles?: number;
};

// Keep in sync with backend ClaimDocumentType enum. If you add more types, extend here.
const CLAIM_DOC_TYPES = [
  'OTHER',
  'POLICY',
  'INVOICE',
  'ESTIMATE',
  'PHOTO',
  'REPORT',
  'RECEIPT',
] as const;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

async function readJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Upload using XHR to support progress reporting.
 */
function xhrUpload(opts: {
  url: string;
  formData: FormData;
  onProgress: (pct: number) => void;
  signal?: AbortSignal;
}): Promise<any> {
  const { url, formData, onProgress, signal } = opts;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      onProgress(Math.max(0, Math.min(100, pct)));
    };

    xhr.onload = () => {
      const status = xhr.status;
      const text = xhr.responseText ?? '';
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }

      if (status >= 200 && status < 300) return resolve(payload);
      const err: any = new Error(payload?.message || `Upload failed (${status})`);
      err.status = status;
      err.payload = payload;
      reject(err);
    };

    xhr.onerror = () => reject(new Error('Network error while uploading'));
    xhr.onabort = () => reject(new Error('Upload aborted'));

    if (signal) {
      const abortHandler = () => xhr.abort();
      if (signal.aborted) abortHandler();
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    xhr.send(formData);
  });
}

export default function ClaimBulkUploadModal({
  open,
  onClose,
  propertyId,
  claimId,
  itemId = null,
  initialMode,
  onUploaded,
  maxFiles = 10,
}: Props) {
  const defaultMode: UploadMode = initialMode ?? (itemId ? 'CHECKLIST_ITEM' : 'CLAIM');
  const [mode] = useState<UploadMode>(defaultMode);

  const [files, setFiles] = useState<File[]>([]);
  const [docType, setDocType] = useState<(typeof CLAIM_DOC_TYPES)[number]>('OTHER');
  const [title, setTitle] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + (f.size || 0), 0), [files]);

  const resetState = useCallback(() => {
    setFiles([]);
    setDocType('OTHER');
    setTitle('');
    setNotes('');
    setBusy(false);
    setProgress(0);
    setErrMsg(null);
    setSuccessMsg(null);
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const closeAndReset = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      setErrMsg(null);
      setSuccessMsg(null);

      const arr = Array.from(incoming || []);
      if (arr.length === 0) return;

      // Enforce max
      const next = [...files, ...arr].slice(0, maxFiles);

      // Basic de-dupe by name+size+lastModified
      const uniq: File[] = [];
      const seen = new Set<string>();
      for (const f of next) {
        const key = `${f.name}:${f.size}:${f.lastModified}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(f);
      }

      setFiles(uniq);
    },
    [files, maxFiles]
  );

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      const dt = e.dataTransfer;
      if (dt?.files?.length) addFiles(dt.files);
    },
    [addFiles, busy]
  );

  const uploadUrl = useMemo(() => {
    // NOTE: Use the same base path your frontend uses for other calls.
    // If your app proxies to backend under /api, keep this. Otherwise change base.
    if (mode === 'CHECKLIST_ITEM') {
      if (!itemId) return null;
      return `/api/properties/${propertyId}/claims/${claimId}/checklist/${itemId}/documents/bulk`;
    }
    return `/api/properties/${propertyId}/claims/${claimId}/documents/bulk`;
  }, [mode, propertyId, claimId, itemId]);

  const canUpload = open && !busy && files.length > 0 && Boolean(uploadUrl);

  const onUpload = useCallback(async () => {
    setErrMsg(null);
    setSuccessMsg(null);

    if (!uploadUrl) {
      setErrMsg('Upload URL is missing (itemId required for checklist upload).');
      return;
    }
    if (files.length === 0) {
      setErrMsg('Please select at least one file.');
      return;
    }

    setBusy(true);
    setProgress(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const fd = new FormData();
      // Backend expects: uploadMultipleFiles('files', ...)
      for (const f of files) fd.append('files', f);

      // Optional metadata (your backend schema allows these fields)
      fd.append('claimDocumentType', docType);
      if (title.trim()) fd.append('title', title.trim());
      if (notes.trim()) fd.append('notes', notes.trim());

      const result = await xhrUpload({
        url: uploadUrl,
        formData: fd,
        onProgress: setProgress,
        signal: controller.signal,
      });

      setSuccessMsg(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'} successfully.`);
      onUploaded?.(result);

      // Keep modal open so user can see success; clear files for next batch
      setFiles([]);
      setProgress(100);
    } catch (e: any) {
      const msg =
        e?.payload?.message ||
        e?.message ||
        'Upload failed. Please try again.';
      setErrMsg(msg);
      setProgress(0);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [docType, files, notes, onUploaded, title, uploadUrl]);

  const onCancelUpload = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setProgress(0);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-2xl border bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div>
            <div className="text-base font-semibold text-gray-900">
              Bulk upload documents
            </div>
            <div className="mt-1 text-sm text-gray-600">
              {mode === 'CHECKLIST_ITEM'
                ? 'Upload multiple documents to this checklist item.'
                : 'Upload multiple documents to this claim.'}
            </div>
          </div>

          <button
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
            onClick={closeAndReset}
            disabled={busy}
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={onDrop}
            className={cx(
              'rounded-2xl border border-dashed p-5',
              busy ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
            )}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="text-sm font-semibold text-gray-900">
                Drag & drop files here
              </div>
              <div className="text-xs text-gray-600">
                or select files (up to {maxFiles})
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800 disabled:opacity-50"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy || files.length >= maxFiles}
                >
                  Choose files
                </button>
                <button
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => setFiles([])}
                  disabled={busy || files.length === 0}
                >
                  Clear
                </button>
              </div>

              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (!e.target.files) return;
                  addFiles(e.target.files);
                  // allow selecting the same file again if removed
                  e.currentTarget.value = '';
                }}
              />
            </div>
          </div>

          {/* Metadata */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-gray-700">Document type</label>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={docType}
                onChange={(e) => setDocType(e.target.value as any)}
                disabled={busy}
              >
                {CLAIM_DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-gray-500">
                Applies to all selected files in this batch.
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">Title (optional)</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Adjuster report"
                disabled={busy}
              />
              <div className="mt-1 text-xs text-gray-500">
                If blank, backend uses file name / default behavior.
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-gray-700">Notes (optional)</label>
              <textarea
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any context to attach to the uploaded documents..."
                rows={3}
                disabled={busy}
              />
            </div>
          </div>

          {/* File list */}
          <div className="rounded-2xl border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-semibold text-gray-900">
                Selected files ({files.length}/{maxFiles})
              </div>
              <div className="text-xs text-gray-600">
                Total: {formatBytes(totalSize)}
              </div>
            </div>

            {files.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-600">
                No files selected yet.
              </div>
            ) : (
              <div className="max-h-64 overflow-auto">
                {files.map((f, idx) => (
                  <div
                    key={`${f.name}:${f.size}:${f.lastModified}:${idx}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 border-b last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {f.name}
                      </div>
                      <div className="text-xs text-gray-600">
                        {formatBytes(f.size)} · {f.type || 'unknown'}
                      </div>
                    </div>

                    <button
                      className="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                      onClick={() => removeFile(idx)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Progress / alerts */}
          {busy ? (
            <div className="rounded-xl border bg-emerald-50 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-emerald-900">
                  Uploading…
                </div>
                <div className="text-sm font-semibold text-emerald-900">
                  {progress}%
                </div>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-white/70">
                <div
                  className="h-2 rounded-full bg-emerald-600 transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white"
                  onClick={onCancelUpload}
                >
                  Cancel upload
                </button>
              </div>
            </div>
          ) : null}

          {errMsg ? (
            <div className="rounded-xl border bg-rose-50 p-3 text-sm text-rose-800">
              {errMsg}
            </div>
          ) : null}

          {successMsg ? (
            <div className="rounded-xl border bg-emerald-50 p-3 text-sm text-emerald-800">
              {successMsg}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t p-5">
          <div className="text-xs text-gray-600">
            Tip: If you need per-file titles/notes, upload in smaller batches.
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
              onClick={closeAndReset}
              disabled={busy}
            >
              Cancel
            </button>

            <button
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-800 disabled:opacity-50"
              onClick={onUpload}
              disabled={!canUpload}
              title={!uploadUrl ? 'Missing upload URL (check route config)' : undefined}
            >
              Upload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
