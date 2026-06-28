'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ProjectChangeOrder } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  EmptyStateCard,
  MobileCard,
  MobilePageContainer,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import {
  ProjectNav,
  Spinner,
  ErrorBanner,
  fmtDate,
  fmtMoney,
  fmtDelta,
  changeOrderStatusTone,
  CHANGE_ORDER_CATEGORY_LABELS,
} from '../../ProjectTrackerHelpers';

const CO_STATUS_LABELS: Record<string, string> = {
  PROPOSED: 'Proposed', APPROVED: 'Approved', REJECTED: 'Rejected', VOIDED: 'Voided',
};

export default function ChangeOrdersPage() {
  const params = useParams<{ id: string; projectId: string }>();
  const { id: propertyId, projectId } = params;

  const [orders, setOrders] = useState<ProjectChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listChangeOrders(propertyId, projectId);
      setOrders(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load change orders');
    } finally {
      setLoading(false);
    }
  }, [propertyId, projectId]);

  useEffect(() => { load(); }, [load]);

  const proposed = orders.filter(o => o.status === 'PROPOSED');
  const approved = orders.filter(o => o.status === 'APPROVED');
  const other = orders.filter(o => ['REJECTED', 'VOIDED'].includes(o.status));

  const totalApprovedDelta = approved.reduce((s, o) => s + o.costDeltaCents, 0);

  async function handleApprove(coId: string) {
    try {
      await api.approveChangeOrder(propertyId, projectId, coId);
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to approve');
    }
  }

  async function handleReject(coId: string) {
    try {
      await api.rejectChangeOrder(propertyId, projectId, coId);
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to reject');
    }
  }

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-4xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/projects/${projectId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to overview
        </Link>
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Change Orders</h1>
        <Button size="sm" className="gap-1.5 h-9" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-4 w-4" />{showForm ? 'Cancel' : 'Add CO'}
        </Button>
      </div>

      <ProjectNav propertyId={propertyId} projectId={projectId} />

      {totalApprovedDelta !== 0 && (
        <MobileCard variant="compact" className="flex items-center justify-between">
          <p className="text-sm text-slate-600">Approved CO total impact</p>
          <p className={`text-base font-bold ${totalApprovedDelta > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            {fmtDelta(totalApprovedDelta)}
          </p>
        </MobileCard>
      )}

      {showForm && (
        <AddCOForm
          propertyId={propertyId}
          projectId={projectId}
          onSaved={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {error && <ErrorBanner msg={error} />}
      {loading ? <Spinner /> : null}

      {!loading && orders.length === 0 && (
        <EmptyStateCard
          title="No change orders"
          description="Record scope or price changes from your contractor as change orders."
        />
      )}

      {proposed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Needs review ({proposed.length})</h2>
          {proposed.map(o => (
            <COCard key={o.id} order={o} onApprove={() => handleApprove(o.id)} onReject={() => handleReject(o.id)} />
          ))}
        </section>
      )}

      {approved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Approved</h2>
          {approved.map(o => <COCard key={o.id} order={o} />)}
        </section>
      )}

      {other.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500">Rejected / voided</h2>
          {other.map(o => <COCard key={o.id} order={o} dimmed />)}
        </section>
      )}
    </MobilePageContainer>
  );
}

function COCard({ order: o, onApprove, onReject, dimmed }: {
  order: ProjectChangeOrder;
  onApprove?: () => void;
  onReject?: () => void;
  dimmed?: boolean;
}) {
  return (
    <MobileCard variant="compact" className={`space-y-2 ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{o.title}</p>
          <p className="text-xs text-slate-500">
            {CHANGE_ORDER_CATEGORY_LABELS[o.category] ?? o.category} · CO #{o.changeNumber} · {fmtDate(o.createdAt)}
          </p>
        </div>
        <StatusChip tone={changeOrderStatusTone(o.status)}>{CO_STATUS_LABELS[o.status] ?? o.status}</StatusChip>
      </div>

      <p className={`text-base font-bold ${o.costDeltaCents > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
        {fmtDelta(o.costDeltaCents)}
      </p>

      {o.description && <p className="text-xs text-slate-500">{o.description}</p>}
      {o.notes && <p className="text-xs text-slate-500">Notes: {o.notes}</p>}
      {o.approvedAt && <p className="text-xs text-emerald-700">Approved {fmtDate(o.approvedAt)}</p>}

      {onApprove && onReject && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="h-8 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={onApprove}>Approve</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs flex-1 text-rose-700 border-rose-300" onClick={onReject}>Reject</Button>
        </div>
      )}
    </MobileCard>
  );
}

function AddCOForm({ propertyId, projectId, onSaved, onCancel }: {
  propertyId: string;
  projectId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '', category: 'HOMEOWNER_REQUEST', costDeltaCents: '', description: '', proposedByName: '',
  });
  const set = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const delta = Math.round(parseFloat(form.costDeltaCents) * 100);
    if (!form.title || isNaN(delta)) { setErr('Title and amount are required'); return; }
    if (!form.proposedByName.trim()) { setErr('Proposed-by name is required'); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.createChangeOrder(propertyId, projectId, {
        title: form.title.trim(),
        category: form.category,
        costDeltaCents: delta,
        description: form.description.trim() || '—',
        proposedByName: form.proposedByName.trim(),
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <MobileCard className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Add change order</h3>
      {err && <ErrorBanner msg={err} />}
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="coTitle">Title *</Label>
          <Input id="coTitle" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Additional waterproofing" className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="coProposed">Proposed by *</Label>
          <Input id="coProposed" value={form.proposedByName} onChange={e => set('proposedByName', e.target.value)} placeholder="Contractor or homeowner name" className="h-10" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="coCategory">Category</Label>
            <select
              id="coCategory"
              value={form.category}
              onChange={e => set('category', e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {Object.entries(CHANGE_ORDER_CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coDelta">Amount (+/-) ($) *</Label>
            <Input id="coDelta" type="number" step="0.01" value={form.costDeltaCents} onChange={e => set('costDeltaCents', e.target.value)} placeholder="1200.00" className="h-10" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="coDesc">Description</Label>
          <Textarea id="coDesc" value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Reason for change…" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="flex-1 h-10">{saving ? 'Saving…' : 'Submit CO'}</Button>
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-10">Cancel</Button>
        </div>
      </form>
    </MobileCard>
  );
}
