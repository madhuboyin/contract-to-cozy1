'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AskRecentSessionSummary, AskSessionChange } from '@/features/ask/types';

// ASK_COZY_INLINE_WORKSPACE_FRD IW-HIST-009..012, IW-HIST-014 (FRD v1.71): one conversation in the history rail, with
// its session menu (rename, pin/unpin, archive/restore, delete). The menu has its own trigger, so opening it never opens
// the conversation. Rename is inline; delete asks first, naming the conversation and its home and saying what stays.
export function ConversationSessionRow({ session, active, status, disabled, busy, archivedView, onOpen, onChange, onDelete }: {
  session: AskRecentSessionSummary;
  active: boolean;
  status: string;
  disabled: boolean;
  busy: boolean;
  archivedView: boolean;
  onOpen: () => void;
  onChange?: (change: AskSessionChange) => Promise<boolean> | boolean | void;
  onDelete?: () => Promise<boolean> | boolean | void;
}) {
  const [mode, setMode] = useState<'VIEW' | 'RENAME' | 'CONFIRM_DELETE'>('VIEW');
  const [draftTitle, setDraftTitle] = useState(session.title);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const hasActions = Boolean(onChange || onDelete);

  useEffect(() => {
    if (mode === 'RENAME') renameInputRef.current?.select();
    if (mode === 'CONFIRM_DELETE') keepButtonRef.current?.focus();
  }, [mode]);

  const finish = () => {
    setMode('VIEW');
    window.setTimeout(() => menuTriggerRef.current?.focus(), 0);
  };

  const saveTitle = async (event: FormEvent) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title || !onChange) return;
    if (title === session.title) { finish(); return; }
    const saved = await onChange({ title });
    if (saved !== false) finish();
  };

  if (mode === 'RENAME') {
    return (
      <form onSubmit={(event) => void saveTitle(event)} className="rounded-xl bg-white px-2 py-2 ring-1 ring-inset ring-teal-200">
        <label className="sr-only" htmlFor={`ask-rename-${session.sessionId}`}>Conversation title</label>
        <input
          id={`ask-rename-${session.sessionId}`}
          ref={renameInputRef}
          value={draftTitle}
          maxLength={120}
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setDraftTitle(session.title); finish(); } }}
          className="min-h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
        <div className="mt-2 flex justify-end gap-1.5">
          <button type="button" onClick={() => { setDraftTitle(session.title); finish(); }} className="min-h-8 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={busy || !draftTitle.trim()} className="min-h-8 rounded-lg bg-teal-700 px-2.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    );
  }

  if (mode === 'CONFIRM_DELETE') {
    return (
      <div role="group" aria-labelledby={`ask-delete-${session.sessionId}`} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
        <p id={`ask-delete-${session.sessionId}`} className="text-xs leading-5 text-red-950">
          Delete <span className="font-semibold">“{session.title}”</span> for {session.property.label}? This removes the conversation and its feedback. Home records, tasks, documents and decisions created through Ask stay as they are.
        </p>
        <div className="mt-2 flex justify-end gap-1.5">
          <button ref={keepButtonRef} type="button" onClick={finish} className="min-h-8 rounded-lg px-2.5 text-xs font-semibold text-slate-700 hover:bg-white">Keep it</button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => { const deleted = await onDelete?.(); if (deleted === false) finish(); }}
            className="min-h-8 rounded-lg bg-red-700 px-2.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete conversation'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-0.5">
      <button
        type="button"
        aria-current={active ? 'page' : undefined}
        disabled={disabled}
        onClick={onOpen}
        className={cn('min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left transition disabled:opacity-60', active ? 'bg-teal-50 text-teal-950 ring-1 ring-inset ring-teal-200' : 'text-slate-700 hover:bg-white hover:text-slate-950')}
      >
        <span className="flex items-center gap-1.5">
          {session.pinned && <Pin className="h-3 w-3 shrink-0 text-teal-700" aria-label="Pinned" />}
          <span className="block truncate text-sm font-semibold">{session.title}</span>
        </span>
        <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="truncate">{session.property.label}</span>
          <span className="shrink-0">{busy ? 'Updating…' : status}</span>
        </span>
      </button>
      {hasActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              ref={menuTriggerRef}
              type="button"
              aria-label={`Conversation actions for ${session.title}`}
              disabled={busy}
              className="mt-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-teal-300 disabled:opacity-50"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {onChange && <DropdownMenuItem onSelect={() => { setDraftTitle(session.title); setMode('RENAME'); }}><Pencil className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Rename</DropdownMenuItem>}
            {onChange && !archivedView && (
              <DropdownMenuItem onSelect={() => void onChange({ pinned: !session.pinned })}>
                {session.pinned ? <PinOff className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="mr-2 h-3.5 w-3.5" aria-hidden="true" />}
                {session.pinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
            )}
            {onChange && (
              <DropdownMenuItem onSelect={() => void onChange({ archived: !session.archived })}>
                {session.archived ? <ArchiveRestore className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> : <Archive className="mr-2 h-3.5 w-3.5" aria-hidden="true" />}
                {session.archived ? 'Restore' : 'Archive'}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setMode('CONFIRM_DELETE')} className="text-red-700 focus:text-red-800"><Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Delete…</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
