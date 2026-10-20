'use client';

import { useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { AskIntakeDialog } from './AskIntakeDialog';

/** The composer's "Add a file" entry (FR-INPUT-001): a PDF or photo kept in Home Records, read only on request, and added only after review. */
export function ComposerIntakeButton({ propertyId, disabled, embedded = false }: { propertyId: string | undefined; disabled?: boolean; embedded?: boolean }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={opener} type="button" disabled={disabled} onClick={() => setOpen(true)} aria-label="Add a file to your home" aria-haspopup="dialog" title="Add a file: a warranty, receipt, policy, inspection report, or appliance label"
        className={`grid h-10 w-10 shrink-0 place-items-center transition disabled:cursor-not-allowed disabled:opacity-40 ${embedded ? 'rounded-full text-slate-600 hover:bg-slate-100' : 'rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
        <Paperclip className="h-4 w-4" aria-hidden="true" />
      </button>
      <AskIntakeDialog open={open} onOpenChange={setOpen} propertyId={propertyId} returnFocusRef={opener} />
    </>
  );
}
