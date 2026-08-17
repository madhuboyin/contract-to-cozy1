'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardCheck, FolderLock, House, MessageCircle, Wrench } from 'lucide-react';
import type { BuyerRecentOwnerTransition } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics/events';

const STAGE_LABELS: Record<BuyerRecentOwnerTransition['journey']['stage'], string> = {
  CLOSED: 'Closing complete',
  MOVE_IN: 'Move-in',
  FIRST_30_DAYS: 'First 30 days',
  DAYS_31_TO_90: 'Days 31–90',
};

export function RecentOwnerTransition({ transition }: { transition: BuyerRecentOwnerTransition }) {
  const { property, journey, evidence, routes } = transition;
  const ownerDay = Math.min(journey.daysSinceOwnershipStart + 1, 90);

  React.useEffect(() => {
    track('buyer_recent_owner_transition_viewed', {
      propertyId: property.id,
      stage: journey.stage,
      daysSinceOwnershipStart: journey.daysSinceOwnershipStart,
      progressPercent: journey.progress.percent,
    });
  }, [journey.daysSinceOwnershipStart, journey.progress.percent, journey.stage, property.id]);

  return (
    <section className="mx-auto w-full max-w-6xl overflow-hidden rounded-[28px] border border-teal-200 bg-gradient-to-br from-teal-950 via-teal-900 to-slate-900 p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">Recent owner · Day {ownerDay} of 90</Badge>
            <Badge className="bg-teal-300 text-teal-950 hover:bg-teal-300">{STAGE_LABELS[journey.stage]}</Badge>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Welcome home. Your first 90 days are organized.</h1>
          <p className="mt-2 text-sm text-teal-50 sm:text-base">
            {property.address}, {property.city}, {property.state} {property.zipCode}
          </p>
          <p className="mt-3 max-w-xl text-sm text-teal-100">
            Your closing history is preserved while the full homeowner dashboard, Home Record, and ongoing Home Operations are now available—no setup restart required.
          </p>
        </div>
        <Button asChild className="min-h-11 bg-white text-teal-950 hover:bg-teal-50">
          <Link href={routes.plan}>Continue 90-day plan <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-teal-100">First-90-day progress</p>
          <p className="mt-1 font-semibold">{journey.progress.resolved} of {journey.progress.total} resolved</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-teal-300" style={{ width: `${journey.progress.percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-teal-100">{journey.progress.active} active task{journey.progress.active === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-teal-100">Records carried forward</p>
          <p className="mt-1 font-semibold">{evidence.documentCount} documents · {evidence.inspectionReportCount} inspections</p>
          <p className="mt-2 text-xs text-teal-100">{evidence.verifiedDocumentCount} verified · {evidence.openMaterialFindingCount} material findings open</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-teal-100">Homeowner workspace</p>
          <p className="mt-1 font-semibold">Live below this transition</p>
          <p className="mt-2 text-xs text-teal-100">Your normal Home recommendations and signals remain available.</p>
        </div>
      </div>

      <nav aria-label="Recent owner shortcuts" className="mt-5 flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm"><Link href={routes.timeline}><House className="mr-2 h-4 w-4" />Home Record milestone</Link></Button>
        <Button asChild variant="secondary" size="sm"><Link href={routes.homeRecords}><FolderLock className="mr-2 h-4 w-4" />Home Records</Link></Button>
        <Button asChild variant="secondary" size="sm"><Link href={routes.homeOperations}><Wrench className="mr-2 h-4 w-4" />Home Operations</Link></Button>
        <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white"><Link href={routes.ask}><MessageCircle className="mr-2 h-4 w-4" />Ask Cozy</Link></Button>
        <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white"><Link href={routes.plan}><ClipboardCheck className="mr-2 h-4 w-4" />First 90 days</Link></Button>
      </nav>
    </section>
  );
}
