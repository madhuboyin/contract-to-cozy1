'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api/client';
import { CHAT_ATTACHMENT_ACCEPT, expiresLabel, formatFileSize, preflightProblem, stateLabel, typeLabel, type ChatAttachment } from '@/features/ask/chatAttachments';

const BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50';

interface Pending { key: string; file: File; error: string | null; busy: boolean; previewUrl: string | null }

/**
 * MM-001/002: add a photo or PDF to this conversation only. It shows the file's preview, type and size, its state, and lets the person remove it or retry a failed upload.
 * It is kept for a day at most, is not saved to Home Records, and nothing is read until the person asks. Needs a selected home.
 */
export function ComposerAttachButton({ propertyId, sessionId, disabled, embedded = false }: { propertyId: string | undefined; sessionId?: string; disabled?: boolean; embedded?: boolean }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<ChatAttachment[] | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.listAskAttachments(sessionId);
      if (!response.success || !response.data) throw new Error(response.message || 'Your files could not be loaded.');
      setFiles(response.data.attachments); setError(null);
    } catch (caught) { setFiles([]); setError(caught instanceof Error ? caught.message : 'Your files could not be loaded.'); }
  }, [sessionId]);

  useEffect(() => { if (open) void load(); else { setFiles(null); setStatus(null); setError(null); } }, [open, load]);
  useEffect(() => () => { pending.forEach((item) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!propertyId) return null;

  const send = async (item: Pending) => {
    setPending((current) => current.map((p) => (p.key === item.key ? { ...p, busy: true, error: null } : p)));
    try {
      const response = await api.uploadAskAttachment(item.file, { kind: 'PROPERTY', id: propertyId }, sessionId);
      if (!response.success) throw new Error(response.message || 'The file could not be added. Try again.');
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      setPending((current) => current.filter((p) => p.key !== item.key));
      setStatus(`${item.file.name} added. Ask about it in your next message.`);
      await load();
    } catch (caught) {
      setPending((current) => current.map((p) => (p.key === item.key ? { ...p, busy: false, error: caught instanceof Error ? caught.message : 'The file could not be added. Try again.' } : p)));
    }
  };

  const choose = (list: FileList | null) => {
    if (!list?.length) return;
    const file = list[0];
    const problem = preflightProblem(file);
    const item: Pending = { key: `${Date.now()}-${file.name}`, file, error: problem, busy: false, previewUrl: !problem && file.type.startsWith('image/') ? URL.createObjectURL(file) : null };
    setPending((current) => [...current, item]);
    if (!problem) void send(item);
    if (input.current) input.current.value = '';
  };

  const dropPending = (key: string) => setPending((current) => { current.filter((p) => p.key === key && p.previewUrl).forEach((p) => URL.revokeObjectURL(p.previewUrl as string)); return current.filter((p) => p.key !== key); });
  const remove = async (file: ChatAttachment) => {
    try {
      const response = await api.deleteAskAttachment(file.id);
      if (!response.success) throw new Error(response.message || 'The file could not be removed. Try again.');
      setStatus(response.data?.deleted === false ? `${file.fileName} will be removed shortly.` : `${file.fileName} removed.`);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The file could not be removed. Try again.'); }
  };

  return (
    <>
      <button ref={opener} type="button" disabled={disabled} onClick={() => setOpen(true)} aria-label="Ask about a photo or PDF" aria-haspopup="dialog" title="Ask about a photo or PDF in this conversation. It is not saved to your home records and is removed within a day."
        className={`grid h-10 w-10 shrink-0 place-items-center transition disabled:cursor-not-allowed disabled:opacity-40 ${embedded ? 'rounded-full text-slate-600 hover:bg-slate-100' : 'rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
        <ImagePlus className="h-4 w-4" aria-hidden="true" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
          <DialogTitle>Files in this conversation</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">A photo or PDF you want to ask about. It stays in this conversation only, is not saved to your home records, and is removed automatically within a day. Nothing is read until you ask.</DialogDescription>
          <p role="status" aria-live="polite" className="min-h-5 text-sm text-emerald-900">{status}</p>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 empty:hidden" aria-label="Files">
            {pending.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                {item.previewUrl ? <img src={item.previewUrl} alt={`Preview of ${item.file.name}`} className="h-12 w-12 rounded-lg object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-xs text-slate-600" aria-hidden="true">File</span>}
                <span className="min-w-0 flex-1 text-sm"><span className="block truncate font-medium text-slate-900">{item.file.name}</span><span className="block text-slate-600">{formatFileSize(item.file.size)} · {item.busy ? 'Adding…' : item.error ? 'Not added' : 'Waiting'}</span>
                  {item.error && <span role="alert" className="block text-red-800">{item.error}</span>}</span>
                <span className="flex gap-2">
                  {item.error && !preflightProblem(item.file) && <button type="button" className={BUTTON} onClick={() => void send(item)} aria-label={`Retry ${item.file.name}`}>Retry</button>}
                  <button type="button" className={BUTTON} disabled={item.busy} onClick={() => dropPending(item.key)} aria-label={`Remove ${item.file.name}`}>Remove</button>
                </span>
              </li>
            ))}
            {(files ?? []).map((file) => (
              <li key={file.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-xs text-slate-600" aria-hidden="true">{typeLabel(file.type) === 'PDF' ? 'PDF' : 'Photo'}</span>
                <span className="min-w-0 flex-1 text-sm"><span className="block truncate font-medium text-slate-900">{file.fileName}</span>
                  <span className="block text-slate-600">{typeLabel(file.type)} · {formatFileSize(file.sizeBytes)} · {stateLabel(file.state)}</span>
                  <span className="block text-xs text-slate-500">{expiresLabel(file.deleteAfter)}</span></span>
                <button type="button" className={BUTTON} onClick={() => void remove(file)} aria-label={`Remove ${file.fileName}`}>Remove</button>
              </li>
            ))}
          </ul>
          {files !== null && !files.length && !pending.length && <p className="text-sm text-slate-700">No files in this conversation yet.</p>}
          <input ref={input} type="file" accept={CHAT_ATTACHMENT_ACCEPT} className="sr-only" aria-label="Choose a photo or PDF" tabIndex={-1} onChange={(event) => choose(event.target.files)} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUTTON} onClick={() => input.current?.click()}>Add a photo or PDF</button>
            <button type="button" className={BUTTON} onClick={() => setOpen(false)}>Close</button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
