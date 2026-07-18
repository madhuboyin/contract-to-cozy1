'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/access-certification/page.tsx
//
// Admin-only access certification workspace (ADMIN_MODULE_FRD.md §17
// Phase 6, ADMIN_ROLE_MANAGE). Open a campaign to snapshot every active
// capability grant, attest each grant KEEP or REVOKE (holders cannot
// certify their own access), and complete the campaign once every decision
// is attested. REVOKE executes the real capability revoke immediately.

import React, { useState } from 'react';
import { KeyRound, Loader2, Plus } from 'lucide-react';
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
  useAttestCertificationDecision,
  useCancelCertificationCampaign,
  useCertificationCampaignDetail,
  useCertificationCampaigns,
  useCompleteCertificationCampaign,
  useOpenCertificationCampaign,
} from '@/hooks/useAdminAccessCertification';
import type { CertificationDecision } from '@/lib/api/adminAccessCertification';

const STATUS_BADGE: Record<string, string> = {
  OPEN: 'bg-sky-50 text-sky-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
  PENDING: 'bg-amber-50 text-amber-700',
  KEEP: 'bg-emerald-50 text-emerald-700',
  REVOKE: 'bg-rose-50 text-rose-700',
};

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('');
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required) — this is recorded in the audit log"
          className="min-h-[80px]"
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignDetailPanel({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const detailQ = useCertificationCampaignDetail(campaignId);
  const attest = useAttestCertificationDecision(campaignId);
  const complete = useCompleteCertificationCampaign(campaignId);
  const cancel = useCancelCertificationCampaign(campaignId);

  const [attestTarget, setAttestTarget] = useState<{ decision: CertificationDecision; verdict: 'KEEP' | 'REVOKE' } | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (detailQ.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading campaign…
      </div>
    );
  }

  if (detailQ.isError || !detailQ.data) {
    return (
      <AdminRouteState
        state="error"
        title="Failed to load campaign"
        description="The campaign may no longer exist, or the request failed."
      />
    );
  }

  const c = detailQ.data;
  const pendingCount = c.decisions.filter((d) => d.state === 'PENDING').length;

  const byHolder = new Map<string, CertificationDecision[]>();
  for (const d of c.decisions) {
    const list = byHolder.get(d.holderId) ?? [];
    list.push(d);
    byHolder.set(d.holderId, list);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{c.name}</h3>
          <p className="text-xs text-slate-500">
            Opened by {c.openedByName ?? c.openedById} on {fmtDate(c.createdAt)}
            {c.dueAt ? ` · due ${fmtDate(c.dueAt)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`text-[11px] ${STATUS_BADGE[c.status]}`}>{c.status}</Badge>
          {c.status === 'OPEN' ? (
            <>
              <Button size="sm" variant="outline" disabled={pendingCount > 0} onClick={() => setCompleteOpen(true)}>
                Complete{pendingCount > 0 ? ` (${pendingCount} pending)` : ''}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>
                Cancel campaign
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {[...byHolder.entries()].map(([holderId, decisions]) => (
        <div key={holderId} className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">{decisions[0].holderName ?? holderId}</p>
          <ul className="mt-1.5 space-y-1">
            {decisions.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
                <Badge className={`text-[10px] ${STATUS_BADGE[d.state]}`}>{d.state}</Badge>
                <span className="font-medium text-slate-700">{d.capability}</span>
                {d.bundleName ? <span className="text-slate-400">({d.bundleName})</span> : null}
                {d.state === 'PENDING' && c.status === 'OPEN' ? (
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setAttestTarget({ decision: d, verdict: 'KEEP' })}>
                      Keep
                    </Button>
                    <Button size="sm" variant="destructive" className="h-6 text-[11px]" onClick={() => setAttestTarget({ decision: d, verdict: 'REVOKE' })}>
                      Revoke
                    </Button>
                  </span>
                ) : d.decidedAt ? (
                  <span className="ml-auto text-[10px] text-slate-400">
                    by {d.decidedByName ?? d.decidedById} · {fmtDate(d.decidedAt)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <ReasonDialog
        open={attestTarget !== null}
        onOpenChange={(next) => !next && setAttestTarget(null)}
        title={`${attestTarget?.verdict === 'KEEP' ? 'Keep' : 'Revoke'} ${attestTarget?.decision.capability ?? ''}`}
        description={
          attestTarget?.verdict === 'REVOKE'
            ? `Immediately revokes ${attestTarget.decision.capability} from ${attestTarget.decision.holderName ?? attestTarget.decision.holderId}.`
            : 'Certifies that this grant is still appropriate.'
        }
        confirmLabel={attestTarget?.verdict === 'KEEP' ? 'Confirm keep' : 'Confirm revoke'}
        destructive={attestTarget?.verdict === 'REVOKE'}
        pending={attest.isPending}
        onConfirm={(reason) => {
          if (!attestTarget) return;
          attest.mutate(
            { decisionId: attestTarget.decision.id, decision: attestTarget.verdict, reason },
            {
              onSuccess: () => {
                setAttestTarget(null);
                toast({ title: 'Decision recorded' });
              },
              onError: (err: any) => {
                toast({ title: 'Failed to attest', description: err?.message, variant: 'destructive' });
              },
            },
          );
        }}
      />

      <ReasonDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        title="Complete campaign"
        description="Closes the campaign. All decisions are attested."
        confirmLabel="Complete"
        pending={complete.isPending}
        onConfirm={(reason) =>
          complete.mutate(reason, {
            onSuccess: () => {
              setCompleteOpen(false);
              toast({ title: 'Campaign completed' });
            },
            onError: (err: any) => toast({ title: 'Failed to complete', description: err?.message, variant: 'destructive' }),
          })
        }
      />

      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel campaign"
        description="Abandons the campaign. Decisions already attested (including executed revokes) are not undone."
        confirmLabel="Cancel campaign"
        destructive
        pending={cancel.isPending}
        onConfirm={(reason) =>
          cancel.mutate(reason, {
            onSuccess: () => {
              setCancelOpen(false);
              toast({ title: 'Campaign cancelled' });
            },
            onError: (err: any) => toast({ title: 'Failed to cancel', description: err?.message, variant: 'destructive' }),
          })
        }
      />
    </div>
  );
}

export default function AdminAccessCertificationPage() {
  const { toast } = useToast();
  const guard = useAdminGuard({
    title: 'Access Certification',
    subtitle: 'Periodic review of every active admin capability grant.',
  });

  const campaignsQ = useCertificationCampaigns();
  const openCampaign = useOpenCertificationCampaign();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openDialogVisible, setOpenDialogVisible] = useState(false);
  const [name, setName] = useState('');

  if (guard.status !== 'ready') return guard.node;

  return (
    <AdminConsoleShell
      title="Access Certification"
      subtitle="Snapshot all active capability grants and attest each one. Grant holders cannot certify their own access; revokes execute immediately."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <KeyRound className="h-3 w-3" />
          {campaignsQ.data ? `${campaignsQ.data.length} campaign(s)` : 'Loading…'}
        </span>
      }
    >
      <div className="mb-4">
        <Button size="sm" onClick={() => setOpenDialogVisible(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Open campaign
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {campaignsQ.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading campaigns…
            </div>
          ) : null}
          {campaignsQ.isError ? <p className="p-3 text-xs text-rose-600">Failed to load campaigns.</p> : null}
          {!campaignsQ.isLoading && campaignsQ.data?.length === 0 ? (
            <p className="p-3 text-xs text-slate-400">No campaigns yet. Open one to start a review.</p>
          ) : null}
          <ul className="space-y-1">
            {(campaignsQ.data ?? []).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    selectedId === c.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{c.name}</span>
                    <Badge className={`text-[10px] ${selectedId === c.id ? 'bg-white/10 text-white' : STATUS_BADGE[c.status]}`}>
                      {c.status}
                    </Badge>
                  </div>
                  <div className={selectedId === c.id ? 'text-slate-300' : 'text-slate-400'}>
                    {c.decisionCounts.PENDING} pending · {c.decisionCounts.KEEP} kept · {c.decisionCounts.REVOKE} revoked
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {selectedId ? (
            <CampaignDetailPanel campaignId={selectedId} />
          ) : (
            <AdminRouteState
              state="empty"
              title="No campaign selected"
              description="Select a campaign to review and attest its grant decisions."
            />
          )}
        </div>
      </div>

      <Dialog open={openDialogVisible} onOpenChange={setOpenDialogVisible}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open a certification campaign</DialogTitle>
            <DialogDescription>
              Snapshots every active capability grant into pending decisions. Only one campaign can be open at a
              time.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='Campaign name (e.g. "Q3 2026 access review")'
            className="h-9 text-sm"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpenDialogVisible(false)} disabled={openCampaign.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={openCampaign.isPending || !name.trim()}
              onClick={() =>
                openCampaign.mutate(name.trim(), {
                  onSuccess: (created) => {
                    setOpenDialogVisible(false);
                    setName('');
                    setSelectedId(created.id);
                    toast({ title: 'Campaign opened' });
                  },
                  onError: (err: any) => {
                    toast({ title: 'Failed to open campaign', description: err?.message, variant: 'destructive' });
                  },
                })
              }
            >
              {openCampaign.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Open campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminConsoleShell>
  );
}
