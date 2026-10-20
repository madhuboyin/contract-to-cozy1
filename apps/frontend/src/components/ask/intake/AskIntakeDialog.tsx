'use client';

import { useEffect, useState, type ClipboardEvent, type DragEvent } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { IntakeCandidates, IntakeLabelReview, IntakePicker, IntakeProvenance, IntakeReadStep } from './IntakeSteps';
import { RESULT_COPY, intakeResultHref, originalHref, pickSingleFile } from './intakePresentation';
import { useAskIntake } from './useAskIntake';

const LINK = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700';
const PRIMARY_LINK = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-950 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700';

/**
 * Add a file (FR-INPUT-001..005). One dialog from the composer: the file is kept first, then read only after the person has seen what that
 * involves, then each proposed detail is accepted, edited, rejected or left for later. Nothing reaches the home without "Add to my home" or
 * "Add to inventory". Every step has a keyboard and form path: the camera, drop and paste are shortcuts to the same file chooser.
 */
export function AskIntakeDialog({ open, onOpenChange, propertyId, returnFocusRef }: { open: boolean; onOpenChange: (open: boolean) => void; propertyId: string | undefined; returnFocusRef?: React.RefObject<HTMLElement | null> }) {
  const intake = useAskIntake(propertyId, open);
  const { view, config, busy, error } = intake;
  const [kept, setKept] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { if (!open) { intake.reset(); setKept(false); setProblem(null); setDragging(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = (files: ArrayLike<File> | null | undefined, sensitivity = 'STANDARD') => {
    if (view || busy) return;
    const { file, problem: issue } = pickSingleFile(files);
    setProblem(issue);
    if (file) void intake.upload(file, sensitivity);
  };
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); accept(event.dataTransfer?.files); };
  const onPaste = (event: ClipboardEvent) => { if (event.clipboardData?.files?.length) { event.preventDefault(); accept(event.clipboardData.files); } };
  const startOver = () => { intake.reset(); setKept(false); setProblem(null); };

  const resultHref = view ? intakeResultHref(view) : null;
  let body: React.ReactNode;
  if (!propertyId) body = <p className="text-sm text-slate-600" role="status">Select a home to add a file to it.</p>;
  else if (intake.paused) body = <p className="text-sm text-amber-950" role="status">Adding files is temporarily unavailable. Nothing was lost.</p>;
  else if (!config) body = intake.configFailed
    ? <p className="text-sm text-amber-950" role="alert">This could not be loaded. <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Reload the page</button></p>
    : <p className="text-sm text-slate-600" role="status">Loading…</p>;
  else if (!view) body = <IntakePicker config={config} busy={busy === 'UPLOADING'} problem={problem} onFile={(file, sensitivity) => accept([file], sensitivity)} />;
  else if (view.state === 'DISCARDED') body = (
    <div className="space-y-3"><p className="text-sm text-slate-800" role="status">The file was removed. It stays in the Home Records trash for 30 days in case you change your mind.</p><button type="button" className={LINK} onClick={startOver}>Add another file</button></div>
  );
  else if (kept) body = (
    <div className="space-y-3"><p className="text-sm text-slate-800" role="status">Kept in your Home Records without being read. Nothing was added to your home.</p>
      <div className="flex flex-wrap gap-2"><Link href={originalHref(view)} className={PRIMARY_LINK}>Open it in Home Records</Link><button type="button" className={LINK} onClick={startOver}>Add another file</button></div></div>
  );
  else if (view.state === 'UPLOADED') body = (
    <IntakeReadStep key={`${view.recordId}:${view.choice?.reason ?? ''}:${Boolean(view.needsDetails)}`} view={view} config={config} busy={busy === 'READING' || busy === 'SAVING'}
      onRead={(kind, acknowledged, inspection) => void intake.read(kind, acknowledged, inspection)} onKeep={() => setKept(true)} onDiscard={() => void intake.discard()} />
  );
  else if (view.state === 'REVIEW' && view.labelDraft) body = (
    <IntakeLabelReview key={view.generatedAt} view={view} busy={busy === 'SAVING'} onSave={(patch) => void intake.saveLabel(patch)} onConfirm={() => void intake.confirmLabel()} onReject={() => void intake.rejectLabel()} />
  );
  else if (view.state === 'REVIEW' && view.inspection) body = (
    <div className="space-y-3" data-intake-inspection>
      <p className="text-sm text-slate-800" role="status">An inspection report was created with the {view.inspection.findingCount} {view.inspection.findingCount === 1 ? 'finding' : 'findings'} you accepted. Go through them to decide what to do about each one. Findings you rejected or left undecided were not added.</p>
      <div className="flex flex-wrap gap-2">{resultHref && <Link href={resultHref} className={PRIMARY_LINK}>Review the findings</Link>}<button type="button" className={LINK} onClick={startOver}>Add another file</button></div>
    </div>
  );
  else if (view.state === 'REVIEW') body = <IntakeCandidates view={view} busy={busy === 'SAVING'} onReview={(id, action, value) => void intake.reviewCandidate(id, action, value)} onAdd={() => void intake.addToHome()} onDiscard={() => void intake.discard()} />;
  else body = (
    <div className="space-y-3" data-intake-done>
      <p className="text-sm text-slate-800" role="status">{view.result ? RESULT_COPY[view.result.entityType].done : 'Rejected. Nothing was added to your home. The original is still in your Home Records.'}</p>
      <div className="flex flex-wrap gap-2">{resultHref && view.result && <Link href={resultHref} className={PRIMARY_LINK}>See it in your home record</Link>}<button type="button" className={LINK} onClick={startOver}>Add another file</button></div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-h-[85vh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto p-0 sm:rounded-2xl ${dragging ? 'ring-2 ring-emerald-700' : ''}`} aria-describedby="ask-intake-description" onCloseAutoFocus={(event) => { if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus(); } }}
        onDragOver={(event) => { if (!view) { event.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onPaste={onPaste}
      >
        <div className="border-b border-slate-200 px-4 pb-3 pt-4">
          <DialogTitle className="text-lg font-semibold text-slate-950">Add a file to your home</DialogTitle>
          <DialogDescription id="ask-intake-description" className="mt-1 text-sm text-slate-600">Add a document or photo. Cozy proposes the details; you decide what is added.</DialogDescription>
        </div>
        <div className="space-y-4 px-4 py-4" aria-live="polite" aria-busy={busy !== null}>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert" data-intake-error>{error}</p>}
          {body}
          {view && view.state !== 'DISCARDED' && !kept && <IntakeProvenance view={view} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
