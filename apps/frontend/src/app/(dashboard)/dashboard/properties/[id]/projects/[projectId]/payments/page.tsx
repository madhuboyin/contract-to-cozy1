'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, DollarSign, Plus } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ProjectPayment } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  paymentStatusTone,
} from '../../ProjectTrackerHelpers';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending', DUE: 'Due', OVERDUE: 'Overdue',
  PAID: 'Paid', ON_HOLD: 'On hold', DISPUTED: 'Disputed',
};

const TRIGGER_LABELS: Record<string, string> = {
  DATE: 'Date-based', MILESTONE: 'Milestone completion', MANUAL: 'Manual',
};

export default function PaymentsPage() {
  const params = useParams<{ id: string; projectId: string }>();
  const { id: propertyId, projectId } = params;

  const [payments, setPayments] = useState<ProjectPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listPayments(propertyId, projectId);
      setPayments(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [propertyId, projectId]);

  useEffect(() => { load(); }, [load]);

  const totalDue = payments.filter(p => ['DUE', 'OVERDUE'].includes(p.status))
    .reduce((s, p) => s + p.amountCents, 0);
  const totalPaid = payments.filter(p => p.status === 'PAID')
    .reduce((s, p) => s + p.amountCents, 0);
  const pending = payments.filter(p => p.status !== 'PAID');
  const paid = payments.filter(p => p.status === 'PAID');

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-4xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/projects/${projectId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to overview
        </Link>
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
        <Button size="sm" className="gap-1.5 h-9" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-4 w-4" />{showForm ? 'Cancel' : 'Add'}
        </Button>
      </div>

      <ProjectNav propertyId={propertyId} projectId={projectId} />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <MobileCard variant="compact" className="text-center space-y-0.5">
          <p className="text-xs text-slate-500">Due now</p>
          <p className={`text-xl font-bold ${totalDue > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
            {fmtMoney(totalDue)}
          </p>
        </MobileCard>
        <MobileCard variant="compact" className="text-center space-y-0.5">
          <p className="text-xs text-slate-500">Paid to date</p>
          <p className="text-xl font-bold text-emerald-700">{fmtMoney(totalPaid)}</p>
        </MobileCard>
      </div>

      {showForm && (
        <AddPaymentForm
          propertyId={propertyId}
          projectId={projectId}
          onSaved={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {error && <ErrorBanner msg={error} />}
      {loading ? <Spinner /> : null}

      {!loading && payments.length === 0 && (
        <EmptyStateCard
          title="No payments scheduled"
          description="Add payment milestones to track what you owe and when."
        />
      )}

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Upcoming &amp; due</h2>
          {pending.map(p => (
            <PaymentCard
              key={p.id}
              payment={p}
              propertyId={propertyId}
              projectId={projectId}
              onPaid={load}
            />
          ))}
        </section>
      )}

      {paid.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Paid</h2>
          {paid.map(p => (
            <PaymentCard
              key={p.id}
              payment={p}
              propertyId={propertyId}
              projectId={projectId}
              onPaid={load}
              dimmed
            />
          ))}
        </section>
      )}
    </MobilePageContainer>
  );
}

function PaymentCard({ payment: p, propertyId, projectId, onPaid, dimmed }: {
  payment: ProjectPayment;
  propertyId: string;
  projectId: string;
  onPaid: () => void;
  dimmed?: boolean;
}) {
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function markPaid() {
    setPaying(true);
    setErr(null);
    try {
      await api.markPaymentPaid(propertyId, projectId, p.id, {
        paidDate: new Date().toISOString(),
        paymentMethod: 'CHECK',
      });
      onPaid();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to mark paid');
    } finally {
      setPaying(false);
    }
  }

  return (
    <MobileCard variant="compact" className={`space-y-2 ${dimmed ? 'opacity-60' : ''}`}>
      {err && <ErrorBanner msg={err} />}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{p.description}</p>
          <p className="text-xs text-slate-500">{TRIGGER_LABELS[p.triggerType] ?? p.triggerType}</p>
        </div>
        <StatusChip tone={paymentStatusTone(p.status)}>{STATUS_LABELS[p.status] ?? p.status}</StatusChip>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="text-base font-bold text-slate-900"><DollarSign className="inline h-3.5 w-3.5" />{(p.amountCents / 100).toLocaleString()}</span>
        {p.dueDate && <span>Due: {fmtDate(p.dueDate)}</span>}
        {p.paidDate && <span>Paid: {fmtDate(p.paidDate)}</span>}
        {p.paymentMethod && <span>Via {p.paymentMethod.replace('_', ' ').toLowerCase()}</span>}
      </div>
      {p.notes && <p className="text-xs text-slate-500">{p.notes}</p>}
      {!dimmed && ['PENDING', 'DUE', 'OVERDUE'].includes(p.status) && (
        <Button size="sm" variant="outline" className="h-8 text-xs w-full" disabled={paying} onClick={markPaid}>
          {paying ? 'Saving…' : 'Mark as paid'}
        </Button>
      )}
    </MobileCard>
  );
}

function AddPaymentForm({ propertyId, projectId, onSaved, onCancel }: {
  propertyId: string;
  projectId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ description: '', amountCents: '', dueDate: '', notes: '' });
  const set = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(parseFloat(form.amountCents) * 100);
    if (!form.description || !cents) { setErr('Description and amount are required'); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.createPayment(propertyId, projectId, {
        description: form.description.trim(),
        amountCents: cents,
        triggerType: 'MANUAL',
        dueDate: form.dueDate || undefined,
        notes: form.notes.trim() || undefined,
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to add payment');
      setSaving(false);
    }
  }

  return (
    <MobileCard className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Add payment</h3>
      {err && <ErrorBanner msg={err} />}
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="pDesc">Description *</Label>
          <Input id="pDesc" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Final payment" className="h-10" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pAmt">Amount ($) *</Label>
            <Input id="pAmt" type="number" step="0.01" min="0" value={form.amountCents} onChange={e => set('amountCents', e.target.value)} placeholder="2500.00" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pDue">Due date</Label>
            <Input id="pDue" type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} className="h-10" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pNotes">Notes</Label>
          <Input id="pNotes" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes" className="h-10" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="flex-1 h-10">{saving ? 'Saving…' : 'Save'}</Button>
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-10">Cancel</Button>
        </div>
      </form>
    </MobileCard>
  );
}
