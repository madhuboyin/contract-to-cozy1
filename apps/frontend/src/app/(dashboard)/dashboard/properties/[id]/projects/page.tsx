'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronRight, Plus } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ProjectRecord } from '@/types';
import { Button } from '@/components/ui/button';
import {
  EmptyStateCard,
  MobileCard,
  MobilePageContainer,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import DetailTemplate from '../components/route-templates/DetailTemplate';
import {
  PROJECT_TYPE_LABELS,
  fmtDate,
  fmtMoney,
  projectStatusTone,
  Spinner,
  ErrorBanner,
} from './ProjectTrackerHelpers';
import { projectTrackerLaunchQuery } from '@/features/tools/projectTrackerLaunchContext';

function projectStatusLabel(s: ProjectRecord['status']) {
  const labels: Record<string, string> = {
    DRAFT: 'Draft', PLANNING: 'Planning', IN_PROGRESS: 'In Progress',
    PAUSED: 'Paused', COMPLETED: 'Completed', CANCELLED: 'Cancelled', DISPUTED: 'Disputed',
  };
  return labels[s] ?? s;
}

export default function ProjectsHubPage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const launchQuery = projectTrackerLaunchQuery(searchParams);
  const launchSuffix = launchQuery ? `?${launchQuery}` : '';

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.listProjects(propertyId);
      setProjects(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  const active = projects.filter(p => !['COMPLETED', 'CANCELLED'].includes(p.status));
  const done = projects.filter(p => p.status === 'COMPLETED');
  const cancelled = projects.filter(p => p.status === 'CANCELLED');

  const totalSpend = done.reduce((sum, p) => sum + p.paidToDateCents, 0);

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-4xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to property
        </Link>
      </Button>

      <DetailTemplate
        title="Project Tracker"
        subtitle="Track every contractor project from signed contract through completion and warranty."
      >
        {/* Total spend bar */}
        {totalSpend > 0 && (
          <MobileCard variant="compact" className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Lifetime spend (completed)</p>
              <p className="text-xl font-bold text-slate-900">{fmtMoney(totalSpend)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">{done.length} project{done.length !== 1 ? 's' : ''} completed</p>
            </div>
          </MobileCard>
        )}

        <div className="flex justify-end">
          <Button className="min-h-[44px] gap-1.5" asChild>
            <Link href={`/dashboard/properties/${propertyId}/projects/new${launchSuffix}`}>
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          </Button>
        </div>

        {error && <ErrorBanner msg={error} />}
        {loading && !projects.length ? <Spinner /> : null}

        {!loading && projects.length === 0 && (
          <EmptyStateCard
            title="No projects yet"
            description="Start tracking your first renovation or repair project — milestones, payments, change orders, and progress photos all in one place."
          />
        )}

        {active.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Active projects</h2>
            {active.map(p => (
              <ProjectCard key={p.id} project={p} propertyId={propertyId} />
            ))}
          </section>
        )}

        {done.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Completed</h2>
            {done.map(p => (
              <ProjectCard key={p.id} project={p} propertyId={propertyId} />
            ))}
          </section>
        )}

        {cancelled.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-500">Cancelled</h2>
            {cancelled.map(p => (
              <ProjectCard key={p.id} project={p} propertyId={propertyId} dimmed />
            ))}
          </section>
        )}
      </DetailTemplate>
    </MobilePageContainer>
  );
}

function ProjectCard({ project: p, propertyId, dimmed }: { project: ProjectRecord; propertyId: string; dimmed?: boolean }) {
  const remaining = p.currentContractAmountCents - p.paidToDateCents;
  return (
    <Link href={`/dashboard/properties/${propertyId}/projects/${p.id}`} className="block">
      <MobileCard variant="compact" className={`flex items-center gap-3 hover:bg-slate-50 transition-colors ${dimmed ? 'opacity-50' : ''}`}>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{p.name}</p>
            <StatusChip tone={projectStatusTone(p.status)}>{projectStatusLabel(p.status)}</StatusChip>
          </div>
          <p className="text-xs text-slate-500">
            {PROJECT_TYPE_LABELS[p.projectType] ?? p.projectType} · {p.contractorName ?? (p.fulfillmentMode === 'DIY' ? 'DIY / household' : 'Provider not recorded')}
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span>Contract: {fmtMoney(p.currentContractAmountCents)}</span>
            <span>Paid: {fmtMoney(p.paidToDateCents)}</span>
            {p.status !== 'COMPLETED' && <span>Remaining: {fmtMoney(remaining)}</span>}
            {p.expectedEndDate && p.status !== 'COMPLETED' && (
              <span>Due: {fmtDate(p.expectedEndDate)}</span>
            )}
            {p.warrantyExpiresAt && p.status === 'COMPLETED' && (
              <span>Warranty exp: {fmtDate(p.warrantyExpiresAt)}</span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
      </MobileCard>
    </Link>
  );
}
