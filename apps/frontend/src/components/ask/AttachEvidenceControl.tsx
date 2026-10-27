'use client';

import { useRef, useState } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { PropertyRecordType } from '@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/types';
import { uploadRecordForWorkflow } from '@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/homeRecordsApi';
import { cn } from '@/lib/utils';

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3 (evidence upload) and v1.99 (inventory items and warranties). A file is picked and
// uploaded out of band (POST .../evidence-upload) BEFORE anything is dispatched to Ask, because CAPTURE_EVIDENCE_CONFIRM's
// declared-action guard needs the documentId up front. Shown wherever the record already declares actions for this
// requester (the same "can manage this record" signal the corrections use); the contributor floor and the record's own
// scoping are enforced server-side regardless. The messages mirror EVIDENCE_ATTACH_MESSAGES in miscHandlers.handler.ts.
export const EVIDENCE_ATTACH_MESSAGE = 'Attach evidence to this home timeline entry.';
export const EVIDENCE_ATTACH_MESSAGES = {
  HOME_EVENT: EVIDENCE_ATTACH_MESSAGE,
  INVENTORY_ITEM: 'Attach this document to this inventory item.',
  WARRANTY: 'Attach this document to this warranty.',
  WORK_ITEM: 'Attach this document as evidence for this work.',
} as const;
export const EVIDENCE_UPLOAD_ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
export const EVIDENCE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export function AttachEvidenceControl({ event, propertyId, disabled, onAttached, label = 'Attach evidence', variant = 'inline', store = 'ASK_EVIDENCE', uploadRecord, className }: {
  event: { entityType: string | null | undefined; id: string; title: string };
  propertyId?: string;
  disabled?: boolean;
  onAttached: (documentId: string) => void;
  label?: string;
  /** ACUI-004: 'composer' is the compact form beside the message box; the upload and validation are the same. */
  variant?: 'inline' | 'composer';
  /**
   * Where the file is stored. The default is the Ask evidence route (a legacy document, as every existing caller expects). A project document is stored as a
   * Home Record through the canonical workflow upload and the callback receives the record id (owner ruling D-P5).
   */
  store?: 'ASK_EVIDENCE' | 'HOME_RECORDS';
  /**
   * How a Home Records upload is described and filed. Without it the file is described as a project document and filed as OTHER (Project Tracker's values).
   * `notice` is shown above the button, before the file picker can be opened. `blockedReason` disables the button and says why (for example, the role the
   * record type depends on has not been chosen yet).
   */
  uploadRecord?: { description?: string; recordType?: PropertyRecordType; notice?: string; blockedReason?: string | null };
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'IDLE' | 'UPLOADING' | 'ERROR'>('IDLE');
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!propertyId) { setError('This home could not be determined. Refresh and try again.'); setStatus('ERROR'); return; }
    if (!EVIDENCE_UPLOAD_ALLOWED_TYPES.includes(file.type)) { setError('Choose a JPEG, PNG, WEBP, or PDF file.'); setStatus('ERROR'); return; }
    if (file.size > EVIDENCE_UPLOAD_MAX_BYTES) { setError('That file is larger than 10MB.'); setStatus('ERROR'); return; }
    setStatus('UPLOADING');
    try {
      if (store === 'HOME_RECORDS') {
        const recordId = await uploadRecordForWorkflow(propertyId, {
          file, title: file.name, description: uploadRecord?.description ?? `Project document: ${event.title}`, recordType: uploadRecord?.recordType ?? 'OTHER', sensitivity: 'STANDARD',
        });
        setStatus('IDLE');
        onAttached(recordId);
        return;
      }
      const response = await api.uploadAskEvidence(propertyId, file);
      if (!response.success || !response.data) throw new Error(response.message || 'The file could not be uploaded.');
      setStatus('IDLE');
      onAttached(response.data.document.id);
    } catch (caught) {
      setStatus('ERROR');
      setError(caught instanceof Error ? caught.message : 'The file could not be uploaded.');
    }
  };

  return (
    <div className={cn(variant === 'composer' ? 'relative' : 'mt-3', className)}>
      {uploadRecord?.notice && <p className="mb-2 text-xs text-slate-600">{uploadRecord.notice}</p>}
      {uploadRecord?.blockedReason && <p className="mb-2 text-xs text-slate-500">{uploadRecord.blockedReason}</p>}
      <input
        ref={inputRef} type="file" accept={EVIDENCE_UPLOAD_ALLOWED_TYPES.join(',')} className="sr-only" tabIndex={-1}
        aria-label={`Attach evidence file for ${event.title}`}
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleFile(file); }}
      />
      <button
        type="button" disabled={disabled || status === 'UPLOADING' || Boolean(uploadRecord?.blockedReason)}
        title={variant === 'composer' ? `${label} for ${event.title}` : undefined}
        className={variant === 'composer' ? 'inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50' : 'inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50'}
        onClick={() => inputRef.current?.click()}
      >
        {status === 'UPLOADING' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Paperclip className="h-4 w-4" aria-hidden="true" />}
        {status === 'UPLOADING' ? 'Uploading…' : label}<span className="sr-only"> for {event.title}</span>
      </button>
      {error && <p className={variant === 'composer' ? 'absolute bottom-full left-0 mb-1 w-64 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700' : 'mt-1 text-xs text-red-700'} role="alert">{error}</p>}
    </div>
  );
}

