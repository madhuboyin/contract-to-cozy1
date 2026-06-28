'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Camera, Plus } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ProjectProgressLog } from '@/types';
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
} from '../../ProjectTrackerHelpers';

const ENTRY_TYPE_LABELS: Record<string, string> = {
  MILESTONE_PHOTO: 'Milestone photo', DAILY_NOTE: 'Daily note',
  ISSUE_PHOTO: 'Issue photo', MATERIAL_DELIVERY: 'Material delivery',
};

const ENTRY_TYPE_TONE: Record<string, 'good' | 'info' | 'elevated'> = {
  MILESTONE_PHOTO: 'good', ISSUE_PHOTO: 'elevated', MATERIAL_DELIVERY: 'info',
};

export default function LogPage() {
  const params = useParams<{ id: string; projectId: string }>();
  const { id: propertyId, projectId } = params;

  const [entries, setEntries] = useState<ProjectProgressLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listProjectLogEntries(propertyId, projectId);
      setEntries(result.entries);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load log');
    } finally {
      setLoading(false);
    }
  }, [propertyId, projectId]);

  useEffect(() => { load(); }, [load]);

  const photoEntries = entries.filter(e => e.entryType === 'MILESTONE_PHOTO' || e.entryType === 'ISSUE_PHOTO');

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-4xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/projects/${projectId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to overview
        </Link>
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Progress Log</h1>
          {photoEntries.length > 0 && (
            <p className="text-xs text-slate-500 mt-0.5">
              <Camera className="inline h-3 w-3 mr-0.5" />{photoEntries.length} photo {photoEntries.length === 1 ? 'entry' : 'entries'}
            </p>
          )}
        </div>
        <Button size="sm" className="gap-1.5 h-9" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-4 w-4" />{showForm ? 'Cancel' : 'Add entry'}
        </Button>
      </div>

      <ProjectNav propertyId={propertyId} projectId={projectId} />

      {showForm && (
        <AddLogForm
          propertyId={propertyId}
          projectId={projectId}
          onSaved={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {error && <ErrorBanner msg={error} />}
      {loading ? <Spinner /> : null}

      {!loading && entries.length === 0 && (
        <EmptyStateCard
          title="No log entries yet"
          description="Record daily progress, upload photos, and note material deliveries to build a complete project record."
        />
      )}

      <div className="space-y-3">
        {entries.map(entry => (
          <LogEntryCard key={entry.id} entry={entry} />
        ))}
      </div>
    </MobilePageContainer>
  );
}

function LogEntryCard({ entry: e }: { entry: ProjectProgressLog }) {
  const tone = ENTRY_TYPE_TONE[e.entryType] ?? 'info';
  const hasPhotos = e.photoKeys && e.photoKeys.length > 0;

  return (
    <MobileCard variant="compact" className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500">{fmtDate(e.entryDate)}</p>
        <StatusChip tone={tone}>{ENTRY_TYPE_LABELS[e.entryType] ?? e.entryType}</StatusChip>
      </div>

      {e.notes && <p className="text-sm text-slate-800">{e.notes}</p>}

      {e.materialType && (
        <p className="text-xs text-slate-500">
          {e.materialType}
          {e.materialBrand ? ` · ${e.materialBrand}` : ''}
          {e.materialModel ? ` ${e.materialModel}` : ''}
          {e.materialQuantity ? ` · Qty: ${e.materialQuantity}` : ''}
        </p>
      )}

      {hasPhotos && (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Camera className="h-3 w-3" />
          {e.photoKeys.length} photo{e.photoKeys.length !== 1 ? 's' : ''} stored
        </p>
      )}

      {e.milestone && (
        <p className="text-xs text-slate-500">Milestone: {e.milestone.name}</p>
      )}
      {e.room && (
        <p className="text-xs text-slate-500">Room: {e.room.name}</p>
      )}
    </MobileCard>
  );
}

function AddLogForm({ propertyId, projectId, onSaved, onCancel }: {
  propertyId: string;
  projectId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    entryType: 'DAILY_NOTE',
    notes: '',
    entryDate: new Date().toISOString().split('T')[0],
    materialType: '',
    materialBrand: '',
    materialQuantity: '',
  });
  const set = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.notes.trim() && !form.materialType.trim()) {
      setErr('Add a note or material type');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api.createProjectLogEntry(propertyId, projectId, {
        entryType: form.entryType,
        notes: form.notes.trim() || undefined,
        entryDate: form.entryDate,
        materialType: form.materialType.trim() || undefined,
        materialBrand: form.materialBrand.trim() || undefined,
        materialQuantity: form.materialQuantity.trim() || undefined,
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <MobileCard className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Add log entry</h3>
      {err && <ErrorBanner msg={err} />}
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="lType">Entry type</Label>
            <select
              id="lType"
              value={form.entryType}
              onChange={e => set('entryType', e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {Object.entries(ENTRY_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lDate">Date</Label>
            <Input id="lDate" type="date" value={form.entryDate} onChange={e => set('entryDate', e.target.value)} className="h-10" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lNote">Notes</Label>
          <Textarea id="lNote" value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="What happened today…" />
        </div>
        {form.entryType === 'MATERIAL_DELIVERY' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lMat">Material type</Label>
              <Input id="lMat" value={form.materialType} onChange={e => set('materialType', e.target.value)} placeholder="e.g. Roofing shingles" className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lBrand">Brand</Label>
                <Input id="lBrand" value={form.materialBrand} onChange={e => set('materialBrand', e.target.value)} placeholder="GAF" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lQty">Quantity</Label>
                <Input id="lQty" value={form.materialQuantity} onChange={e => set('materialQuantity', e.target.value)} placeholder="24 squares" className="h-10" />
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="flex-1 h-10">{saving ? 'Saving…' : 'Save entry'}</Button>
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-10">Cancel</Button>
        </div>
      </form>
    </MobileCard>
  );
}
