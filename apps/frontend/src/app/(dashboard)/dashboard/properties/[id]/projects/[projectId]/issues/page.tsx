'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Plus } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ProjectIssue } from '@/types';
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
  issueSeverityTone,
  issueStatusTone,
  ISSUE_CATEGORY_LABELS,
} from '../../ProjectTrackerHelpers';

const SEVERITY_LABELS: Record<string, string> = {
  BLOCKING: 'Blocking', MAJOR: 'Major', MINOR: 'Minor',
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open', ACKNOWLEDGED: 'Acknowledged', RESOLVED: 'Resolved', ESCALATED: 'Escalated',
};

export default function IssuesPage() {
  const params = useParams<{ id: string; projectId: string }>();
  const { id: propertyId, projectId } = params;

  const [issues, setIssues] = useState<ProjectIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listProjectIssues(propertyId, projectId);
      setIssues(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [propertyId, projectId]);

  useEffect(() => { load(); }, [load]);

  const open = issues.filter(i => i.status !== 'RESOLVED');
  const resolved = issues.filter(i => i.status === 'RESOLVED');
  const blocking = open.filter(i => i.severity === 'BLOCKING');

  async function resolve(issueId: string) {
    try {
      await api.resolveProjectIssue(propertyId, projectId, issueId, 'Resolved via project tracker.');
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to resolve issue');
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
        <h1 className="text-2xl font-bold text-slate-900">Issues</h1>
        <Button size="sm" className="gap-1.5 h-9" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-4 w-4" />{showForm ? 'Cancel' : 'Report issue'}
        </Button>
      </div>

      <ProjectNav propertyId={propertyId} projectId={projectId} />

      {blocking.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-rose-800">
              {blocking.length} blocking issue{blocking.length !== 1 ? 's' : ''} — payments on hold
            </p>
            <p className="text-xs text-rose-700 mt-0.5">Resolve all blocking issues to release payment holds.</p>
          </div>
        </div>
      )}

      {showForm && (
        <AddIssueForm
          propertyId={propertyId}
          projectId={projectId}
          onSaved={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {error && <ErrorBanner msg={error} />}
      {loading ? <Spinner /> : null}

      {!loading && issues.length === 0 && (
        <EmptyStateCard
          title="No issues reported"
          description="Report quality concerns, scope disputes, or safety issues here. Blocking issues will pause payments automatically."
        />
      )}

      {open.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Open ({open.length})</h2>
          {open.map(issue => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onResolve={() => resolve(issue.id)}
            />
          ))}
        </section>
      )}

      {resolved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500">Resolved</h2>
          {resolved.map(issue => (
            <IssueCard key={issue.id} issue={issue} dimmed />
          ))}
        </section>
      )}
    </MobilePageContainer>
  );
}

function IssueCard({ issue: i, onResolve, dimmed }: {
  issue: ProjectIssue;
  onResolve?: () => void;
  dimmed?: boolean;
}) {
  return (
    <MobileCard variant="compact" className={`space-y-2 ${dimmed ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className={`h-3.5 w-3.5 flex-shrink-0 ${
              i.severity === 'BLOCKING' ? 'text-rose-500' : i.severity === 'MAJOR' ? 'text-amber-500' : 'text-blue-500'
            }`} />
            <p className="text-sm font-semibold text-slate-900">{i.title}</p>
          </div>
          <p className="text-xs text-slate-500">
            {ISSUE_CATEGORY_LABELS[i.category] ?? i.category} · Reported {fmtDate(i.createdAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusChip tone={issueSeverityTone(i.severity)}>{SEVERITY_LABELS[i.severity] ?? i.severity}</StatusChip>
          <StatusChip tone={issueStatusTone(i.status)}>{STATUS_LABELS[i.status] ?? i.status}</StatusChip>
        </div>
      </div>

      {i.description && <p className="text-xs text-slate-600">{i.description}</p>}
      {i.resolutionNotes && (
        <p className="text-xs text-emerald-700 border-t border-slate-100 pt-2">
          Resolution: {i.resolutionNotes}
        </p>
      )}

      {onResolve && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs w-full"
          onClick={onResolve}
        >
          Mark resolved
        </Button>
      )}
    </MobileCard>
  );
}

function AddIssueForm({ propertyId, projectId, onSaved, onCancel }: {
  propertyId: string;
  projectId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '', severity: 'MINOR', category: 'QUALITY_CONCERN', description: '',
  });
  const set = (f: string, v: string) => setForm(p => ({ ...p, [f]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setErr('Title is required'); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.createProjectIssue(propertyId, projectId, {
        title: form.title.trim(),
        severity: form.severity,
        category: form.category,
        description: form.description.trim() || '—',
        blocksPayment: form.severity === 'BLOCKING',
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <MobileCard className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Report issue</h3>
      {err && <ErrorBanner msg={err} />}
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="iTitle">Title *</Label>
          <Input id="iTitle" value={form.title} onChange={e => set('title', e.target.value)} placeholder="What's the issue?" className="h-10" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="iSeverity">Severity</Label>
            <select id="iSeverity" value={form.severity} onChange={e => set('severity', e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="MINOR">Minor</option>
              <option value="MAJOR">Major</option>
              <option value="BLOCKING">Blocking</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iCategory">Category</Label>
            <select id="iCategory" value={form.category} onChange={e => set('category', e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {Object.entries(ISSUE_CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="iDesc">Description</Label>
          <Textarea id="iDesc" value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="Describe the issue in detail…" />
        </div>
        {form.severity === 'BLOCKING' && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
            Blocking issues will put all pending payments on hold until resolved.
          </div>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="flex-1 h-10">{saving ? 'Saving…' : 'Report issue'}</Button>
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-10">Cancel</Button>
        </div>
      </form>
    </MobileCard>
  );
}
