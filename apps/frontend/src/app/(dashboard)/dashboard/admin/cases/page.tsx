'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/cases/page.tsx
//
// Admin-only case management workspace (ADMIN_MODULE_FRD.md §10.5 +
// Phase 1 cross-domain case foundation). Work the open case set, open new
// SAFETY/ABUSE/SUPPORT cases, keep a note trail, and move cases through a
// governed lifecycle with a required reason.

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FolderKanban, Loader2, Plus } from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAddAdminCaseNote,
  useAdminCaseDetail,
  useAdminCaseList,
  useChangeAdminCaseStatus,
  useCreateAdminCase,
} from '@/hooks/useAdminCases';
import type { AdminCaseSeverity, AdminCaseStatus, AdminCaseType } from '@/lib/api/adminCases';

const SEVERITY_BADGE: Record<AdminCaseSeverity, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-amber-50 text-amber-700',
  HIGH: 'bg-orange-50 text-orange-700',
  CRITICAL: 'bg-rose-50 text-rose-700',
};

const STATUS_BADGE: Record<AdminCaseStatus, string> = {
  OPEN: 'bg-sky-50 text-sky-700',
  IN_PROGRESS: 'bg-indigo-50 text-indigo-700',
  RESOLVED: 'bg-emerald-50 text-emerald-700',
  CLOSED: 'bg-slate-100 text-slate-600',
};

const CASE_TYPES: AdminCaseType[] = ['SAFETY', 'ABUSE', 'REVIEW_INVESTIGATION', 'SUPPORT'];
const SEVERITIES: AdminCaseSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// Client-side mirror of the service's governed lifecycle.
const NEXT_STATUSES: Record<AdminCaseStatus, AdminCaseStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['OPEN', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

// ─── Create-case dialog ────────────────────────────────────────────────────────

function CreateCaseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const create = useCreateAdminCase();
  const [type, setType] = useState<AdminCaseType>('SUPPORT');
  const [severity, setSeverity] = useState<AdminCaseSeverity>('MEDIUM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  function reset() {
    setType('SUPPORT');
    setSeverity('MEDIUM');
    setTitle('');
    setDescription('');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a case</DialogTitle>
          <DialogDescription>
            Cases track safety, abuse, and support investigations with a full note trail.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Select value={type} onValueChange={(v) => setType(v as AdminCaseType)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CASE_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={(v) => setSeverity(v as AdminCaseSeverity)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Case title"
          className="h-9 text-sm"
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What happened, and what needs to be investigated?"
          className="min-h-[90px]"
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={create.isPending || !title.trim() || !description.trim()}
            onClick={() =>
              create.mutate(
                { type, severity, title: title.trim(), description: description.trim() },
                {
                  onSuccess: (created) => {
                    onOpenChange(false);
                    reset();
                    toast({ title: 'Case opened', description: `${created.caseNumber} created.` });
                  },
                  onError: (err: any) => {
                    toast({ title: 'Failed to open case', description: err?.message, variant: 'destructive' });
                  },
                },
              )
            }
          >
            {create.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Open case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status-change dialog (reason + optional resolution) ───────────────────────

function CaseStatusDialog({
  target,
  onOpenChange,
  pending,
  onConfirm,
}: {
  target: AdminCaseStatus | null;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: (reason: string, resolution?: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('');
  const needsResolution = target === 'RESOLVED';

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) {
          setReason('');
          setResolution('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move case to {target ?? ''}</DialogTitle>
          <DialogDescription>
            {needsResolution
              ? 'Resolving requires a resolution summary in addition to the reason.'
              : 'The reason is recorded in the audit log.'}
          </DialogDescription>
        </DialogHeader>
        {needsResolution ? (
          <Textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="Resolution summary (required)"
            className="min-h-[70px]"
          />
        ) : null}
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required) — this is recorded in the audit log"
          className="min-h-[70px]"
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={pending || !reason.trim() || (needsResolution && !resolution.trim())}
            onClick={() => onConfirm(reason.trim(), needsResolution ? resolution.trim() : undefined)}
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail panel ──────────────────────────────────────────────────────────────

function CaseDetailPanel({ caseId }: { caseId: string }) {
  const { toast } = useToast();
  const detailQ = useAdminCaseDetail(caseId);
  const changeStatus = useChangeAdminCaseStatus(caseId);
  const addNote = useAddAdminCaseNote(caseId);
  const [statusDialog, setStatusDialog] = useState<AdminCaseStatus | null>(null);
  const [noteBody, setNoteBody] = useState('');

  if (detailQ.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading case…
      </div>
    );
  }

  if (detailQ.isError || !detailQ.data) {
    return (
      <AdminRouteState
        state="error"
        title="Failed to load case"
        description="The case may no longer exist, or the request failed. Try selecting it again."
      />
    );
  }

  const c = detailQ.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {c.caseNumber} · {c.title}
          </h3>
          <p className="text-xs text-slate-500">
            Opened by {c.openedByName ?? c.openedById} on {fmtDate(c.createdAt)}
            {c.assignedToId ? ` · assigned to ${c.assignedToName ?? c.assignedToId}` : ' · unassigned'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            {c.type}
          </Badge>
          <Badge className={`text-[11px] ${SEVERITY_BADGE[c.severity]}`}>{c.severity}</Badge>
          <Badge className={`text-[11px] ${STATUS_BADGE[c.status]}`}>{c.status}</Badge>
        </div>
      </div>

      <p className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-[13px] text-slate-700">
        {c.description}
      </p>

      {c.entityType && c.entityId ? (
        <p className="text-[12px] text-slate-500">
          Linked entity: <span className="font-medium text-slate-700">{c.entityType}</span>{' '}
          <code className="rounded bg-slate-100 px-1 text-[11px]">{c.entityId}</code>
        </p>
      ) : null}

      {c.resolution ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-[12px]">
          <p className="font-semibold text-emerald-700">Resolution {c.resolvedAt ? `(${fmtDate(c.resolvedAt)})` : ''}</p>
          <p className="whitespace-pre-wrap text-emerald-800">{c.resolution}</p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 p-3 text-[12px]">
        <p className="font-semibold text-slate-600">Notes ({c.notes.length})</p>
        {c.notes.length === 0 ? <p className="text-slate-400">No notes yet.</p> : null}
        <ul className="mt-1 space-y-2">
          {c.notes.map((n) => (
            <li key={n.id}>
              <p className="text-slate-400">
                {n.authorName ?? n.authorId} · {fmtDate(n.createdAt)}
              </p>
              <p className="whitespace-pre-wrap text-slate-600">{n.body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-end gap-2">
          <Textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Add a note…"
            className="min-h-[60px] text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={addNote.isPending || !noteBody.trim()}
            onClick={() =>
              addNote.mutate(noteBody.trim(), {
                onSuccess: () => setNoteBody(''),
                onError: (err: any) =>
                  toast({ title: 'Failed to add note', description: err?.message, variant: 'destructive' }),
              })
            }
          >
            {addNote.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Add
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {NEXT_STATUSES[c.status].map((s) => (
          <Button key={s} size="sm" variant={s === 'CLOSED' ? 'destructive' : 'outline'} onClick={() => setStatusDialog(s)}>
            Move to {s}
          </Button>
        ))}
      </div>

      <CaseStatusDialog
        target={statusDialog}
        onOpenChange={(next) => !next && setStatusDialog(null)}
        pending={changeStatus.isPending}
        onConfirm={(reason, resolution) => {
          if (!statusDialog) return;
          changeStatus.mutate(
            { status: statusDialog, reason, resolution },
            {
              onSuccess: (result) => {
                setStatusDialog(null);
                toast({ title: 'Case updated', description: `Case moved to ${result.status}.` });
              },
              onError: (err: any) => {
                toast({ title: 'Failed to update case', description: err?.message, variant: 'destructive' });
              },
            },
          );
        }}
      />
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────

function AdminCasesPageInner() {
  const searchParams = useSearchParams();
  const initialSeverity = searchParams.get('severity');

  const [statusFilter, setStatusFilter] = useState<AdminCaseStatus | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<AdminCaseType | undefined>(undefined);
  const [severityFilter, setSeverityFilter] = useState<AdminCaseSeverity | undefined>(
    initialSeverity && (SEVERITIES as string[]).includes(initialSeverity)
      ? (initialSeverity as AdminCaseSeverity)
      : undefined,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const listQ = useAdminCaseList({ status: statusFilter, type: typeFilter, severity: severityFilter });

  return (
    <AdminConsoleShell
      title="Cases"
      subtitle="Safety, abuse, review-investigation, and support cases with a governed lifecycle and note trail."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <FolderKanban className="h-3 w-3" />
          {listQ.data ? `${listQ.data.total} in view` : 'Loading…'}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={statusFilter ?? 'WORKING'}
          onValueChange={(v) => {
            setSelectedId(null);
            setStatusFilter(v === 'WORKING' ? undefined : (v as AdminCaseStatus));
          }}
        >
          <SelectTrigger className="h-9 w-[200px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WORKING" className="text-xs">
              Working set (open + in progress)
            </SelectItem>
            {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as AdminCaseStatus[]).map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={typeFilter ?? 'ALL'}
          onValueChange={(v) => {
            setSelectedId(null);
            setTypeFilter(v === 'ALL' ? undefined : (v as AdminCaseType));
          }}
        >
          <SelectTrigger className="h-9 w-[200px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs">
              All types
            </SelectItem>
            {CASE_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={severityFilter ?? 'ALL'}
          onValueChange={(v) => {
            setSelectedId(null);
            setSeverityFilter(v === 'ALL' ? undefined : (v as AdminCaseSeverity));
          }}
        >
          <SelectTrigger className="h-9 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs">
              All severities
            </SelectItem>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-9" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Open case
        </Button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {listQ.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading cases…
            </div>
          ) : null}

          {listQ.isError ? <p className="p-3 text-xs text-rose-600">Failed to load cases. Try again.</p> : null}

          {!listQ.isLoading && listQ.data?.cases.length === 0 ? (
            <p className="p-3 text-xs text-slate-400">No cases in this view.</p>
          ) : null}

          <ul className="space-y-1">
            {(listQ.data?.cases ?? []).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    selectedId === c.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{c.caseNumber}</span>
                    <span className="flex items-center gap-1">
                      <Badge
                        className={`text-[10px] ${selectedId === c.id ? 'bg-white/10 text-white' : SEVERITY_BADGE[c.severity]}`}
                      >
                        {c.severity}
                      </Badge>
                      <Badge
                        className={`text-[10px] ${selectedId === c.id ? 'bg-white/10 text-white' : STATUS_BADGE[c.status]}`}
                      >
                        {c.status}
                      </Badge>
                    </span>
                  </div>
                  <div className={selectedId === c.id ? 'text-slate-300' : 'text-slate-400'}>
                    [{c.type}] {c.title}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {selectedId ? (
            <CaseDetailPanel caseId={selectedId} />
          ) : (
            <AdminRouteState
              state="empty"
              title="No case selected"
              description="Select a case to see its description, notes, and lifecycle actions."
            />
          )}
        </div>
      </div>

      <CreateCaseDialog open={createOpen} onOpenChange={setCreateOpen} />
    </AdminConsoleShell>
  );
}

export default function AdminCasesPage() {
  const guard = useAdminGuard({
    title: 'Cases',
    subtitle: 'Safety, abuse, and support case management.',
  });

  if (guard.status !== 'ready') return guard.node;

  return (
    <Suspense fallback={null}>
      <AdminCasesPageInner />
    </Suspense>
  );
}
