'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Camera, CheckCircle2, Clock, Plus } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ProjectMilestone } from '@/types';
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
  milestoneStatusTone,
} from '../../ProjectTrackerHelpers';

const STATUS_LABELS: Record<string, string> = {
  UPCOMING: 'Upcoming', IN_PROGRESS: 'In progress', COMPLETE: 'Complete',
  DELAYED: 'Delayed', BLOCKED: 'Blocked', DISPUTED: 'Disputed',
};

const TYPE_LABELS: Record<string, string> = {
  STANDARD: 'Standard', PERMIT_INSPECTION: 'Permit inspection',
  PAYMENT_TRIGGER: 'Payment trigger', CUSTOM: 'Custom',
};

export default function MilestonesPage() {
  const params = useParams<{ id: string; projectId: string }>();
  const { id: propertyId, projectId } = params;

  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listMilestones(propertyId, projectId);
      setMilestones(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load milestones');
    } finally {
      setLoading(false);
    }
  }, [propertyId, projectId]);

  useEffect(() => { load(); }, [load]);

  async function completeMilestone(milestoneId: string) {
    setCompleting(milestoneId);
    setError(null);
    try {
      await api.completeMilestone(propertyId, projectId, milestoneId, {
        actualCompletedDate: new Date().toISOString(),
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to complete milestone');
    } finally {
      setCompleting(null);
    }
  }

  const done = milestones.filter(m => m.status === 'COMPLETE');
  const active = milestones.filter(m => m.status !== 'COMPLETE');

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-4xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/projects/${projectId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to overview
        </Link>
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Milestones</h1>
        <Button size="sm" className="gap-1.5 h-9" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-4 w-4" />{showForm ? 'Cancel' : 'Add'}
        </Button>
      </div>

      <ProjectNav propertyId={propertyId} projectId={projectId} />

      {showForm && (
        <AddMilestoneForm
          propertyId={propertyId}
          projectId={projectId}
          nextPosition={milestones.length + 1}
          onSaved={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {error && <ErrorBanner msg={error} />}
      {loading ? <Spinner /> : null}

      {!loading && milestones.length === 0 && (
        <EmptyStateCard
          title="No milestones"
          description="Add milestones manually or edit the project to load a template for this project type."
        />
      )}

      {active.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Upcoming</h2>
          {active.map((m, idx) => (
            <MilestoneCard
              key={m.id}
              milestone={m}
              seq={idx + 1}
              completing={completing === m.id}
              onComplete={() => completeMilestone(m.id)}
              propertyId={propertyId}
              projectId={projectId}
            />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Completed</h2>
          {done.map((m, idx) => (
            <MilestoneCard
              key={m.id}
              milestone={m}
              seq={active.length + idx + 1}
              completing={false}
              onComplete={() => {}}
              propertyId={propertyId}
              projectId={projectId}
              dimmed
            />
          ))}
        </section>
      )}
    </MobilePageContainer>
  );
}

function AddMilestoneForm({ propertyId, projectId, nextPosition, onSaved, onCancel }: {
  propertyId: string;
  projectId: string;
  nextPosition: number;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    milestoneType: 'STANDARD',
    scheduledDate: '',
    requiresPhotoEvidence: false,
  });
  const set = (f: string, v: string | boolean) => setForm(p => ({ ...p, [f]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.createMilestone(propertyId, projectId, {
        name: form.name.trim(),
        milestoneType: form.milestoneType,
        scheduledDate: form.scheduledDate || undefined,
        requiresPhotoEvidence: form.requiresPhotoEvidence,
        position: nextPosition,
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <MobileCard className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Add milestone</h3>
      {err && <ErrorBanner msg={err} />}
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="mName">Name *</Label>
          <Input
            id="mName"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Rough-in inspection"
            className="h-10"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="mType">Type</Label>
            <select
              id="mType"
              value={form.milestoneType}
              onChange={e => set('milestoneType', e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="STANDARD">Standard</option>
              <option value="PERMIT_INSPECTION">Permit inspection</option>
              <option value="PAYMENT_TRIGGER">Payment trigger</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mDate">Scheduled date</Label>
            <Input
              id="mDate"
              type="date"
              value={form.scheduledDate}
              onChange={e => set('scheduledDate', e.target.value)}
              className="h-10"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.requiresPhotoEvidence}
            onChange={e => set('requiresPhotoEvidence', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">Requires photo evidence to complete</span>
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="flex-1 h-10">
            {saving ? 'Saving…' : 'Add milestone'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-10">
            Cancel
          </Button>
        </div>
      </form>
    </MobileCard>
  );
}

function MilestoneCard({
  milestone: m, seq, completing, onComplete, propertyId, projectId, dimmed,
}: {
  milestone: ProjectMilestone;
  seq: number;
  completing: boolean;
  onComplete: () => void;
  propertyId: string;
  projectId: string;
  dimmed?: boolean;
}) {
  return (
    <MobileCard variant="compact" className={`space-y-2 ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {seq}
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold text-slate-900">{m.name}</p>
            <p className="text-xs text-slate-500">{TYPE_LABELS[m.milestoneType] ?? m.milestoneType}</p>
          </div>
        </div>
        <StatusChip tone={milestoneStatusTone(m.status)}>{STATUS_LABELS[m.status] ?? m.status}</StatusChip>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600 pl-8">
        {m.scheduledDate && <span><Clock className="inline h-3 w-3 mr-0.5" />{fmtDate(m.scheduledDate)}</span>}
        {m.actualCompletedDate && <span><CheckCircle2 className="inline h-3 w-3 mr-0.5 text-emerald-600" />{fmtDate(m.actualCompletedDate)}</span>}
        {m.requiresPhotoEvidence && (
          <span className="flex items-center gap-0.5 text-amber-700">
            <Camera className="h-3 w-3" />Photo required
          </span>
        )}
      </div>

      {!dimmed && m.status !== 'COMPLETE' && (
        <div className="flex gap-2 pl-8">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={completing}
            onClick={onComplete}
          >
            {completing ? 'Completing…' : 'Mark complete'}
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" asChild>
            <Link href={`/dashboard/properties/${propertyId}/projects/${projectId}/log`}>
              <Camera className="h-3 w-3" />Add photo
            </Link>
          </Button>
        </div>
      )}
    </MobileCard>
  );
}
