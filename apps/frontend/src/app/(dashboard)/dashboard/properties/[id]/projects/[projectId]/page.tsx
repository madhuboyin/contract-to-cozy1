'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ProjectRecord } from '@/types';
import { Button } from '@/components/ui/button';
import {
  MobileCard,
  MobilePageContainer,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import {
  PROJECT_TYPE_LABELS,
  ProjectNav,
  KpiTile,
  Spinner,
  ErrorBanner,
  fmtDate,
  fmtMoney,
  daysUntil,
  projectStatusTone,
  milestoneStatusTone,
} from '../ProjectTrackerHelpers';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft', PLANNING: 'Planning', IN_PROGRESS: 'In Progress',
  PAUSED: 'Paused', COMPLETED: 'Completed', CANCELLED: 'Cancelled', DISPUTED: 'Disputed',
};

const MILESTONE_STATUS_LABELS: Record<string, string> = {
  UPCOMING: 'Upcoming', IN_PROGRESS: 'In progress', COMPLETE: 'Complete',
  DELAYED: 'Delayed', BLOCKED: 'Blocked', DISPUTED: 'Disputed',
};

export default function ProjectDashboardPage() {
  const params = useParams<{ id: string; projectId: string }>();
  const { id: propertyId, projectId } = params;
  const router = useRouter();

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getProject(propertyId, projectId);
      setProject(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [propertyId, projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <MobilePageContainer><Spinner /></MobilePageContainer>;
  if (error) return <MobilePageContainer><ErrorBanner msg={error} /></MobilePageContainer>;
  if (!project) return null;

  const p = project;
  const remaining = p.currentContractAmountCents - p.paidToDateCents;
  const nextMilestone = p.milestones?.find(m => !['COMPLETE', 'DISPUTED'].includes(m.status));
  const openIssues = p.issues?.filter(i => i.status !== 'RESOLVED') ?? [];
  const blockingIssues = openIssues.filter(i => i.severity === 'BLOCKING');
  const daysLeft = daysUntil(p.expectedEndDate);

  const pct = p.currentContractAmountCents > 0
    ? Math.round((p.paidToDateCents / p.currentContractAmountCents) * 100)
    : 0;

  const completedMilestones = p.milestones?.filter(m => m.status === 'COMPLETE').length ?? 0;
  const totalMilestones = p.milestones?.length ?? 0;

  async function handleStatusChange(newStatus: string) {
    if (!project) return;
    try {
      const updated = await api.updateProject(propertyId, projectId, { status: newStatus as any });
      setProject(updated);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update status');
    }
  }

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-4xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/projects`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          All projects
        </Link>
      </Button>

      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{p.name}</h1>
          <StatusChip tone={projectStatusTone(p.status)}>{STATUS_LABELS[p.status] ?? p.status}</StatusChip>
        </div>
        <p className="text-sm text-slate-500">
          {PROJECT_TYPE_LABELS[p.projectType] ?? p.projectType} · {p.contractorName ?? (p.fulfillmentMode === 'DIY' ? 'DIY / household' : 'Provider not recorded')}
        </p>
      </div>

      <ProjectNav propertyId={propertyId} projectId={projectId} />

      {p.outcomeStatus && (
        <div className={`rounded-xl border p-3 ${p.outcomeStatus === 'VERIFIED_SUCCESS' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <p className="text-sm font-semibold">Outcome: {p.outcomeStatus.toLowerCase().replace(/_/g, ' ')}</p>
          <p className="mt-1 text-xs">
            Functional check: {p.functionalVerificationResult?.toLowerCase().replace(/_/g, ' ') ?? 'not recorded'}
            {p.actualCostCents != null ? ` · Final cost ${fmtMoney(p.actualCostCents)}` : ''}
            {p.followUpDueAt ? ` · Follow-up ${fmtDate(p.followUpDueAt)}` : ''}
          </p>
        </div>
      )}

      {/* Blocking issue banner */}
      {blockingIssues.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-rose-800">
              {blockingIssues.length} blocking issue{blockingIssues.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-rose-700 mt-0.5">Payments are on hold until resolved.</p>
            <Link
              href={`/dashboard/properties/${propertyId}/projects/${projectId}/issues`}
              className="text-xs font-semibold text-rose-800 underline mt-1 inline-block"
            >
              View issues
            </Link>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Contract"
          value={fmtMoney(p.currentContractAmountCents)}
          sub={p.approvedChangeOrderDeltaCents !== 0 ? `${p.approvedChangeOrderDeltaCents > 0 ? '+' : ''}${fmtMoney(Math.abs(p.approvedChangeOrderDeltaCents))} CO` : undefined}
        />
        <KpiTile
          label="Paid"
          value={fmtMoney(p.paidToDateCents)}
          sub={`${pct}%`}
        />
        <KpiTile
          label="Remaining"
          value={fmtMoney(remaining)}
          tone={remaining < 0 ? 'danger' : undefined}
        />
        <KpiTile
          label={daysLeft != null && daysLeft < 0 ? 'Days overdue' : 'Days left'}
          value={daysLeft != null ? Math.abs(daysLeft).toString() : '—'}
          tone={daysLeft != null && daysLeft < 0 ? 'danger' : daysLeft != null && daysLeft < 7 ? 'warn' : undefined}
          sub={p.expectedEndDate ? fmtDate(p.expectedEndDate) : undefined}
        />
      </div>

      {/* Progress bar */}
      {p.currentContractAmountCents > 0 && (
        <MobileCard variant="compact" className="space-y-2">
          <div className="flex justify-between text-xs text-slate-600">
            <span>Payment progress</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          {totalMilestones > 0 && (
            <div className="flex justify-between text-xs text-slate-500">
              <span>Milestones: {completedMilestones} / {totalMilestones} complete</span>
            </div>
          )}
        </MobileCard>
      )}

      {/* Next milestone */}
      {nextMilestone && (
        <MobileCard variant="compact" className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Next milestone</p>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{nextMilestone.name}</p>
              {nextMilestone.scheduledDate && (
                <p className="text-xs text-slate-500">Scheduled {fmtDate(nextMilestone.scheduledDate)}</p>
              )}
            </div>
            <StatusChip tone={milestoneStatusTone(nextMilestone.status)}>
              {MILESTONE_STATUS_LABELS[nextMilestone.status] ?? nextMilestone.status}
            </StatusChip>
          </div>
          {nextMilestone.requiresPhotoEvidence && (
            <p className="text-xs text-amber-700">Photo evidence required to complete</p>
          )}
          <Link
            href={`/dashboard/properties/${propertyId}/projects/${projectId}/milestones`}
            className="text-xs font-semibold text-slate-700 underline"
          >
            View all milestones
          </Link>
        </MobileCard>
      )}

      {/* Contract details */}
      <MobileCard className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Project details</h2>
        <dl className="space-y-2">
          {[
            ['Execution', p.contractorName ?? (p.fulfillmentMode === 'DIY' ? 'DIY / household' : 'Provider not recorded')],
            ['Path', p.executionPath ? p.executionPath.toLowerCase() : null],
            ['Funding', p.fundingMode?.toLowerCase().replace('_', ' ')],
            ['License', p.contractorLicense],
            ['Phone', p.contractorPhone],
            ['Email', p.contractorEmail],
            ['Start date', fmtDate(p.startDate)],
            ['Expected completion', fmtDate(p.expectedEndDate)],
            ['Actual completion', fmtDate(p.actualEndDate)],
            ['Warranty expires', fmtDate(p.warrantyExpiresAt)],
          ].filter(([, v]) => v && v !== '—').map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-slate-900 font-medium text-right max-w-[60%] truncate">{value}</dd>
            </div>
          ))}
        </dl>
        {p.description && (
          <p className="text-sm text-slate-600 border-t border-slate-100 pt-3">{p.description}</p>
        )}
      </MobileCard>

      {/* Open issues summary */}
      {openIssues.length > 0 && (
        <MobileCard variant="compact" className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Open issues ({openIssues.length})</p>
            <Link
              href={`/dashboard/properties/${propertyId}/projects/${projectId}/issues`}
              className="text-xs font-semibold text-slate-600 underline"
            >
              View all
            </Link>
          </div>
          {openIssues.slice(0, 3).map(issue => (
            <div key={issue.id} className="flex items-center gap-2 text-sm">
              <AlertTriangle className={`h-3.5 w-3.5 flex-shrink-0 ${issue.severity === 'BLOCKING' ? 'text-rose-500' : 'text-amber-500'}`} />
              <span className="truncate text-slate-700">{issue.title}</span>
            </div>
          ))}
        </MobileCard>
      )}

      {/* Quick actions */}
      <MobileCard className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Quick actions</h2>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11 text-sm" asChild>
            <Link href={`/dashboard/properties/${propertyId}/projects/${projectId}/log`}>
              <ClipboardList className="h-4 w-4 mr-1.5" />
              Add log entry
            </Link>
          </Button>
          {p.status !== 'COMPLETED' && (
            <Button variant="outline" className="h-11 text-sm" asChild>
              <Link href={`/dashboard/properties/${propertyId}/projects/${projectId}/completion`}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Completion
              </Link>
            </Button>
          )}
        </div>

        {p.status === 'IN_PROGRESS' && (
          <Button
            variant="outline"
            className="w-full h-11 text-sm text-amber-700 border-amber-300"
            onClick={() => handleStatusChange('PAUSED')}
          >
            Pause project
          </Button>
        )}
        {p.status === 'PAUSED' && (
          <Button
            variant="outline"
            className="w-full h-11 text-sm text-emerald-700 border-emerald-300"
            onClick={() => handleStatusChange('IN_PROGRESS')}
          >
            Resume project
          </Button>
        )}
        {p.status === 'DRAFT' && (
          <Button
            className="w-full h-11 text-sm"
            onClick={() => handleStatusChange('IN_PROGRESS')}
          >
            Start project
          </Button>
        )}
      </MobileCard>
    </MobilePageContainer>
  );
}
